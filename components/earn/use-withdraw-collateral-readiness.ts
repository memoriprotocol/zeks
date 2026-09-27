"use client"

/**
 * useWithdrawCollateralReadiness — read-only collateral-withdraw gate.
 *
 * Phase F7D. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: determine whether the connected wallet is ready to send a
 * Morpho Blue `withdrawCollateral(...)` transaction against an
 * existing collateral position.
 *
 * This hook follows the F5D (collateral supply) pattern exactly:
 *   - never reads chain state directly
 *   - takes the F5B `collateral` and F6A oracle + LLTV inputs from
 *     the caller
 *   - never fabricates a safe-max value — if any required input is
 *     missing, the state is Loading or Invalid
 *
 * Safe-withdraw math (mirroring F6D, no recomputation):
 *
 *   Caller passes:
 *     - collateralRaw             (F5B position.collateral)
 *     - borrowedAssets            (F5B position.borrowedAssets via toAssetsUp)
 *     - oraclePrice               (F6A oraclePrice in 1e36 WAD)
 *     - lltvWad                   (MarketParams.lltv as uint256 WAD)
 *     - collateralDecimals/loanDecimals (for safe-withdraw math)
 *
 *   Hook surfaces the verified F6A-derived maxWithdrawable via the
 *   `maxSafeWithdraw` input field. The caller computes this using
 *   `maxWithdrawableCollateral(...)` from
 *   `@/lib/markets/onchain/morpho-oracle` (which is shared with F6D).
 *
 * State machine:
 *
 *   Disconnected
 *     -> WrongNetwork
 *     -> Loading                  (position / oracle not yet known)
 *     -> ReadyToWithdrawCollateral  (amount > 0, amount <= maxSafeWithdraw)
 *     -> NoCollateral             (collateralRaw == 0)
 *     -> NoSafeWithdraw           (maxSafeWithdraw == 0 because debt
 *                                  consumed full collateral headroom)
 *     -> ExceedsSafeWithdraw      (amount > maxSafeWithdraw)
 *     -> InvalidAmount            (NaN / negative / no collateral token)
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export type WithdrawCollateralReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "loading" }
  | {
      kind: "ready-to-withdraw-collateral"
      /** The user's typed amount (collateral-token units, bigint). */
      amount: bigint
      /** Maximum safely withdrawable (collateral-token units, bigint). */
      maxSafeWithdraw: bigint
      /** Total collateral the user has supplied (collateral-token units, bigint). */
      collateralRaw: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "no-collateral"
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "no-safe-withdraw"
      /** The user's collateral amount (collateral-token units, bigint). */
      collateralRaw: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "exceeds-safe-withdraw"
      /** The user's typed amount. */
      attempted: bigint
      /** Maximum safely withdrawable. */
      maxSafeWithdraw: bigint
      collateralToken: {
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
        | "no-collateral-token"
        | "no-collateral-decimals"
        | "no-market-id"
    }

export interface WithdrawCollateralReadinessInput {
  market: LendingMarket
  /** Typed amount string from the collateral-withdraw input field. */
  amount: string
  collateralToken: {
    address: `0x${string}` | null
    symbol: string | null
    decimals: number | null
  }
  /**
   * F5B `position.collateral` (collateral-token native units, bigint).
   * `null` while loading.
   */
  collateralRaw: bigint | null
  /**
   * Maximum safe withdrawable, derived in the caller using the verified
   * F6A oracle formula in reverse (`maxWithdrawableCollateral` from
   * `@/lib/markets/onchain/morpho-oracle`).
   *
   * `null` while loading.
   */
  maxSafeWithdraw: bigint | null
  refreshTick?: number
}

/* ------------------------------------------------------ */
/* Amount parsing (mirrors F5D)                              */
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

export function useWithdrawCollateralReadiness(
  input: WithdrawCollateralReadinessInput,
): WithdrawCollateralReadiness {
  const wallet = useWallet()
  const { market, amount, collateralToken, collateralRaw, maxSafeWithdraw } =
    input

  const resolvedCollateralToken = {
    address: collateralToken.address,
    symbol: collateralToken.symbol,
    decimals: collateralToken.decimals,
  }

  if (!market.marketId) {
    return { kind: "invalid-amount", reason: "no-market-id" }
  }
  if (collateralToken.address === null) {
    return { kind: "invalid-amount", reason: "no-collateral-token" }
  }
  if (collateralToken.decimals === null) {
    return { kind: "invalid-amount", reason: "no-collateral-decimals" }
  }

  if (wallet.status !== "connected") {
    return { kind: "disconnected" }
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
  }

  // Wait for F5B + F6A-derived max.
  if (collateralRaw === null || maxSafeWithdraw === null) {
    return { kind: "loading" }
  }

  const safeMax = maxSafeWithdraw
  const collatRaw = collateralRaw

  // No collateral at all — nothing to withdraw.
  if (collatRaw === BigInt(0)) {
    return {
      kind: "no-collateral",
      collateralToken: resolvedCollateralToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  // The verified oracle-derived max is zero → debt consumes all
  // collateral headroom, withdrawal is unsafe.
  if (safeMax === BigInt(0)) {
    return {
      kind: "no-safe-withdraw",
      collateralRaw: collatRaw,
      collateralToken: resolvedCollateralToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  // Parse the typed amount using collateral-token decimals.
  const parsed = parseCollateralAmount(amount, collateralToken.decimals)
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

  // Hard cap: parsed amount must not exceed the verified F6A safe-max.
  if (parsed > safeMax) {
    return {
      kind: "exceeds-safe-withdraw",
      attempted: parsed,
      maxSafeWithdraw: safeMax,
      collateralToken: resolvedCollateralToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  return {
    kind: "ready-to-withdraw-collateral",
    amount: parsed,
    maxSafeWithdraw: safeMax,
    collateralRaw: collatRaw,
    collateralToken: resolvedCollateralToken as {
      address: `0x${string}`
      symbol: string | null
      decimals: number
    },
  }
}
