/**
 * ZEKS Markets — Onchain Lending Service
 *
 * Aggregates data from three real sources:
 *
 *   1. Robinhood Stock Token Registry
 *      GET https://api.robinhood.com/rhj/assets
 *      → rhContractAddress, rhMultiplier, rhLogoUrl, asset name
 *
 *   2. Robinhood Reference Market Prices
 *      GET https://api.robinhood.com/rhj/prices/{symbol}
 *      → referenceBid, referenceAsk, referencePrice, referenceGeneratedAt,
 *        referenceIsHalt
 *
 *   3. Chainlink Oracle (via Robinhood RPC)
 *      eth_call latestRoundData() on feed proxy
 *      → oraclePrice, oracleSource ("chainlink"), oracleUpdatedAt
 *
 *   4. Morpho Blue (via public GraphQL)
 *      POST https://api.morpho.org/graphql
 *      → supplyApy, borrowApy, totalSupply, totalBorrow,
 *        availableLiquidity, utilization, tvl, marketId,
 *        collateralAssetSymbol, loanAssetSymbol, listed,
 *        protocolSource ("morpho"), sourceMode
 *
 * Mock fallback:
 *   - Only when a source genuinely has no data for a symbol.
 *   - Every mock row carries `sourceMode: "mock"` so the UI
 *     can never mistake it for live data.
 *
 * Diagnostics (dev only):
 *   - morphoEndpoint, chainId, morphoMarketsReturned, chainMarketsReturned,
 *     marketsServed, symbolMapping, oracleResolvedSymbols, rhMetadataResolvedSymbols
 */

import type {
  LendingMarket,
  LendingServiceResult,
  LendingMarketSet,
  LendingDiagnostics,
} from "./types"
import { MOCK_LENDING_MARKETS } from "./mock"
import {
  fetchMorphoMarkets,
  type MorphoMarket,
  DEFAULT_MORPHO_CHAIN_ID,
  MORPHO_GRAPHQL_ENDPOINT,
} from "./morpho"
import {
  fetchStockTokenMetadata,
  type StockTokenMetadata,
} from "../robinhood-stock-token"
import {
  readOraclePrices,
  type OracleReading,
} from "../oracle"
import {
  fetchReferenceMarketPrices,
  type ReferenceMarketPrice,
} from "../robinhood-reference-market"
import {
  resolveProtocolContractsForChain,
  ROBINHOOD_CHAIN_ID_DEC,
} from "../onchain"

/** Enable to print diagnostics to the server console. */
const DEBUG = process.env.NODE_ENV !== "production"

interface ServiceOptions {
  /** When provided, restrict output to these symbols (case-insensitive). */
  symbols?: readonly string[]
  /** Enable verbose dev logging. */
  debug?: boolean
}

/**
 * Fetch lending market data, merging all four sources into the
 * `LendingMarket[]` shape.
 *
 * Sources are fetched concurrently. A failure in any one source does
 * NOT fail the entire result — the market row simply has null for
 * the missing fields.
 *
 * Mock data is only used when the lending service layer has no
 * real data for a symbol (e.g. the symbol has no Morpho market).
 */
