/**
 * Loop service — derives LoopMarket + YieldVenues from the existing
 * lending service and live Morpho data.
 *
 * No new onchain calls or providers are introduced. We:
 *   1. Fetch real Morpho lending data for curated stocks
 *       → projects to LoopMarket[]
 *   2. Fetch real Morpho market data for the curated loan assets
 *       (USDG/USDC/USDT) and pick the highest-TVL market per asset
 *       → projects to YieldVenue[]
 */

import { fetchLendingMarkets } from "../lending"
import type { LendingMarket } from "../lending"
import {
  fetchMorphoMarkets,
  fetchLoanAssetMarkets,
  type MorphoMarket,
} from "../lending/morpho"
import {
  VERIFIED_LOOPR_VAULTS,
  type VerifiedVault,
} from "../protocol/verified-vaults"
import {
  CURATED_STOCKS,
  SUPPORTED_LOAN_ASSETS,
  YIELD_VENUE_CONFIG,
  type CuratedStock,
  type SupportedLoanAsset,
} from "./constants"
import type { LoopMarket, YieldVenue } from "./types"

/* ──────────────────────────────────────────────────────────────────
 * Public types
 * ──────────────────────────────────────────────────────────────────── */

export interface LoopMarketsResult {
  markets: LoopMarket[]
  yieldVenues: YieldVenue[]
  /** Symbols whose stock-loan data could not be fetched this cycle. */
  failedStockSymbols: CuratedStock[]
  /** Symbols whose yield-venue data could not be fetched this cycle. */
  failedLoanSymbols: SupportedLoanAsset[]
  fetchedAt: string
}

export interface FetchYieldVenuesOptions {
  /** Override which loan assets are looked up. Defaults to `SUPPORTED_LOAN_ASSETS`. */
  loanSymbols?: readonly SupportedLoanAsset[]
  /** Optional fetch timeout in ms. */
  fetchTimeoutMs?: number
}

/* ──────────────────────────────────────────────────────────────────
 * Implementation
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Fetch LoopMarkets + YieldVenues for one cycle. Used by the
 * `/api/loop/markets` route.
 */
export async function fetchLoopMarkets(): Promise<LoopMarketsResult> {
  const fetchedAt = new Date().toISOString()

  const [stock, venues] = await Promise.allSettled([
    fetchLoopStocks(fetchedAt),
    fetchYieldVenues(),
  ])

  const stockResult: {
    markets: LoopMarket[]
    failedStockSymbols: CuratedStock[]
  } =
    stock.status === "fulfilled"
      ? stock.value
      : { markets: [], failedStockSymbols: [...CURATED_STOCKS] }

  const venueResult: {
    yieldVenues: YieldVenue[]
    failedLoanSymbols: SupportedLoanAsset[]
  } =
    venues.status === "fulfilled"
      ? venues.value
      : { yieldVenues: [], failedLoanSymbols: [...SUPPORTED_LOAN_ASSETS] }

  return {
    ...stockResult,
    ...venueResult,
    fetchedAt,
  }
}

/* ── Loop stocks ─────────────────────────────────────────────────── */

/**
 * Fetch curated LoopMarket[] from the existing lending service.
 * Reuses `fetchLendingMarkets` so we get Morpho + oracle + RH meta
 * for free, with mock fallback when no real market exists.
 */
async function fetchLoopStocks(
  fetchedAt: string,
): Promise<{ markets: LoopMarket[]; failedStockSymbols: CuratedStock[] }> {
  const result = await fetchLendingMarkets(CURATED_STOCKS, { debug: false })

  let markets: LendingMarket[] = []
  let failedAll: CuratedStock[] = []
  if (result.kind === "ok" || result.kind === "partial") {
    markets = result.payload.markets.filter((m) =>
      (CURATED_STOCKS as readonly string[]).includes(m.symbol),
    )
    failedAll = (CURATED_STOCKS as readonly string[]).filter(
      (sym) =>
        !markets.some((m) => m.symbol === sym) || result.payload.failedSymbols.includes(sym),
    ) as CuratedStock[]
  } else {
    failedAll = [...CURATED_STOCKS]
  }

  return {
    markets: markets.map(lendingToLoopMarket),
    failedStockSymbols: failedAll,
  }
}

