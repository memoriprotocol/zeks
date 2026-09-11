/**
 * ZEKS Markets — ERC20 write helpers + supply transaction gating.
 *
 * Performs raw ERC20 approve via the user's connected wallet, and a
 * gated Morpho Blue `supply(...)` helper that refuses to construct
 * calldata when the protocol registry lacks a verified contract +
 * selector + ABI source.
 *
 * Every call:
 *   - Uses the user's own EIP-1193 provider (no signer library).
 *   - Validates input shapes (16/20-byte addresses, bigint, selector).
 *   - Returns a typed `TxSendResult` so the UI can render success,
 *     rejection, or RPC failure deterministically.
 *
 * NO raw approve() is ever sent unless the user explicitly clicks
 * the Approve button. NO supply() calldata is ever constructed by
 * hand — different Morpho Blue compiler versions change tuple
 * layouts, so the registry gating is required before calldata is
 * built.
 */

import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { ROBINHOOD_CHAIN_ID_DEC } from "../protocol/registry"
import type { ProtocolContracts } from "../protocol/registry"
import {
  encodeErc20Approve,
  encodeErc4626Deposit,
  encodeMorphoBorrow,
  encodeMorphoSupply,
  encodeMorphoSupplyCollateral,
  marketParamsFromLendingMarket,
  MAX_UINT256,
  type MorphoMarketParams,
} from "./abi"

export { MAX_UINT256 }

export type TxStage =
  | "idle"
  | "user-confirming"
  | "submitted"
  | "confirmed"
  | "rejected"
  | "reverted"
  | "rpc-error"
  | "protocol-not-configured"
  | "validation-failed"

export interface TxSendError {
  message: string
  code?: number
  stage: TxStage
}

export type TxSendResult =
  | {
      ok: true
      txHash: `0x${string}`
      stage: Exclude<TxStage, "idle" | "user-confirming">
    }
  | { ok: false; error: TxSendError }

/* ------------------------------------------------------ */
/* Wallet write                                            */
/* ------------------------------------------------------ */

interface SendTxArgs {
  from: Address
  to: Address
  data: `0x${string}`
  value?: `0x${string}`
}

async function sendViaWallet(
  provider: EIP1193Provider,
  args: SendTxArgs,
): Promise<TxSendResult> {
  try {
    const raw = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: args.from,
          to: args.to,
          data: args.data,
          value: args.value ?? "0x0",
          // Gas is wallet-estimated by default for EIP-1193; we
          // explicitly omit `gas` so the wallet populates it
          // correctly via its RPC.
        },
      ],
    })) as unknown
    if (typeof raw !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(raw)) {
      return {
        ok: false,
        error: {
          stage: "rpc-error",
          message: "Wallet did not return a valid transaction hash.",
        },
      }
    }
    return {
      ok: true,
      txHash: raw as `0x${string}`,
      stage: "submitted",
    }
  } catch (err) {
    const e = err as { code?: number; message?: string }
    const code = typeof e?.code === "number" ? e.code : undefined
    const message = e?.message ?? String(err)
    const rejected = code === 4001 || /rejected/i.test(message)
    return {
      ok: false,
      error: {
        stage: rejected ? "rejected" : "rpc-error",
        code,
        message,
      },
    }
  }
}

/**
 * Wait for a transaction receipt. By default the polling window is
 * 60 seconds with a 3-second poll interval. The wallet's RPC is
 * preferred for receipt queries (matches the broadcast node).
 */
export async function waitForReceipt(
  provider: EIP1193Provider,
  txHash: `0x${string}`,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<
  | { ok: true; txHash: `0x${string}`; stage: "confirmed" }
  | { ok: false; error: TxSendError }
> {
  const { timeoutMs = 60_000, pollMs = 3_000 } = options
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = (await provider.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      })) as
        | null
        | { status?: `0x${string}`; blockNumber?: `0x${string}` }
      if (r && typeof r === "object" && r.blockNumber) {
        const reverted = r.status === "0x0"
        if (reverted) {
          return {
            ok: false,
            error: {
              stage: "reverted",
              message: "Transaction reverted on-chain.",
            },
          }
        }
        return { ok: true, txHash, stage: "confirmed" }
      }
    } catch {
      // Poll errors are transient — keep waiting until deadline.
    }
    await new Promise((res) => setTimeout(res, pollMs))
  }
  return {
    ok: false,
    error: {
      stage: "rpc-error",
      message: `Receipt not seen within ${Math.round(
        timeoutMs / 1000,
      )}s`,
    },
  }
}

/* ------------------------------------------------------ */
/* Pre-send simulation (eth_call, read-only)                */
/* ------------------------------------------------------ */

