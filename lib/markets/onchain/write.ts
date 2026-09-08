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
/* Address + amount encoding                               */
/* ------------------------------------------------------ */

const SELECTOR = {
  approve: "0x095ea7b3" as const,
} as const

function padAddress(addr: string): string {
  const cleaned = addr.startsWith("0x") ? addr.slice(2) : addr
  if (!/^[a-fA-F0-9]{40}$/.test(cleaned)) {
    throw new Error(`Invalid address: ${addr}`)
  }
  return cleaned.toLowerCase().padStart(64, "0")
}

function padUint256(n: bigint): string {
  if (n < BigInt(0)) {
    throw new Error(`Negative amount: ${n.toString()}`)
  }
  return n.toString(16).padStart(64, "0")
}

function encodeApprove(spender: Address, amount: bigint): `0x${string}` {
  return `${SELECTOR.approve}${padAddress(spender)}${padUint256(amount)}` as `0x${string}`
}

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

export const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1)

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
    data = encodeApprove(args.spender, args.amount)
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
  // registry. The actual calldata construction lives in the future
  // verified-ABI module. Until that ships, refuse to send.
  return {
    ok: false,
    error: {
      stage: "protocol-not-configured",
      message:
        "Morpho Blue supply() ABI implementation has not been " +
        "wired in this phase. Address + selector + ABI source " +
        "all need to come from the same verified source.",
    },
  }
}
