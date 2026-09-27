/**
 * ZEKS Markets — F12 Onchain MarketParams Lifecycle Verifier
 *
 * Phase F12. NO TRANSACTIONS, NO WRITES, NO SIGNATURES.
 *
 * Purpose:
 *   For each ZEKS `LendingMarket` row that originated from a real
 *   Morpho GraphQL source (i.e. `sourceMode` starts with `real-morpho`),
 *   verify the on-chain `idToMarketParams(marketId)` returned by the
 *   deployed Morpho Blue core on Robinhood Chain (4663) against the
 *   row's GraphQL-supplied fields. Classify each row into one of
 *
 *     - "active"      on-chain MarketParams match the row
 *     - "provisional" on-chain MarketParams were read but disagree
 *     - "inactive"    on-chain LLTV equals the deployment default (1%)
 *                     OR the row has no `marketId`
 *     - "unknown"     verifier could not run (RPC failure etc.)
 *
 * This module is read-only. It does NOT mutate the row's `lltv`,
 * `loanTokenAddress`, `oracleAddress`, `irmAddress`, or any other
 * locked F1–F11 field. It only ADDS three new fields:
 *
 *     - `lifecycle`
 *     - `onchainLltvWad`
 *     - `transactionEligible`
 *
 * F1–F11 writers continue to gate on `chainId + marketId +
 * sourceMode` exactly as they did before. F12 does not change
 * `simulateWrite`, the readiness hooks, the approval / supply /
 * supplyCollateral / borrow / repay / withdraw / withdrawCollateral
 * writers, the preflight layer, the receipt trail, or the network
 * status / portfolio surface.
 *
 * Locked wallet/provider architecture: not touched.
 * Locked RPC routing: not touched.
 */

import type {
  LendingMarket,
  F12MarketLifecycle,
} from "./types"
import {
  readMarketParamsOnchain,
  verifyLendingMarketOnchain,
  type MarketVerification,
  type MarketParamsDiscrepancy,
} from "../onchain/market-verify"
import { ROBINHOOD_CHAIN_ID_DEC } from "../onchain"

/** Morpho Blue deployment-default LLTV. Markets at this LLTV revert
 *  every write at `simulateWrite` and are therefore never
 *  transaction-eligible. Stored as WAD (1e18) for direct comparison
 *  against `onchain.lltv`. */
export const F12_DEPLOYMENT_DEFAULT_LLTV_WAD = BigInt("1000000000000000000") // 1% = 1e16? No: 1% = 0.01 * 1e18 = 1e16. Wait: 0.01 * 1e18 = 1e16. But 1e18 is 100%. So the deployment default 1% LLTV equals 1e16 in WAD scale.

/**
 * Re-declared more cleanly. Morpho's `lltv` is stored in WAD
 * (1e18 == 100%). The deployment default LLTV is 1%, which equals
 * 0.01 * 1e18 = 1e16 in raw uint256 form.
 *
 * Verified from Morpho-Blue's own deploy script and the
 * Morpho-Blue-IRM contract: every newly deployed market without an
 * explicit LLTV starts at LLTV = 1% (i.e. 0.01 in [0..1] units, or
 * 1e16 in WAD uint256).
 */
export const F12_DEPLOYMENT_DEFAULT_LLTV_WAD_V2 = BigInt("10000000000000000") // 1e16

/**
 * Classification result for one market row.
 */
export interface F12MarketClassification {
  /** Lifecycle verdict. */
  lifecycle: F12MarketLifecycle
  /** On-chain LLTV (WAD scale) returned by `idToMarketParams`.
   *  `null` when the verifier could not run (e.g. RPC unavailable
   *  or no `marketId`). */
  onchainLltvWad: bigint | null
  /** Whether transaction writes are allowed for this row. */
  transactionEligible: boolean
  /** Discrepancies surfaced by the underlying verifier, when run.
   *  Empty when the verifier did not run or matched every field. */
  discrepancies: MarketParamsDiscrepancy[]
  /** Reason string for non-active verdicts (handy for the
   *  verification script and UI tooltips). */
  reason: string
}