export async function fetchLendingMarkets(
  symbols?: readonly string[],
  options: ServiceOptions = {},
): Promise<LendingServiceResult> {
  const debug = options.debug ?? DEBUG
  const fetchedAt = new Date().toISOString()

  // Symbols to process — either the full mock universe or a subset.
  const requested = symbols && symbols.length > 0
    ? new Set(symbols.map((s) => s.toUpperCase()))
    : null

  const mockUniverse = MOCK_LENDING_MARKETS.filter(
    (m) => !requested || requested.has(m.symbol),
  )
  if (mockUniverse.length === 0) {
    return {
      kind: "empty",
      payload: { markets: [], fetchedAt, failedSymbols: [] },
      reason: "No symbols matched the requested set.",
    }
  }

  const symbolList = mockUniverse.map((m) => m.symbol)

  // ── Parallel source fetches ─────────────────────────────────────
  const [morphoResult, rhMeta, oracleReadings, refPrices] = await Promise.all([
    fetchMorphoMarkets(DEFAULT_MORPHO_CHAIN_ID, { debug }),
    fetchStockTokenMetadata(symbolList).catch((err) => {
      if (debug) console.warn(`[lending] rh metadata fetch failed: ${err}`)
      return new Map<string, StockTokenMetadata>()
    }),
    readOraclePrices(symbolList, { debug }).catch((err) => {
      if (debug) console.warn(`[lending] oracle fetch failed: ${err}`)
      return new Map<string, OracleReading>()
    }),
    fetchReferenceMarketPrices(symbolList).catch((err) => {
      if (debug) console.warn(`[lending] reference market fetch failed: ${err}`)
      return new Map<string, ReferenceMarketPrice>()
    }),
  ])

  // ── Build Morpho canonical market map ──────────────────────────
  const morphoByCollateral = pickCanonicalMarkets(morphoResult.markets)

  // ── Assemble rows ──────────────────────────────────────────────
  const markets: LendingMarket[] = []
  const failedSymbols: string[] = []
  const symbolMapping: Record<string, string | null> = {}
  const oracleResolved: string[] = []
  const rhResolved: string[] = []

  for (const mock of mockUniverse) {
    const sym = mock.symbol
    symbolMapping[sym] = null

    const morphoMarket = morphoByCollateral.get(sym.toUpperCase())
    if (morphoMarket) {
      symbolMapping[sym] = morphoMarket.marketId
    }

    const rh = rhMeta.get(sym.toUpperCase())
    if (rh) rhResolved.push(sym)

    const oracle = oracleReadings.get(sym.toUpperCase())
    if (oracle?.isLive) oracleResolved.push(sym)

    const ref = refPrices.get(sym.toUpperCase())

    if (morphoMarket) {
      markets.push(
        buildFromMorpho(
          morphoMarket,
          fetchedAt,
          rh ?? null,
          oracle ?? null,
          ref ?? null,
        ),
      )
    } else {
      // No Morpho market → use mock, but enrich with whatever
      // Robinhood / oracle data is available.
      failedSymbols.push(sym)
      markets.push(
        buildFromMock(
          mock,
          fetchedAt,
          rh ?? null,
          oracle ?? null,
          ref ?? null,
        ),
      )
    }
  }

  // ── Append surplus Morpho markets not in the ZEKS universe ──────
  const zeksSymbols = new Set(mockUniverse.map((m) => m.symbol.toUpperCase()))
  for (const m of morphoResult.markets) {
    const collateral = (m.collateralAssetSymbol || "").toUpperCase()
    if (!collateral) continue
    if (zeksSymbols.has(collateral)) continue
    if (morphoByCollateral.get(collateral)?.marketId !== m.marketId) continue
    markets.push(
      buildFromMorpho(
        m,
        fetchedAt,
        null,
        oracleReadings.get(collateral) ?? null,
        refPrices.get(collateral) ?? null,
      ),
    )
  }

  // ── Diagnostics ───────────────────────────────────────────────
  if (debug) {
    console.info(`[lending] morpho.endpoint=${MORPHO_GRAPHQL_ENDPOINT}`)
    console.info(`[lending] morpho.chainId=${morphoResult.chainId}`)
    console.info(
      `[lending] morpho.marketsReturned=${morphoResult.markets.length}`,
    )
    const realMorpho = markets.filter(
      (m) => m.sourceMode === "real-morpho" || m.sourceMode === "real-morpho-unlisted",
    ).length
    const mockRows = markets.filter((m) => m.sourceMode === "mock").length
    console.info(`[lending] sourceBreakdown realMorpho=${realMorpho} mock=${mockRows}`)
    console.info(`[lending] oracleResolved=${oracleResolved.join(",")}`)
    console.info(`[lending] rhMetadataResolved=${rhResolved.join(",")}`)
    console.info(`[lending] symbolMapping=${JSON.stringify(symbolMapping)}`)
  }

  // ── Build result ───────────────────────────────────────────────
  const payload: LendingMarketSet = { markets, fetchedAt, failedSymbols }

  if (markets.length === 0) {
    return {
      kind: "empty",
      payload,
      reason: "No lending markets found for the current symbol set.",
    }
  }

  if (failedSymbols.length > 0) {
    return {
      kind: "partial",
      payload,
      reason:
        failedSymbols.length === markets.length
          ? "All markets are using mock data (no Morpho markets found for these symbols)."
          : `${failedSymbols.length} symbol(s) have no live Morpho market and are using mock data.`,
    }
  }

  return { kind: "ok", payload }
}

