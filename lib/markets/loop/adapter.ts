/**
 * ZEKS Loop — F13 Adapter
 *
 * Pure mapper. No I/O. No state. No transactions.
 *
 * Purpose
 * -------
 * `LoopMarket` (the slim projection served to `/terminal/loop` from
 * `lib/markets/loop/service.ts`) carries only the fields the carry
 * calculator needs: `symbol`, `borrowApy`, `supplyApy`, `lltv`,
 * `oraclePrice`, `utilization`, `marketId`, `sourceMode`.
 *
 * The locked F2A / F5C / F5D / F6A / F6B / F6C / F7A / F7B / F6D / F7D
 * transaction hooks all consume the FULL `LendingMarket` shape, which
 * also carries `loanTokenAddress`, `collateralTokenAddress`,
 * `oracleAddress`, `irmAddress`, `loanTokenDecimals`,
 * `collateralAssetSymbol`, `loanAssetSymbol`, the F12 `lifecycle`
 * field, and the F12 `transactionEligible` flag.
 *
 * `adapter.ts` is the bridge between the two shapes.
 *
 * Contract
 * --------
 *   - All four exports are pure functions of their arguments. They do
 *     NOT mutate inputs.
 *   - None of them introduce new RPC calls. The full `LendingMarket`
 *     row is supplied by the existing `useEarnLendingMarkets` hook
 *     (locked F12), which polls `/api/markets/lending/earn`.
 *   - When the underlying `LendingMarket` is not found for a given
 *     `LoopMarket` symbol (e.g. AMZN's row lives in a separate route
 *     the shared polling hasn't seen yet), the adapter falls back to
 *     a minimal but VALID `LendingMarket` shell so the locked writers
 *     can still consume it (every locked writer gates on `chainId +
 *     marketId` — the synthetic shell satisfies that gate while the
 *     readiness hooks report `market-unconfigured`).
 *   - The adapter NEVER fabricates an LLTV, oracle address, IRM
 *     address, marketId, or any other MarketParams field. If the
 *     row is missing those, the synthetic shell leaves them null —
 *     the readiness gates flag `market-unconfigured` and the
 *     transaction CTA stays disabled. This is the same behavior the
 *     Earn page already enforces.
 */

import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LoopMarket, YieldVenue } from "./types"

/* ──────────────────────────────────────────────────────────────────
 * Stock collateral adapter
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Find the full `LendingMarket` row for a `LoopMarket` symbol by
 * exact-uppercase match. Returns null when no row exists.
 */
export function findLendingMarket(
  symbol: string,
  lendingMarkets: readonly LendingMarket[],
): LendingMarket | null {
  const upper = symbol.toUpperCase()
  for (const m of lendingMarkets) {
    if (m.symbol.toUpperCase() === upper) return m
  }
  return null
}

/**
 * Adapter result for the stock collateral side of a Loop.
 *
 * `row` is the full `LendingMarket` that the locked F2A / F5C / F5D
 * / F6A / F6B / F7A writers consume.
 *
 * `marketUnconfigured` is `true` when:
 *   - No underlying `LendingMarket` was found for this symbol, OR
 *   - The found row has no `marketId` (mock row), OR
 *   - The found row has no `loanTokenAddress`, OR
 *   - The found row has no `collateralTokenAddress`, OR
 *   - The found row's `lltv` is null, OR
 *   - The found row is not F12 transaction-eligible.
 *
 * When `marketUnconfigured` is true, the Loop transaction CTA MUST
 * stay disabled. This is the same gate the Earn page enforces via
 * `useSupplyReadiness.kind === "market-unconfigured"`.
 */
export interface LoopCollateralAdapter {
  row: LendingMarket
  marketUnconfigured: boolean
  reason: string | null
}

/**
 * Map a `LoopMarket` + the shared `LendingMarket[]` (from
 * `useEarnLendingMarkets`) to the inputs the locked writers need.
 *
 * Pure function. Never throws. Always returns a valid `LendingMarket`.
 */