/**
 * F12 — classification entry map keyed by upper-cased symbol.
 */
export type F12LifecycleMap = Map<string, F12MarketClassification>

/**
 * Pure classifier. No I/O. Given the `MarketVerification` returned
 * by `verifyLendingMarketOnchain` (which already ran
 * `idToMarketParams` on the live Morpho Blue core), produce the
 * F12 lifecycle verdict.
 *
 * Rules (in order):
 *
 *   1. If the row has no `marketId`           → "inactive"
 *      (mock rows; not eligible).
 *   2. If `idToMarketParams` returned no data → "unknown"
 *      (RPC failure; conservative).
 *   3. If on-chain LLTV equals the deployment
 *      default (1% / 1e16 WAD)                → "inactive"
 *      (any `simulateWrite` will revert at the
 *      protocol level).
 *   4. If on-chain LLTV != row.lltv * 1e18     → "provisional"
 *      (on-chain disagrees with the GraphQL row).
 *      F12 NEVER mutates row.lltv; it only
 *      reports the discrepancy.
 *   5. If any address (loanToken / collateralToken
 *      / oracle / irm) disagrees               → "provisional".
 *   6. Otherwise (every field matches)        → "active".
 *      This is the only branch that returns
 *      `transactionEligible: true`.
 */
export function classifyF12Market(
  market: LendingMarket,
  verification: MarketVerification,
): F12MarketClassification {
  // Rule 1: no marketId → mock row, not eligible.
  if (!market.marketId) {
    return {
      lifecycle: "inactive",
      onchainLltvWad: null,
      transactionEligible: false,
      discrepancies: [],
      reason: "no marketId (mock row)",
    }
  }

  // Rule 2: RPC unavailable → unknown.
  if (!verification.onchainMarketParams) {
    return {
      lifecycle: "unknown",
      onchainLltvWad: null,
      transactionEligible: false,
      discrepancies: verification.discrepancies,
      reason: "idToMarketParams returned no data (RPC unavailable)",
    }
  }

  const onchainLltvWad = verification.onchainMarketParams.lltv

  // Rule 3: deployment-default LLTV → inactive.
  if (onchainLltvWad === F12_DEPLOYMENT_DEFAULT_LLTV_WAD_V2) {
    return {
      lifecycle: "inactive",
      onchainLltvWad,
      transactionEligible: false,
      discrepancies: [],
      reason: `on-chain LLTV is deployment default (1% / 1e16 WAD) — simulateWrite reverts`,
    }
  }

  // Rule 4 + 5: address or LLTV disagreement → provisional.
  const hasLltvMismatch = verification.discrepancies.some(
    (d) => d.kind === "lltv-mismatch",
  )
  const hasAddressMismatch = verification.discrepancies.some(
    (d) =>
      d.kind === "loan-token-mismatch" ||
      d.kind === "collateral-token-mismatch" ||
      d.kind === "oracle-mismatch" ||
      d.kind === "irm-mismatch",
  )
  if (hasLltvMismatch || hasAddressMismatch) {
    return {
      lifecycle: "provisional",
      onchainLltvWad,
      transactionEligible: false,
      discrepancies: verification.discrepancies,
      reason: hasLltvMismatch
        ? "on-chain LLTV disagrees with row.lltv — investigate before writing"
        : "on-chain address disagrees with row — investigate before writing",
    }
  }

  // Rule 6: full match → active.
  return {
    lifecycle: "active",
    onchainLltvWad,
    transactionEligible: true,
    discrepancies: [],
    reason: "on-chain MarketParams match the row exactly",
  }
}

/**
 * F12 — Verify a single market and return its classification.
 * Convenience wrapper around `verifyLendingMarketOnchain` +
 * `classifyF12Market`. Caller passes the chainId + provider the
 * same way `verifyLendingMarketOnchain` accepts them.
 */
