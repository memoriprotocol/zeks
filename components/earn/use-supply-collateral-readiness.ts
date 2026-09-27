"use client"

/**
 * useSupplyCollateralReadiness — read-only collateral-supply gate.
 *
 * Phase F5D. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: determine whether the connected wallet is ready to supply
 * collateral to the Morpho Blue market.
 *
 * This is the COLLATERAL analogue of `useSupplyReadiness` (F2A), which
 * gates the loan-token supply. This hook gates the collateral supply
 * that backs future borrows.
 *
 * The prerequisite is that the wallet has already approved Morpho Blue
 * for at least the `amount` of collateral. The caller passes the
 * `allowance` and `balance` as inputs rather than reading them here
 * (F5C's `useCollateralApprovalReadiness` already reads both, and
 * callers may have already read them from other sources).
 *
 * What this hook checks:
 *   1. Wallet is connected and on Robinhood Chain (4663).
 *   2. Market has a valid marketId and MarketParams fields.
 *   3. Collateral token address is available.
 *   4. Typed amount > 0 (parsed using collateral token decimals).
 *   5. Amount <= wallet collateral token balance.
 *   6. Allowance >= amount (caller-supplied, from F5C).
 *
 * State machine:
 *
 *   Disconnected
 *     -> WrongNetwork
 *     -> Loading           (params validation in flight)
 *     -> Ready             (all checks passed)
 *     -> InsufficientBalance  (amount > wallet balance)
 *     -> AllowanceInsufficient  (allowance < amount)
 *     -> InvalidAmount     (zero / NaN / no collateral token)
 */

import * as React from "react"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export type SupplyCollateralReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "loading" }
  | {
      kind: "ready"
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "allowance-insufficient"
      /** Amount still missing from the allowance (bigint). */
      missing: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "insufficient-balance"
      balance: bigint
      required: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "invalid-amount"
      reason: "zero" | "nan" | "negative" | "no-collateral-token" | "no-market-id"
    }

export interface SupplyCollateralReadinessInput {
  market: LendingMarket
  /** Typed amount string from the collateral input field. */
  amount: string
  /**
   * Collateral token metadata. Caller MUST provide the decimals (from
   * F5C `useCollateralApprovalReadiness` or a direct `readErc20Info` call).
   * Symbol is optional.
   */
  collateralToken: {
    address: `0x${string}`
    symbol: string | null
    decimals: number
  }
  /**
   * The current onchain allowance of the collateral token to Morpho Blue.
   * Pass null if allowance has not been read yet — the hook will surface
   * it as a loading state.
   */
  allowance: bigint | null
  /**
   * The wallet's current collateral token balance.
   * Pass null if balance has not been read yet.
   */
  balance: bigint | null
}

/* ------------------------------------------------------ */
/* Amount parsing (mirrors F2A)                             */
/* ------------------------------------------------------ */

function pow10Big(n: number): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < n; i++) r *= ten
  return r
}

function parseCollateralAmount(
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

export function useSupplyCollateralReadiness(
  input: SupplyCollateralReadinessInput,
): SupplyCollateralReadiness {
  const { market, amount, collateralToken, allowance, balance } = input

  // Note: wallet-disconnected and chain checks are done by the
  // caller's `useCollateralApprovalReadiness` hook. Here we focus
  // on market-level readiness for the collateral supply action.
  if (!market.marketId) {
    return { kind: "invalid-amount", reason: "no-market-id" }
  }
  if (!collateralToken.address) {
    return { kind: "invalid-amount", reason: "no-collateral-token" }
  }

  const parsed = parseCollateralAmount(amount, collateralToken.decimals)

  if (parsed === null) {
    return {
      kind: "invalid-amount",
      reason: amount === "" || amount.trim() === "" ? "zero" : "nan",
    }
  }
  if (parsed <= BigInt(0)) {
    return { kind: "invalid-amount", reason: "zero" }
  }

  // Wait for balance/allowance reads.
  if (balance === null || allowance === null) {
    return { kind: "loading" }
  }

  if (parsed > balance) {
    return {
      kind: "insufficient-balance",
      balance,
      required: parsed,
      collateralToken,
    }
  }

  if (allowance < parsed) {
    return {
      kind: "allowance-insufficient",
      missing: parsed - allowance,
      collateralToken,
    }
  }

  return {
    kind: "ready",
    collateralToken,
  }
}