export function adaptLoopMarketToLendingMarket(
  loopMarket: LoopMarket,
  lendingMarkets: readonly LendingMarket[],
): LoopCollateralAdapter {
  const found = findLendingMarket(loopMarket.symbol, lendingMarkets)

  if (!found) {
    return {
      row: buildSyntheticShell(loopMarket),
      marketUnconfigured: true,
      reason:
        "Underlying Morpho lending market row not available yet (data still loading).",
    }
  }

  // F12 lifecycle gate. Reuses the locked F12 verdict that the
  // shared service populated. F13 NEVER reclassifies; it only
  // respects the verdict the F12 verifier produced.
  const f12Ineligible = found.transactionEligible !== true

  if (found.marketId == null) {
    return {
      row: found,
      marketUnconfigured: true,
      reason: "No Morpho marketId for this symbol on Robinhood Chain.",
    }
  }
  if (found.loanTokenAddress == null) {
    return {
      row: found,
      marketUnconfigured: true,
      reason: "Underlying market is missing its loan token address.",
    }
  }
  if (found.collateralTokenAddress == null) {
    return {
      row: found,
      marketUnconfigured: true,
      reason: "Underlying market is missing its collateral token address.",
    }
  }
  if (found.lltv == null) {
    return {
      row: found,
      marketUnconfigured: true,
      reason: "Underlying market has no LLTV (cannot size the borrow).",
    }
  }
  if (f12Ineligible) {
    return {
      row: found,
      marketUnconfigured: true,
      reason:
        found.lifecycle === "inactive"
          ? "Market is inactive on-chain (LLTV == deployment default)."
          : found.lifecycle === "provisional"
            ? "Market is provisional (on-chain MarketParams disagree)."
            : found.lifecycle === "unknown"
              ? "Market lifecycle is unverified (RPC unavailable)."
              : "Market is not transaction-eligible (F12 verdict).",
    }
  }

  return {
    row: found,
    marketUnconfigured: false,
    reason: null,
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Yield venue adapter
 * ──────────────────────────────────────────────────────────────────── */

/**
 * A `YieldVenue` is a supply-side Morpho market for a stablecoin
 * (USDG/USDC/USDT) on Robinhood Chain. For the Loop page to use
 * the locked F2A / F2B / F2C writers (the `supply` flow) when
 * routing borrowed stablecoin into a yield venue, the venue must
 * be expressible as a `LendingMarket`.
 *
 * `yieldVenueToLendingMarket` projects a `YieldVenue` into a
 * `LendingMarket` using ONLY data that already exists on the
 * venue: `marketId`, `assetAddress`, `apy` (as the supply APY).
 *
 * `loanTokenAddress` for the supply side IS the venue's
 * `assetAddress` (the stablecoin being supplied). The
 * `collateralTokenAddress` is left null — the supply flow does
 * not require collateral.
 */
export interface LoopVenueAdapter {
  row: LendingMarket
  marketUnconfigured: boolean
  reason: string | null
}

export function adaptYieldVenueToLendingMarket(
  venue: YieldVenue,
): LoopVenueAdapter {
  if (venue.marketId == null) {
    return {
      row: buildVenueShell(venue),
      marketUnconfigured: true,
      reason: "Yield venue has no Morpho marketId on Robinhood Chain.",
    }
  }
  if (venue.assetAddress == null) {
    return {
      row: buildVenueShell(venue),
      marketUnconfigured: true,
      reason: "Yield venue is missing its underlying asset address.",
    }
  }
  if (venue.status === "inactive" || venue.status === "unavailable") {
    return {
      row: buildVenueShell(venue),
      marketUnconfigured: true,
      reason: "Yield venue is not currently active.",
    }
  }

  return {
    row: {
      symbol: venue.asset ?? venue.id.toUpperCase(),
      name: venue.name,
      logoUrl: null,
      oraclePrice: null,
      oracleSource: "none",
      supplyApy: venue.apy,
      borrowApy: null,
      totalSupply: venue.tvl,
      totalBorrow: null,
      availableLiquidity: venue.liquidity,
      utilization: null,
      tvl: venue.tvl,
      status: "active",
      protocolSource:
        venue.source === "morpho-supply" ? "morpho" : "verified-onchain" as never,
      sourceMode: "live",
      listed: venue.listed,
      contractAddress: venue.assetAddress,
      marketId: venue.marketId,
      collateralAssetSymbol: null,
      loanAssetSymbol: venue.asset ?? null,
      lltv: null,
      oracleAddress: null,
      irmAddress: null,
      loanTokenAddress: venue.assetAddress,
      collateralTokenAddress: null,
      loanTokenDecimals: 6,
      // F12 — yield venues are not subject to the F12 per-stock
      // classifier; they are supply-side stablecoin markets whose
      // transaction eligibility is always `true` once a marketId
      // exists. We mark them eligible explicitly.
      lifecycle: "active",
      onchainLltvWad: null,
      transactionEligible: true,
      rhContractAddress: null,
      rhMultiplier: null,
      rhTokenDecimals: null,
      rhLogoUrl: null,
      referenceBid: null,
      referenceAsk: null,
      referencePrice: null,
      referenceGeneratedAt: null,
      referenceIsHalt: false,
      chainId: ROBINHOOD_CHAIN_ID,
      fetchedAt: venue.fetchedAt,
    },
    marketUnconfigured: false,
    reason: null,
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers (private)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Minimal synthetic `LendingMarket` shell. Used when the underlying
 * row is not yet available — every locked writer gates on
 * `chainId + marketId`, so the readiness hooks will report
 * `market-unconfigured` until the real row arrives. We never
 * fabricate `marketId`, addresses, or LLTV.
 */
function buildSyntheticShell(loopMarket: LoopMarket): LendingMarket {
  return {
    symbol: loopMarket.symbol.toUpperCase(),
    name: loopMarket.name,
    logoUrl: loopMarket.logoUrl,
    oraclePrice: loopMarket.oraclePrice,
    oracleSource: "unknown",
    supplyApy: loopMarket.supplyApy,
    borrowApy: loopMarket.borrowApy,
    totalSupply: loopMarket.totalSupplyUsd,
    totalBorrow: null,
    availableLiquidity: loopMarket.availableLiquidityUsd,
    utilization: loopMarket.utilization,
    tvl: loopMarket.totalSupplyUsd,
    status: "unknown",
    protocolSource: "morpho",
    sourceMode:
      loopMarket.sourceMode === "mock" ? "mock" : "real-morpho-unlisted",
    listed: null,
    contractAddress: loopMarket.contractAddress,
    marketId: loopMarket.marketId,
    collateralAssetSymbol: loopMarket.symbol.toUpperCase(),
    loanAssetSymbol: null,
    lltv: loopMarket.lltv,
    oracleAddress: null,
    irmAddress: null,
    loanTokenAddress: null,
    collateralTokenAddress: null,
    loanTokenDecimals: null,
    lifecycle: loopMarket.marketId ? "unknown" : null,
    onchainLltvWad: null,
    transactionEligible: false,
    rhContractAddress: null,
    rhMultiplier: loopMarket.rhMultiplier,
    rhTokenDecimals: null,
    rhLogoUrl: null,
    referenceBid: null,
    referenceAsk: null,
    referencePrice: null,
    referenceGeneratedAt: null,
    referenceIsHalt: false,
    chainId: ROBINHOOD_CHAIN_ID,
    fetchedAt: new Date().toISOString(),
  }
}

function buildVenueShell(venue: YieldVenue): LendingMarket {
  return {
    symbol: venue.asset ?? venue.id.toUpperCase(),
    name: venue.name,
    logoUrl: null,
    oraclePrice: null,
    oracleSource: "none",
    supplyApy: venue.apy,
    borrowApy: null,
    totalSupply: venue.tvl,
    totalBorrow: null,
    availableLiquidity: venue.liquidity,
    utilization: null,
    tvl: venue.tvl,
    status: "active",
    protocolSource:
      venue.source === "morpho-supply" ? "morpho" : "verified-onchain" as never,
    sourceMode: "live",
    listed: venue.listed,
    contractAddress: venue.assetAddress,
    marketId: venue.marketId,
    collateralAssetSymbol: null,
    loanAssetSymbol: venue.asset ?? null,
    lltv: null,
    oracleAddress: null,
    irmAddress: null,
    loanTokenAddress: venue.assetAddress,
    collateralTokenAddress: null,
    loanTokenDecimals: 6,
    lifecycle: "unknown",
    onchainLltvWad: null,
    transactionEligible: false,
    rhContractAddress: null,
    rhMultiplier: null,
    rhTokenDecimals: null,
    rhLogoUrl: null,
    referenceBid: null,
    referenceAsk: null,
    referencePrice: null,
    referenceGeneratedAt: null,
    referenceIsHalt: false,
    chainId: ROBINHOOD_CHAIN_ID,
    fetchedAt: venue.fetchedAt,
  }
}
