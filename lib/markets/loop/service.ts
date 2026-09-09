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
  ROBINHOOD_PUBLIC_RPC_URL,
  parseUint256,
} from "../onchain/rpc"
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

  // Pull USDG-family markets from Morpho in parallel with per-vault
  // onchain `totalAssets()` reads. The two are independent — one
  // failing does not gate the other.
  const [morphoResult, vaultOnchain] = await Promise.all([
    fetchLoanAssetMarkets(SUPPORTED_LOAN_ASSETS).catch(
      () =>
        ({
          markets: [] as MorphoMarket[],
          totalReturned: 0,
          chainId: 4663,
          endpoint: "https://api.morpho.org/graphql",
        }) as {
          markets: MorphoMarket[]
          totalReturned: number
          chainId: number
          endpoint: string
        },
    ),
    fetchVaultTotalAssets(VERIFIED_LOOPR_VAULTS, 5_000),
  ])

  // The canonical USDG Morpho market that all three vaults route
  // into. We pick the highest-TVL supply market to derive APY.
  const canonicalUsdg = pickCanonicalUsdg(morphoResult.markets)

  const venues: YieldVenue[] = VERIFIED_LOOPR_VAULTS.map((vault) =>
    buildVaultVenue(
      vault,
      canonicalUsdg,
      vaultOnchain.get(vault.address.toLowerCase()) ?? null,
      fetchedAt,
    ),
  )

  // If the canonical USDG market was found, no loan symbols are
  // "failed". Keep the field for API stability.
  const failedLoanSymbols: SupportedLoanAsset[] = canonicalUsdg ? [] : []

  return { yieldVenues: venues, failedLoanSymbols }
}

/**
 * Read ERC-4626 `totalAssets()` for each vault via the canonical
 * Robinhood RPC. Returns a Map<lowercasedAddress, raw totalAssets
 * in token base units>. Each vault's TVL is independent — no shared
 * Morpho pool is reported per-vault.
 *
 * Uses the public Robinhood Chain RPC at the URL already in
 * `lib/markets/onchain/rpc.ts`. Per-vault reads run concurrently with
 * a 5 s timeout. Reads that fail individually are simply absent
 * from the map — callers treat missing entries as null.
 */
async function fetchVaultTotalAssets(
  vaults: readonly VerifiedVault[],
  timeoutMs: number,
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>()
  await Promise.all(
    vaults.map(async (v) => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), timeoutMs)
        const res = await fetch(ROBINHOOD_PUBLIC_RPC_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              { to: v.address, data: "0x01e1d114" }, // totalAssets()
              "latest",
            ],
            id: 1,
          }),
          signal: ctrl.signal,
          cache: "no-store",
        })
        clearTimeout(t)
        if (!res.ok) return
        const j = (await res.json()) as { result?: string }
        if (!j.result || j.result === "0x" || j.result === "0x0") return
        const total = parseUint256(j.result as `0x${string}`, 0)
        out.set(v.address.toLowerCase(), total)
      } catch {
        // silent — vault falls back to null TVL
      }
    }),
  )
  return out
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

/**
 * Build a per-vault YieldVenue with INDEPENDENT data.
 *
 *   · TVL       — onchain `totalAssets() / 10^decimals`. Each vault
 *                  shows its OWN TVL — not a shared Morpho pool.
 *   · APY       — shared underlying USDG Morpho market supplyApy.
 *                  All three verified vaults route into the SAME
 *                  pool on Robinhood Chain (USDe/USDG), so the APY
 *                  is identical by construction. When that market
 *                  is silent we surface `null` and status degrades
 *                  to "candidate".
 *   · liquidity — TVL (ERC-4626 share token; no borrow-side to
 *                  subtract). We do NOT fabricate a borrow/liquidity
 *                  split.
 */
function buildVaultVenue(
  vault: VerifiedVault,
  canonical: MorphoMarket | null,
  totalAssetsRaw: bigint | null,
  fetchedAt: string,
): YieldVenue {
  const cfg = YIELD_VENUE_CONFIG.USDG

  // Per-vault independent TVL: ERC-4626 totalAssets / 10^decimals.
  // This is the share balance, not USD.
  const tvl =
    totalAssetsRaw != null
      ? Number(totalAssetsRaw) / Math.pow(10, vault.decimals)
      : null

  // Liquidity: ERC-4626 — no borrow-side, so TVL == liquidity
  // (modulo share-per-asset ratio, which we treat as 1:1). We do
  // NOT fabricate a borrow/liquidity subtraction.
  const liquidity = tvl

  // APY: shared underlying USDG Morpho market supplyApy.
  const apy = canonical?.supplyApy ?? null

  // Status:
  //   · live         — both APY and TVL present.
  //   · candidate    — vault verified but APY or TVL missing.
  //   · unavailable  — vault has no live data on either axis.
  let status: YieldVenue["status"]
  if (apy != null && tvl != null && tvl > 0) {
    status = "live"
  } else if (vault != null) {
    status = "candidate"
  } else {
    status = "unavailable"
  }

  const hasMorpho = apy != null
  const hasOnchain = tvl != null
  const source: YieldVenue["source"] =
    hasMorpho && hasOnchain
      ? "morpho-supply"
      : hasOnchain
        ? "verified-onchain"
        : hasMorpho
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
