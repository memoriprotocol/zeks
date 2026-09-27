"use client"

/**
 * useBorrowReadiness — read-only borrow gate.
 *
 * Phase F7A. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: determine whether the connected wallet is ready to send a
 * Morpho Blue `borrow(...)` transaction against a market that already
 * has `availableBorrowCapacity > 0` from the F6A verified risk gate.
 *
 * This hook follows the F2A (loan-token supply) and F5D (collateral
 * supply) pattern exactly — it never reads chain state directly. The
 * caller is responsible for:
 *
 *   - providing the F6A `availableBorrowCapacity` (bigint, loan-token
 *     units) via the `capacity` field
 *   - providing the loan-token decimals and address (for parsing only)
 *   - deciding what to do when readiness is `ready-to-borrow` —
 *     e.g. instantiate `useBorrowTransaction` (F6B) as the writer
 *
 * State machine:
 *
 *   Disconnected
 *     -> WrongNetwork (wallet on chain != 4663)
 *     -> Loading          (capacity not yet known)
 *     -> ReadyToBorrow    (amount > 0, amount <= capacity, has supply
 *                          position so the user is a known counterparty)
 *     -> NoCapacity       (capacity == 0)
 *     -> ExceedsCapacity  (amount > capacity)
 *     -> InvalidAmount    (NaN / negative / zero / no loan token)
 *     -> NoMarket         (no market id / no oracle / no LLTV)
 *
 * The hook NEVER substitutes MAX_UINT256.
 * The hook NEVER fabricates a capacity number — if `capacity` is null
 * the state is Loading.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export type BorrowReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "loading" }
  | {
      kind: "ready-to-borrow"
      /** Maximum borrow amount the F6A gate permits (loan-token units). */
      capacity: bigint
      /** The user's typed amount (parsed to loan-token units). */
      amount: bigint
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "no-capacity"
      /** Why capacity is zero. Used for UI copy only — not a synthetic value. */
      reason: "no-collateral" | "no-debt-headroom" | "no-market-liquidity" | "no-market-id"
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "exceeds-capacity"
      /** The user's typed amount. */
      attempted: bigint
      /** Maximum allowed by the F6A gate. */
      capacity: bigint
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "invalid-amount"
      reason:
        | "zero"
        | "nan"
        | "negative"
        | "no-loan-token"
        | "no-market-id"
        | "no-loan-decimals"
    }

export interface BorrowReadinessInput {
  market: LendingMarket
  /** Typed amount string from the borrow input field. */
  amount: string
  /**
   * Loan-token metadata — for parsing the typed string to a raw bigint
   * and for UI-facing error copy.
   */
  loanToken: {
    address: `0x${string}` | null
    symbol: string | null
    decimals: number | null
  }
  /**
   * `availableBorrowCapacity` from the F6A `useBorrowCapacity` hook.
   * `null` means the gate is still loading.
   *
   * NOTE: This hook NEVER invents a capacity. If the caller passes null,
   * the state is Loading.
   */
  capacity: bigint | null
  /**
   * Optional: `availableBorrowCapacity > 0` from F6A is sufficient to
   * surface `no-capacity` precisely. Callers may precompute a reason
   * by inspecting `collateralRaw` and `borrowedAssets` themselves;
   * when omitted, `no-capacity` carries the most conservative reason
   * `"no-collateral"` which is the only reason a Morpho Blue vault can
   * refuse a borrow for non-protocol reasons (without debt, no
   * borrow would ever drop capacity; with debt, capacity == 0 means
   * the user is at or above LLTV).
   */
  refreshTick?: number
}

/* ------------------------------------------------------ */
/* Amount parsing (mirrors F2A / F5D)                       */
/* ------------------------------------------------------ */

function pow10Big(n: number): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < n; i++) r *= ten
  return r
}

function parseLoanAmount(
  raw: string,
  decimals: number,
): bigint | null {
  if (!raw || raw.trim() === "") return null
  const trimmed = raw.trim()
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null
  if (trimmed === "" || trimmed === ".") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (!/^[0-9]+$/.test(whole) || !/^[0-9]*$/.test(frac)) return null
  if (frac.length > decimals) return null
  try {
    const factor = pow10Big(decimals)
    const wholeBig = BigInt(whole === "" ? "0" : whole) * factor
    const fracBig = frac
      ? BigInt(frac.padEnd(decimals, "0").slice(0, decimals))
      : BigInt(0)
    return wholeBig + fracBig
  } catch {
    return null
  }
}

/* ------------------------------------------------------ */
/* Hook                                                    */
/* ------------------------------------------------------ */

export function useBorrowReadiness(input: BorrowReadinessInput): BorrowReadiness {
  const wallet = useWallet()
  const { market, amount, loanToken, capacity } = input

  // Resolve loan-token metadata (callers may pass null during loading).
  const resolvedLoanToken = {
    address: loanToken.address,
    symbol: loanToken.symbol,
    decimals: loanToken.decimals,
  }

  if (!market.marketId) {
    return { kind: "invalid-amount", reason: "no-market-id" }
  }
  if (loanToken.address === null) {
    return { kind: "invalid-amount", reason: "no-loan-token" }
  }
  if (loanToken.decimals === null) {
    return { kind: "invalid-amount", reason: "no-loan-decimals" }
  }

  if (wallet.status !== "connected") {
    return { kind: "disconnected" }
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
  }

  // F6A gate is the source of truth for capacity. While it's null,
  // we surface Loading. Never invent a capacity.
  if (capacity === null) {
    return { kind: "loading" }
  }

  // Parse the typed amount using loan-token decimals.
  const parsed = parseLoanAmount(amount, loanToken.decimals)
  if (parsed === null) {
    return {
      kind: "invalid-amount",
      reason: amount.trim() === "" ? "zero" : "nan",
    }
  }
  if (parsed < BigInt(0)) {
    return { kind: "invalid-amount", reason: "negative" }
  }
  if (parsed === BigInt(0)) {
    return { kind: "invalid-amount", reason: "zero" }
  }

  if (capacity === BigInt(0)) {
    return {
      kind: "no-capacity",
      reason: "no-debt-headroom",
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }
  if (parsed > capacity) {
    return {
      kind: "exceeds-capacity",
      attempted: parsed,
      capacity,
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  return {
    kind: "ready-to-borrow",
    capacity,
    amount: parsed,
    loanToken: resolvedLoanToken as {
      address: `0x${string}`
      symbol: string | null
      decimals: number
    },
  }
}