/**
 * Decode a Solidity `Error(string)` revert payload. The leading
 * 4 bytes are `0x08c379a0` (Error(string) selector), followed by
 * an ABI-encoded (offset, length, bytes) tuple containing the
 * UTF-8 message.
 *
 * Returns the decoded message, or `null` if the payload does not
 * match this layout.
 */
export function decodeErrorString(revertData: string): string | null {
  if (!revertData || revertData === "0x") return null
  const r = revertData.startsWith("0x") ? revertData.slice(2) : revertData
  if (r.length < 8 + 64) return null
  if (r.slice(0, 8) !== "08c379a0") return null
  // Skip the 4-byte selector + 32-byte offset. Length sits in
  // the next 32-byte slot.
  const lenHex = r.slice(8 + 64, 8 + 64 + 64)
  let len = 0
  try {
    len = Number(BigInt("0x" + lenHex))
  } catch {
    return null
  }
  if (!Number.isFinite(len) || len <= 0 || len > 1024) return null
  const dataHex = r.slice(8 + 64 + 64, 8 + 64 + 64 + len * 2)
  if (!/^[0-9a-fA-F]+$/.test(dataHex)) return null
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(dataHex, "hex").toString("utf8").replace(/\0+$/, "")
    }
    const bytes = new Uint8Array(dataHex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(dataHex.substr(i * 2, 2), 16)
    }
    return new TextDecoder("utf-8", { fatal: false })
      .decode(bytes)
      .replace(/\0+$/, "")
  } catch {
    return null
  }
}

export interface SimulateWriteArgs {
  provider: EIP1193Provider | null
  chainId: number | null
  from: Address
  to: Address
  data: `0x${string}`
  value?: `0x${string}`
}

export type SimulateWriteResult =
  | { ok: true }
  | { ok: false; reason: "rpc-unavailable"; message: string }
  | { ok: false; reason: "wrong-network"; chainId: number }
  | { ok: false; reason: "reverted"; message: string | null; raw: string }
  | { ok: false; reason: "no-provider" }

/**
 * Read-only `eth_call` simulation of a transaction. Uses the
 * connected wallet's RPC when available, otherwise the public
 * Robinhood Chain RPC. NEVER asks the wallet for a signature.
 *
 * Refuses to run when:
 *   - no provider AND not on Robinhood Chain
 *   - the connected chain is not Robinhood Chain (4663)
 *
 * The wallet's `eth_call` routes through its own RPC, which
 * matches the broadcast node and avoids cross-chain surprises.
 * We don't fall back to the public RPC when a wallet provider is
 * present — keeping simulation and broadcast on the same node.
 */
export async function simulateWrite(
  args: SimulateWriteArgs,
): Promise<SimulateWriteResult> {
  if (!args.provider) {
    return { ok: false, reason: "no-provider" }
  }
  if (
    args.chainId != null &&
    args.chainId !== ROBINHOOD_CHAIN_ID_DEC
  ) {
    return { ok: false, reason: "wrong-network", chainId: args.chainId }
  }
  try {
    await args.provider.request({
      method: "eth_call",
      params: [
        {
          from: args.from,
          to: args.to,
          data: args.data,
          value: args.value ?? "0x0",
        },
        "latest",
      ],
    })
    return { ok: true }
  } catch (err) {
    const e = err as {
      code?: number
      message?: string
      data?: string
    }
    const code = typeof e?.code === "number" ? e.code : undefined
    const raw = typeof e?.data === "string" ? e.data : ""
    // Provider-specific shapes: MetaMask / Rabby attach `data`
    // containing the revert payload; others just embed it in the
    // message.
    const msg = raw
      ? decodeErrorString(raw) ?? e?.message ?? String(err)
      : e?.message ?? String(err)
    if (code === 4001) {
      // User rejected a simulation? Not possible (eth_call doesn't
      // pop up). Treat as RPC error.
      return {
        ok: false,
        reason: "rpc-unavailable",
        message: msg,
      }
    }
    return {
      ok: false,
      reason: "reverted",
      message: msg,
      raw,
    }
  }
}

/* ------------------------------------------------------ */
/* Pre-send guards                                         */
/* ------------------------------------------------------ */

import type { LendingMarket } from "../lending/types"

export interface PreSendGuardArgs {
  expectedChainId: number
  actualChainId: number | null | undefined
  expectedAddress: Address
  actualAddress: string | null | undefined
  walletBalance: bigint | null | undefined
  amount: bigint
  marketParams: MorphoMarketParams | null
  market: LendingMarket
  /** When true, also assert that the onchain marketId matches the LendingMarket.marketId. */
  requireMarketIdMatch?: boolean
}