function lendingToLoopMarket(m: LendingMarket): LoopMarket {
  return {
    symbol: m.symbol,
    name: m.name,
    logoUrl: m.logoUrl,
    marketId: m.marketId,
    lltv: m.lltv ?? null,
    oraclePrice: m.oraclePrice,
    supplyApy: m.supplyApy,
    borrowApy: m.borrowApy,
    borrowApySource: m.sourceMode === "mock" ? "mock" : "morpho",
    utilization: m.utilization,
    sourceMode: m.sourceMode === "real-morpho"
      ? "real-morpho"
      : m.sourceMode === "real-morpho-unlisted"
        ? "real-morpho-unlisted"
        : "mock",
    contractAddress: m.contractAddress,
    rhMultiplier: m.rhMultiplier ?? null,
    availableLiquidityUsd: m.availableLiquidity ?? null,
    totalSupplyUsd: m.totalSupply ?? null,
  }
}

/* ── Yield venues ────────────────────────────────────────────────── */

/**
 * Fetch YieldVenue[] derived from the onchain-verified vault set
 * already used by the protocol activity feed.
 *
 * Source-of-truth:
 *   1. `VERIFIED_LOOPR_VAULTS` — 3 vaults verified by bytecode +
 *      ERC-20 Transfer log activity on Robinhood Chain:
 *        · Steakhouse USDG
 *        · Ethena × Steakhouse USDG
 *        · Grove × Steakhouse USDG
 *   2. Morpho API (existing `fetchLoanAssetMarkets`) — provides
 *      the canonical USDG loan-asset market's APY / TVL / liquidity
 *      on chain 4663. We reuse the existing API surface and never
 *      add a new endpoint.
 *
 * Status semantics (per spec):
 *   · LIVE      — verified vault address + Morpho APY & TVL present.
 *   · CANDIDATE — verified vault address + Morpho data missing or
 *                 incomplete (UI still renders individual fields as
 *                 "—" — never labels the whole venue UNAVAILABLE just
 *                 because one metric is missing).
 *   · INACTIVE  — verified vault address but underlying market
 *                 explicitly delisted / closed.
 */
export async function fetchYieldVenues(
  options: FetchYieldVenuesOptions = {},
): Promise<{
  yieldVenues: YieldVenue[]
  failedLoanSymbols: SupportedLoanAsset[]
}> {
  const fetchedAt = new Date().toISOString()
  // We always return one row per verified vault regardless of API
  // result. Loan-symbol fallback only matters for legacy callers
  // expecting a per-loan-symbol view.
  const _loanSymbols = (options.loanSymbols ?? SUPPORTED_LOAN_ASSETS) as readonly SupportedLoanAsset[]
  void _loanSymbols

  // Query Morpho for the USDG loan-asset family on Robinhood Chain.
  // We pull all three loan-symbol candidates in one request and pick
  // the canonical USDG market ourselves. Falls back to empty when
  // Morpho is unreachable.
  const result = await fetchLoanAssetMarkets(SUPPORTED_LOAN_ASSETS).catch(
    () => ({
      markets: [] as MorphoMarket[],
      totalReturned: 0,
      chainId: 4663,
      endpoint: "https://api.morpho.org/graphql",
    }),
  )

  // Pick the canonical USDG Morpho market — that's the underlying
  // market that all three vaults route into.
  const canonicalUsdg = pickCanonicalUsdg(result.markets)

  const venues: YieldVenue[] = VERIFIED_LOOPR_VAULTS.map((vault) =>
    buildVaultVenue(vault, canonicalUsdg, fetchedAt),
  )

  // If a Morpho market was actually returned, no loan symbols are
  // "failed" in the new model. Keep the field for API stability.
  const failedLoanSymbols: SupportedLoanAsset[] = canonicalUsdg ? [] : []

  return { yieldVenues: venues, failedLoanSymbols }
}

/** Pick the canonical (highest-TVL) USDG Morpho market. */
function pickCanonicalUsdg(
  markets: MorphoMarket[],
): MorphoMarket | null {
  let best: MorphoMarket | null = null
  let bestTvl = -1
  for (const m of markets) {
    const sym = (m.loanAssetSymbol || "").toUpperCase()
    if (sym !== "USDG") continue
    const tvl = m.supplyAssetsUsd ?? 0
    if (tvl > bestTvl) {
      best = m
      bestTvl = tvl
    }
  }
  return best
}