/**
 * Fetch a single lending market by symbol. Tries live Morpho first,
 * falls back to mock for ZEKS-universe symbols.
 */
export async function fetchLendingMarket(
  symbol: string,
): Promise<LendingMarket | null> {
  const upper = String(symbol ?? "").trim().toUpperCase()
  const fetchedAt = new Date().toISOString()
  const [morphoResult, rh, oracle, ref] = await Promise.all([
    fetchMorphoMarkets(DEFAULT_MORPHO_CHAIN_ID),
    fetchStockTokenMetadata([upper]).catch(() => new Map()),
    readOraclePrices([upper]).catch(() => new Map()),
    fetchReferenceMarketPrices([upper]).catch(() => new Map()),
  ])
  const morphoByCollateral = pickCanonicalMarkets(morphoResult.markets)
  const m = morphoByCollateral.get(upper)
  if (m) {
    return buildFromMorpho(
      m,
      fetchedAt,
      rh.get(upper) ?? null,
      oracle.get(upper) ?? null,
      ref.get(upper) ?? null,
    )
  }
  const mock = MOCK_LENDING_MARKETS.find((x) => x.symbol === upper)
  if (mock) {
    return buildFromMock(
      mock,
      fetchedAt,
      rh.get(upper) ?? null,
      oracle.get(upper) ?? null,
      ref.get(upper) ?? null,
    )
  }
  return null
}

export function knownLendingSymbols(): string[] {
  return MOCK_LENDING_MARKETS.map((m) => m.symbol)
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function pickCanonicalMarkets(
  markets: MorphoMarket[],
): Map<string, MorphoMarket> {
  const byKey = new Map<string, MorphoMarket>()
  for (const m of markets) {
    const key = (m.collateralAssetSymbol || "").toUpperCase()
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, m)
      continue
    }
    const a = m.supplyAssetsUsd ?? 0
    const b = existing.supplyAssetsUsd ?? 0
    if (a > b) byKey.set(key, m)
  }
  return byKey
}