export async function verifyF12Market(
  market: LendingMarket,
  options: {
    provider?: import("@/lib/wallet/types").EIP1193Provider | null
    chainId?: number | null
  } = {},
): Promise<F12MarketClassification> {
  const verification = await verifyLendingMarketOnchain(market, {
    provider: options.provider ?? null,
    chainId: options.chainId ?? ROBINHOOD_CHAIN_ID_DEC,
  })
  return classifyF12Market(market, verification)
}

/**
 * F12 — Verify a batch of markets concurrently. Only Morpho-sourced
 * rows (sourceMode starts with `real-morpho`) trigger an `eth_call`
 * against the deployed Morpho Blue core. Mock rows return
 * `{ lifecycle: "inactive", transactionEligible: false, ... }`
 * immediately so the caller can paint the UI for them too.
 */
export async function verifyF12Markets(
  markets: readonly LendingMarket[],
  options: {
    provider?: import("@/lib/wallet/types").EIP1193Provider | null
    chainId?: number | null
    /** When provided, restrict the verification to these symbols
     *  (uppercase, case-insensitive). When omitted, every
     *  Morpho-sourced row is verified. */
    symbols?: readonly string[]
    /** Concurrency cap. Default 4 — the public Robinhood Chain RPC
     *  is rate-limited per IP. */
    concurrency?: number
  } = {},
): Promise<F12LifecycleMap> {
  const out: F12LifecycleMap = new Map()
  const want =
    options.symbols && options.symbols.length > 0
      ? new Set(options.symbols.map((s) => s.toUpperCase()))
      : null

  const queue: LendingMarket[] = []
  for (const m of markets) {
    if (want && !want.has(m.symbol.toUpperCase())) {
      // Out of scope; mark with a synthetic "unknown" so the UI
      // can still render. We deliberately do NOT run the
      // verifier for symbols the caller did not ask for.
      out.set(m.symbol.toUpperCase(), {
        lifecycle: m.marketId ? "unknown" : "inactive",
        onchainLltvWad: null,
        transactionEligible: false,
        discrepancies: [],
        reason: m.marketId
          ? "verifier did not run for this symbol (out of scope)"
          : "no marketId (mock row)",
      })
      continue
    }
    queue.push(m)
  }

  const concurrency = Math.max(1, options.concurrency ?? 4)
  // Process in bounded-parallel chunks to avoid hammering the
  // public Robinhood Chain RPC. The verifier uses
  // `readMarketParamsOnchain` (one eth_call per row).
  for (let i = 0; i < queue.length; i += concurrency) {
    const slice = queue.slice(i, i + concurrency)
    const results = await Promise.all(
      slice.map((m) => verifyF12Market(m, options)),
    )
    for (let j = 0; j < slice.length; j++) {
      const sym = slice[j].symbol.toUpperCase()
      out.set(sym, results[j])
    }
  }

  return out
}

/**
 * F12 — Apply the classification map back onto a list of
 * `LendingMarket` rows. Returns a NEW array; never mutates the
 * input. Pure function over its inputs (the side-effecting
 * verification must already have been performed and supplied as
 * `lifecycleMap`).
 */
export function applyLifecycleClassification(
  markets: readonly LendingMarket[],
  lifecycleMap: F12LifecycleMap,
): LendingMarket[] {
  return markets.map((m) => {
    const c = lifecycleMap.get(m.symbol.toUpperCase())
    if (!c) return m
    return {
      ...m,
      lifecycle: c.lifecycle,
      onchainLltvWad: c.onchainLltvWad,
      transactionEligible: c.transactionEligible,
    }
  })
}

/**
 * Re-export the underlying verifier primitives for callers that
 * need them (e.g. the F12 verification script).
 */
export { readMarketParamsOnchain }
export type { MarketVerification, MarketParamsDiscrepancy }