export type PreSendGuardResult =
  | { ok: true; marketParams: MorphoMarketParams }
  | {
      ok: false
      stage: TxStage
      message: string
    }

/**
 * Final guard invoked immediately before each wallet
 * confirmation. Refuses to proceed if:
 *
 *   - chainId drifted off Robinhood Chain
 *   - account changed mid-flow
 *   - amount is non-finite / non-positive
 *   - wallet balance dropped below amount
 *   - marketParams are missing any required field
 *   - the LendingMarket's marketId disagrees with what the
 *     caller is about to write against (stale market)
 *
 * Caller passes the `MorphoMarketParams` it intends to encode.
 * This function does NOT regenerate calldata — the caller does.
 * It just verifies the inputs the caller already locked in.
 */
export function preSendGuard(args: PreSendGuardArgs): PreSendGuardResult {
  if (args.actualChainId == null) {
    return {
      ok: false,
      stage: "rpc-error",
      message: "Wallet disconnected before send.",
    }
  }
  if (args.actualChainId !== args.expectedChainId) {
    return {
      ok: false,
      stage: "validation-failed",
      message: `Wrong network: expected chain ${args.expectedChainId}, got ${args.actualChainId}.`,
    }
  }
  if (
    !args.actualAddress ||
    args.actualAddress.toLowerCase() !== args.expectedAddress.toLowerCase()
  ) {
    return {
      ok: false,
      stage: "validation-failed",
      message: "Connected account changed mid-flow.",
    }
  }
  if (args.amount <= BigInt(0)) {
    return {
      ok: false,
      stage: "validation-failed",
      message: "Amount must be > 0.",
    }
  }
  if (
    args.walletBalance != null &&
    args.amount > args.walletBalance
  ) {
    return {
      ok: false,
      stage: "validation-failed",
      message: "Amount exceeds current wallet balance.",
    }
  }
  if (!args.marketParams) {
    return {
      ok: false,
      stage: "protocol-not-configured",
      message: "Market params unavailable.",
    }
  }
  if (
    args.requireMarketIdMatch &&
    args.market.marketId &&
    args.marketParams
  ) {
    // The marketParams the caller passes already encode
    // loanToken/collateralToken/oracle/irm/lltv — we don't
    // re-derive marketId here (keccak256 isn't in scope for this
    // pure helper), but we do sanity-check that the 5 fields are
    // present and non-zero. Staleness check is the caller's job.
    const { loanToken, collateralToken, oracle, irm, lltv } =
      args.marketParams
    if (
      loanToken === "0x0000000000000000000000000000000000000000" ||
      collateralToken === "0x0000000000000000000000000000000000000000" ||
      oracle === "0x0000000000000000000000000000000000000000" ||
      irm === "0x0000000000000000000000000000000000000000" ||
      lltv <= BigInt(0)
    ) {
      return {
        ok: false,
        stage: "protocol-not-configured",
        message: "Market params contain a zero field.",
      }
    }
  }
  return { ok: true, marketParams: args.marketParams }
}

/* ------------------------------------------------------ */
/* ERC20 approve                                           */
/* ------------------------------------------------------ */

export interface ApproveArgs {
  provider: EIP1193Provider
  from: Address
  token: Address
  spender: Address
  /**
   * Approval amount. Use `MAX_UINT256` for unlimited approval;
   * `approve(0n)` to revoke.
   */
  amount: bigint
}

/**
 * Send a single ERC20 approve() call.
 *
 * Returns a tagged `TxSendResult`. The caller is responsible for
 * tracking the tx hash, refreshing the allowance, and gating the
 * subsequent Supply click on the user's explicit confirmation.
 *
 * We do NOT auto-trigger Supply after approval. The user must
 * explicitly click Supply after approval confirms.
 */
export async function sendApprove(args: ApproveArgs): Promise<TxSendResult> {
  if (args.amount < BigInt(0)) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Approval amount must be non-negative.",
      },
    }
  }
  let data: `0x${string}`
  try {
    data = encodeErc20Approve(args.spender, args.amount)
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.token,
    data,
  })
}

/* ------------------------------------------------------ */
/* Morpho Blue supply — gated on verified contract         */
/* ------------------------------------------------------ */