function buildFromMorpho(
  m: MorphoMarket,
  fetchedAt: string,
  rh: StockTokenMetadata | null,
  oracle: OracleReading | null,
  ref: ReferenceMarketPrice | null,
): LendingMarket {
  const collateralSym = (m.collateralAssetSymbol || "").toUpperCase()
  const name =
    (rh?.name && rh.name.length > 0)
      ? rh.name
      : m.collateralAssetName && m.collateralAssetName.length > 0
        ? m.collateralAssetName
        : collateralSym

  const supplyUsd = m.supplyAssetsUsd
  const borrowUsd = m.borrowAssetsUsd
  const totalSupply = supplyUsd
  const totalBorrow = borrowUsd
  const availableLiquidity =
    supplyUsd !== null && borrowUsd !== null
      ? Math.max(0, supplyUsd - borrowUsd)
      : null

  // Pull verified Morpho IRM and loan-token decimals from the
  // protocol registry snapshot. The GraphQL does not expose the IRM
  // directly; the registry provides the canonical Adaptive Curve IRM
  // for this chain. `loanTokenDecimals` is 6 for USDG on 4663.
  const verifiedContracts = resolveProtocolContractsForChain(
    ROBINHOOD_CHAIN_ID_DEC,
  )
  const loanTokenDecimalsFromRegistry =
    verifiedContracts.loanTokenDecimals ?? null
  const irmFromRegistry =
    verifiedContracts.morphoBlueIrmAddress ?? null

  return {
    symbol: collateralSym,
    name,
    logoUrl: rh?.logoUrl ?? m.collateralAssetName
      ? null
      : null,
    oraclePrice: oracle?.price ?? null,
    oracleSource: oracle?.isLive ? "chainlink" : "unknown",
    supplyApy: m.supplyApy,
    borrowApy: m.borrowApy,
    totalSupply,
    totalBorrow,
    availableLiquidity,
    utilization: m.utilization,
    tvl: totalSupply,
    status: "active",
    protocolSource: "morpho",
    sourceMode: m.listed ? "real-morpho" : "real-morpho-unlisted",
    listed: m.listed,
    contractAddress: rh?.contractAddress ?? null,
    marketId: m.marketId,
    collateralAssetSymbol: collateralSym,
    loanAssetSymbol: (m.loanAssetSymbol || "").toUpperCase() || null,
    lltv: m.lltv ?? null,
    oracleAddress: m.oracleAddress ?? null,
    // IRM: prefer GraphQL value; fall back to verified registry.
    // GraphQL currently does not expose this field.
    irmAddress: m.irmAddress ?? irmFromRegistry ?? null,
    loanTokenAddress: m.loanAssetAddress ?? null,
    collateralTokenAddress: m.collateralAssetAddress ?? null,
    // Decimals: prefer per-token metadata; fall back to the
    // registry default (USDG = 6 on Robinhood Chain).
    loanTokenDecimals:
      m.loanAssetDecimals ?? loanTokenDecimalsFromRegistry ?? null,
    rhContractAddress: rh?.contractAddress ?? null,
    rhMultiplier: rh?.currentMultiplier ?? null,
    rhTokenDecimals: rh?.tokenDecimals ?? null,
    rhLogoUrl: rh?.logoUrl ?? null,
    referenceBid: ref?.bid ?? null,
    referenceAsk: ref?.ask ?? null,
    referencePrice: ref?.referencePrice ?? null,
    referenceGeneratedAt: ref?.generatedAt ?? null,
    referenceIsHalt: ref?.isTradingHalt ?? false,
    chainId: 4663,
    fetchedAt,
  }
}

function buildFromMock(
  mock: LendingMarket,
  fetchedAt: string,
  rh: StockTokenMetadata | null,
  oracle: OracleReading | null,
  ref: ReferenceMarketPrice | null,
): LendingMarket {
  return {
    ...mock,
    fetchedAt,
    sourceMode: "mock",
    protocolSource: "mock",
    oracleSource: oracle?.isLive ? "chainlink" : "mock",
    oraclePrice: oracle?.price ?? mock.oraclePrice,
    rhContractAddress: rh?.contractAddress ?? mock.rhContractAddress,
    rhMultiplier: rh?.currentMultiplier ?? mock.rhMultiplier,
    rhTokenDecimals: rh?.tokenDecimals ?? mock.rhTokenDecimals,
    rhLogoUrl: rh?.logoUrl ?? mock.rhLogoUrl,
    referenceBid: ref?.bid ?? mock.referenceBid,
    referenceAsk: ref?.ask ?? mock.referenceAsk,
    referencePrice: ref?.referencePrice ?? mock.referencePrice,
    referenceGeneratedAt: ref?.generatedAt ?? mock.referenceGeneratedAt,
    referenceIsHalt: ref?.isTradingHalt ?? mock.referenceIsHalt,
  }
}