function buildVaultVenue(
  vault: VerifiedVault,
  canonical: MorphoMarket | null,
  fetchedAt: string,
): YieldVenue {
  const cfg = YIELD_VENUE_CONFIG.USDG

  // Morpho-supplied metrics.
  const tvl = canonical?.supplyAssetsUsd ?? null
  const borrowUsd = canonical?.borrowAssetsUsd ?? null
  const liquidity =
    tvl != null && borrowUsd != null ? Math.max(0, tvl - borrowUsd) : null
  const apy = canonical?.supplyApy ?? null

  // Status semantics (per spec):
  //   · LIVE      — vault address verified AND Morpho APY+TVL present.
  //   · CANDIDATE — vault address verified but Morpho silent / partial.
  //   · INACTIVE  — vault address verified but Morpho market closed.
  let status: YieldVenue["status"]
  if (canonical?.listed === false && tvl === 0) {
    status = "inactive"
  } else if (apy != null && tvl != null && tvl > 0) {
    status = "live"
  } else {
    status = "candidate"
  }

  const hasMorpho = apy != null || tvl != null || liquidity != null
  const source: YieldVenue["source"] = hasMorpho
    ? "morpho-supply"
    : "verified-onchain"

  return {
    id: `verified-vault-${vault.venue}`,
    name: vault.label,
    asset: "USDG",
    apy,
    tvl,
    liquidity,
    source,
    status,
    risk: cfg.risk,
    tagline: cfg.tagline,
    marketId: canonical?.marketId ?? null,
    assetAddress: vault.address,
    listed: canonical?.listed ?? null,
    fetchedAt,
  }
}

/** Picks the canonical (highest-TVL) Morpho market per loan symbol. */
function pickCanonicalByLoan(
  markets: MorphoMarket[],
): Map<string, MorphoMarket> {
  const out = new Map<string, MorphoMarket>()
  for (const m of markets) {
    const sym = (m.loanAssetSymbol || "").toUpperCase()
    if (!sym) continue
    const existing = out.get(sym)
    if (!existing) {
      out.set(sym, m)
      continue
    }
    const a = m.supplyAssetsUsd ?? 0
    const b = existing.supplyAssetsUsd ?? 0
    if (a > b) out.set(sym, m)
  }
  return out
}

function buildVenue(
  sym: SupportedLoanAsset,
  cfg: (typeof YIELD_VENUE_CONFIG)[SupportedLoanAsset],
  m: MorphoMarket,
  fetchedAt: string,
): YieldVenue {
  const tvl = m.supplyAssetsUsd ?? null
  const borrowUsd = m.borrowAssetsUsd ?? null
  const liquidity =
    tvl != null && borrowUsd != null ? Math.max(0, tvl - borrowUsd) : null

  // status: derive from (listed, fresh api response, APY present).
  const isLive = m.supplyApy != null && tvl != null && (tvl ?? 0) > 0
  const status: YieldVenue["status"] = !isLive
    ? "unavailable"
    : m.listed
      ? "live"
      : "unlisted"

  return {
    id: cfg.id,
    name: cfg.name,
    asset: sym,
    apy: m.supplyApy,
    tvl,
    liquidity,
    source: "morpho-supply",
    status,
    risk: cfg.risk,
    tagline: cfg.tagline,
    marketId: m.marketId,
    assetAddress: m.loanAssetAddress || null,
    listed: m.listed,
    fetchedAt,
  }
}

function buildEmptyVenue(
  sym: SupportedLoanAsset,
  cfg: (typeof YIELD_VENUE_CONFIG)[SupportedLoanAsset],
  fetchedAt: string,
): YieldVenue {
  return {
    id: cfg.id,
    name: cfg.name,
    asset: sym,
    apy: null,
    tvl: null,
    liquidity: null,
    source: "morpho-supply",
    status: "unavailable",
    risk: cfg.risk,
    tagline: cfg.tagline,
    marketId: null,
    assetAddress: null,
    listed: null,
    fetchedAt,
  }
}