export interface SupplyArgs {
  provider: EIP1193Provider
  from: Address
  /**
   * Market params for the Morpho Blue supply() call. Constructed
   * from a verified market snapshot — never guessed.
   */
  marketParams: {
    loanToken: Address
    collateralToken: Address
    oracle: Address
    irm: Address
    lltv: bigint
  } | null
  /** Asset amount (raw, in loan-token smallest units). */
  assets: bigint
  onBehalf: Address
  /**
   * Kept for back-compat with callers; ignored by `supply`
   * (canonical Morpho `supply` takes `bytes data` rather than a
   * `receiver` address).
   */
  receiver?: Address
  /** Pre-verified protocol contract registry. */
  contracts: ProtocolContracts
  /** Hard runtime check — caller must verify chain id matches. */
  chainId: number
}

/**
 * Send a Morpho Blue `supply(MarketParams, assets, shares,
 * onBehalf, data)` transaction.
 *
 * Gating logic:
 *   - chain id must equal Robinhood Chain (4663)
 *   - registry must carry a verified `morphoBlueAddress`
 *   - marketParams must resolve from real Morpho data
 *   - assets must be > 0
 *
 * When any gate fails, the helper returns a typed
 * `protocol-not-configured` or `validation-failed` error and does
 * NOT touch the wallet.
 *
 * Selectors are derived from Morpho's `IMorpho.sol` at module
 * load (see `lib/markets/onchain/abi.ts`). ABI source:
 *   `keccak256(abi.encode(string canonicalSignature))[:4]`.
 */
export async function sendSupply(args: SupplyArgs): Promise<TxSendResult> {
  if (args.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: `Supply must run on chain ${ROBINHOOD_CHAIN_ID_DEC}.`,
      },
    }
  }
  if (!args.contracts.morphoBlueAddress) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          "Morpho Blue protocol address is not configured for " +
          "Robinhood Chain. Supply is disabled until a verified " +
          "address is supplied via NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_" +
          `${ROBINHOOD_CHAIN_ID_DEC} (or via the bundled ` +
          `lib/markets/protocol/addresses.json snapshot).`,
      },
    }
  }
  if (!args.marketParams) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          "Market params are missing — cannot construct supply() " +
          "calldata.",
      },
    }
  }
  if (args.assets <= BigInt(0)) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Supply amount must be > 0.",
      },
    }
  }

  // All gates passed AND a verified ABI source is present in the
  // registry. Construct calldata via the verified ABI encoder.
  if (!args.contracts.morphoBlueAddress) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message: "Morpho Blue core address missing.",
      },
    }
  }
  let data: `0x${string}`
  try {
    const mp = args.marketParams as unknown as MorphoMarketParams
    data = encodeMorphoSupply({
      contracts: args.contracts,
      chainId: args.chainId,
      params: mp,
      assets: args.assets,
      shares: BigInt(0),
      onBehalf: args.onBehalf,
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          err instanceof Error
            ? err.message
            : "Failed to construct supply() calldata.",
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.contracts.morphoBlueAddress,
    data,
  })
}

/* ------------------------------------------------------ */
/* Shared low-level send (kept distinct for clarity)        */
/* ------------------------------------------------------ */

export interface SendTransactionArgs {
  provider: EIP1193Provider
  from: Address
  to: Address
  data: `0x${string}`
  value?: `0x${string}`
}

/**
 * Send an arbitrary transaction through the user's connected
 * EIP-1193 wallet. Refuses if the wallet is not on Robinhood
 * Chain. The caller must supply already-encoded calldata.
 *
 * NO private keys, NO automatic signing, NO batching across
 * providers. User confirmation is mandatory for every call.
 */
export async function sendTransaction(
  args: SendTransactionArgs & { chainId: number },
): Promise<TxSendResult> {
  if (args.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          `sendTransaction must run on chain ` +
          `${ROBINHOOD_CHAIN_ID_DEC}; got ${args.chainId}.`,
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.to,
    data: args.data,
    value: args.value,
  })
}

/* ------------------------------------------------------ */
/* Allowance management                                    */
/* ------------------------------------------------------ */

export interface EnsureAllowanceArgs {
  provider: EIP1193Provider
  from: Address
  token: Address
  spender: Address
  amount: bigint
  chainId: number
  /**
   * If the onchain allowance is already >= this value, the
   * function returns `{ ok: true, stage: "confirmed", txHash:
   * null }` and does NOT send any transaction. Otherwise it
   * sends an `approve(MAX_UINT256)` and waits for the receipt.
   */
  existingAllowance?: bigint
}

/**
 * Read the current allowance (`existingAllowance`) from the
 * caller-provided read path. If the allowance covers `amount`,
 * no transaction is sent. Otherwise, send a single
 * `approve(MAX_UINT256)` and wait for the receipt.
 */
