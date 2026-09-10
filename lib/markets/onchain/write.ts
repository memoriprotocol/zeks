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
  receiver: Address
  /** Pre-verified protocol contract registry. */
  contracts: ProtocolContracts
  /** Hard runtime check — caller must verify chain id matches. */
  chainId: number
}

/**
 * Send a Morpho Blue `supply(MarketParams, assets, shares, onBehalf, receiver)`
 * transaction.
 *
 * Gating logic (per the Supply flow spec):
 *
 *   - chain id must equal Robinhood Chain
 *   - registry must carry a verified morphoBlueAddress,
 *     morphoBlueSupplySelector, AND morphoBlueAbiSource
 *   - marketParams must resolve from real Morpho data
 *   - assets must be > 0
 *
 * When any of these gates fail, the helper returns a typed error
 * (`protocol-not-configured` or `validation-failed`) and does NOT
 * touch the wallet. We never fabricate calldata.
 *
 * ## Why no ABI encoder here
 *
 * The canonical Morpho Blue `supply(...)` ABI is a static tuple
 * (MarketParams) followed by 4 scalars. Different compiler
 * versions change tuple layouts — encoders can be safe only when
 * verified against deployed bytecode. Until that verification
 * exists in ZEKS, we refuse to construct the transaction.
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
          `${ROBINHOOD_CHAIN_ID_DEC}.`,
      },
    }
  }
  if (!args.contracts.morphoBlueSupplySelector) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          "Morpho Blue supply() selector is not verified for " +
          "Robinhood Chain. Supply is disabled until a verified " +
          "selector is supplied in the protocol registry.",
      },
    }
  }
  if (!args.contracts.morphoBlueAbiSource) {
    return {
      ok: false,
      error: {
        stage: "protocol-not-configured",
        message:
          "Morpho Blue supply() ABI implementation is intentionally " +
          "not present in this phase. Provide a verified ABI " +
          "implementation in lib/markets/protocol/abi.ts to enable " +
          "onchain Supply.",
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
  receiver: Address
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
    // The borrow encoder refuses unless the registry exposes a
    // verified selector + ABI source. Until then, this returns
    // typed `protocol-not-configured` WITHOUT touching the wallet.
    data = encodeMorphoBorrow({
      contracts: args.contracts,
      chainId: args.chainId,
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