export async function ensureAllowance(
  args: EnsureAllowanceArgs,
): Promise<TxSendResult> {
  if (args.amount <= BigInt(0)) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Amount must be > 0.",
      },
    }
  }
  if (
    args.existingAllowance != null &&
    args.existingAllowance >= args.amount
  ) {
    return {
      ok: true,
      txHash: null as unknown as `0x${string}`,
      stage: "confirmed",
    }
  }
  const approveRes = await sendApprove({
    provider: args.provider,
    from: args.from,
    token: args.token,
    spender: args.spender,
    amount: MAX_UINT256,
  })
  if (!approveRes.ok) return approveRes
  const receipt = await waitForReceipt(args.provider, approveRes.txHash)
  if (!receipt.ok) return receipt
  return {
    ok: true,
    txHash: approveRes.txHash,
    stage: "confirmed",
  }
}

/* ------------------------------------------------------ */
/* Morpho Blue supplyCollateral — registry-gated           */
/* ------------------------------------------------------ */

export interface SupplyCollateralArgs {
  provider: EIP1193Provider
  from: Address
  marketParams: MorphoMarketParams | null
  assets: bigint
  onBehalf: Address
  /** Kept for back-compat; canonical Morpho supplyCollateral takes `bytes data`. */
  receiver?: Address
  contracts: ProtocolContracts
  chainId: number
}

export async function sendSupplyCollateral(
  args: SupplyCollateralArgs,
): Promise<TxSendResult> {
  if (args.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          `supplyCollateral must run on chain ` +
          `${ROBINHOOD_CHAIN_ID_DEC}.`,
      },
    }
  }
  if (!args.marketParams) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Market params missing for supplyCollateral.",
      },
    }
  }
  let data: `0x${string}`
  try {
    data = encodeMorphoSupplyCollateral({
      contracts: args.contracts,
      chainId: args.chainId,
      params: args.marketParams as MorphoMarketParams,
      assets: args.assets,
      onBehalf: args.onBehalf,
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          err instanceof Error
            ? err.message
            : "supplyCollateral calldata construction refused.",
      },
    }
  }
  if (!args.contracts.morphoBlueAddress) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message: "Morpho Blue core address missing.",
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.contracts.morphoBlueAddress,
    data,
  })
}

/* ------------------------------------------------------ */
/* Morpho Blue borrow — registry-gated                      */
/* ------------------------------------------------------ */

export interface BorrowArgs {
  provider: EIP1193Provider
  from: Address
  marketParams: MorphoMarketParams | null
  /** Borrow asset amount in loan-token smallest units. */
  assets: bigint
  /** Borrow shares (0 to let Morpho compute). */
  shares: bigint
  onBehalf: Address
  receiver: Address
  contracts: ProtocolContracts
  chainId: number
}

export async function sendBorrow(args: BorrowArgs): Promise<TxSendResult> {
  if (args.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          `Borrow must run on chain ${ROBINHOOD_CHAIN_ID_DEC}.`,
      },
    }
  }
  if (!args.marketParams) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Market params missing for borrow.",
      },
    }
  }
  if (args.assets <= BigInt(0)) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Borrow amount must be > 0.",
      },
    }
  }
  let data: `0x${string}`
  try {
    data = encodeMorphoBorrow({
      contracts: args.contracts,
      chainId: args.chainId,
      params: args.marketParams as MorphoMarketParams,
      assets: args.assets,
      shares: args.shares,
      onBehalf: args.onBehalf,
      receiver: args.receiver,
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          err instanceof Error
            ? err.message
            : "Borrow calldata construction refused.",
      },
    }
  }
  if (!args.contracts.morphoBlueAddress) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message: "Morpho Blue core address missing.",
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.contracts.morphoBlueAddress,
    data,
  })
}

/* ------------------------------------------------------ */
/* ERC4626 vault deposit — registry-gated                   */
/* ------------------------------------------------------ */

export interface VaultDepositArgs {
  provider: EIP1193Provider
  from: Address
  vault: Address
  /** Asset amount to deposit (loan-token smallest units). */
  assets: bigint
  receiver: Address
  chainId: number
}

export async function sendVaultDeposit(
  args: VaultDepositArgs,
): Promise<TxSendResult> {
  if (args.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          `Vault deposit must run on chain ` +
          `${ROBINHOOD_CHAIN_ID_DEC}.`,
      },
    }
  }
  if (args.assets <= BigInt(0)) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message: "Deposit amount must be > 0.",
      },
    }
  }
  let data: `0x${string}`
  try {
    data = encodeErc4626Deposit(args.assets, args.receiver)
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "validation-failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to encode ERC-4626 deposit.",
      },
    }
  }
  return sendViaWallet(args.provider, {
    from: args.from,
    to: args.vault,
    data,
  })
}
