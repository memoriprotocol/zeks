/**
 * ZEKS Markets — Morpho Provider
 *
 * Public Morpho Blue GraphQL client. Returns raw, normalized market
 * records for a target chain (default: Robinhood Chain, 4663).
 *
 * No API key required — the public `api.morpho.org` endpoint is
 * unauthenticated with standard public rate limits.
 *
 *   Endpoint: https://api.morpho.org/graphql
 *   Filter:   { chainId_in: [4663], listed: true }
 *
 * NEVER log or expose any auth credentials. This provider uses
 * zero secrets.
 *
 * The shape returned here is normalized for internal use; the
 * lending service in `./service.ts` further maps each market to the
 * ZEKS `LendingMarket` view.
 */

import { ROBINHOOD_CHAIN_ID } from "../types"

export const MORPHO_GRAPHQL_ENDPOINT =
  "https://api.morpho.org/graphql"

export const DEFAULT_MORPHO_CHAIN_ID: typeof ROBINHOOD_CHAIN_ID =
  ROBINHOOD_CHAIN_ID

/** Raw normalized Morpho Blue market record (subset we care about). */
export interface MorphoMarket {
  marketId: string
  chainId: number
  loanAssetSymbol: string
  loanAssetAddress: string
  loanAssetName: string | null
  collateralAssetSymbol: string
  collateralAssetAddress: string
  collateralAssetName: string | null
  oracleAddress: string
  lltv: number | null
  listed: boolean
  supplyApy: number | null
  borrowApy: number | null
  supplyAssetsUsd: number | null
  borrowAssetsUsd: number | null
  utilization: number | null
}

export interface MorphoFetchResult {
  markets: MorphoMarket[]
  /** Raw number returned from Morpho (≤ 100 due to default cap). */
  totalReturned: number
  /** The chainId filter applied. */
  chainId: number
  /** The endpoint used. */
  endpoint: string
}

interface RawMorphoMarket {
  marketId: string
  chain: { id: number }
  loanAsset: { symbol: string; address: string; name?: string | null }
  collateralAsset: {
    symbol: string
    address: string
    name?: string | null
  }
  oracleAddress: string
  lltv: string
  listed: boolean
  state: {
    supplyApy: number | null
    borrowApy: number | null
    supplyAssetsUsd: number | null
    borrowAssetsUsd: number | null
    utilization: number | null
  }
}

/** GraphQL query for ALL Morpho Blue markets on a given chain.

    We deliberately do NOT filter by `listed: true` here. On
    Robinhood Chain (4663) Morpho's official `listed` filter only
    returns 2 markets — the stock-token-collateralized markets
    (AAPL/TSLA/NVDA/etc.) exist on-chain but are flagged
    unlisted. We surface them too, with `listed: false` preserved,
    and the UI tags them as `real-morpho-unlisted`. */
const CHAIN_MARKETS_QUERY = /* GraphQL */ `
  query ChainMarkets($chainId: [Int!]) {
    markets(
      first: 100
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { chainId_in: $chainId }
    ) {
      items {
        marketId
        chain {
          id
        }
        loanAsset {
          symbol
          address
          name
        }
        collateralAsset {
          symbol
          address
          name
        }
        oracleAddress
        lltv
        listed
        state {
          supplyApy
          borrowApy
          supplyAssetsUsd
          borrowAssetsUsd
          utilization
        }
      }
    }
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

/**
 * Morpho query that returns ALL markets for a chain, filtered to
 * specific loan assets (by contract address). The Morpho GraphQL
 * filter is `loanAssetAddress_in` — there is no
 * `loanAssetSymbol_in` filter on the Markets collection.
 *
 * We deliberately return the whole market row so we can pick the
 * highest-TVL market per loan token ourselves.
 */
const LOAN_MARKETS_QUERY = /* GraphQL */ `
  query MarketsByLoanAddress($chainId: [Int!], $loanAddresses: [String!]) {
    markets(
      first: 50
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { chainId_in: $chainId, loanAssetAddress_in: $loanAddresses }
    ) {
      items {
        marketId
        chain { id }
        loanAsset { symbol address name }
        collateralAsset { symbol address name }
        oracleAddress
        lltv
        listed
        state {
          supplyApy
          borrowApy
          supplyAssetsUsd
          borrowAssetsUsd
          utilization
        }
      }
    }
  }
`

/**
 * Resolve the contract addresses for a set of loan-asset symbols
 * on a given chain. The Morpho GraphQL markets filter only accepts
 * addresses — there is no symbol-based filter — so we look up the
 * address via the `assets` collection first.
 */
const ASSETS_BY_SYMBOL_QUERY = /* GraphQL */ `
  query AssetsBySymbol($chainId: Int!, $symbols: [String!]) {
    assets(where: { chainId_in: [$chainId], symbol_in: $symbols }, first: 50) {
      items {
        address
        symbol
        chain { id }
      }
    }
  }
`

/**
 * Fetch Morpho markets on the target chain whose loan-asset matches
 * one of the given symbols.
 *
 * The Morpho GraphQL `markets` filter only accepts
 * `loanAssetAddress_in` — there is no symbol filter — so we look up
 * the contract addresses for the symbols via the `assets`
 * collection first, then filter markets by those addresses.
 *
 * Returns the full MorphoMarket[] (one row per market). Caller picks
 * the canonical (highest-TVL supply) market per loan token. No API
 * key required.
 */
export async function fetchLoanAssetMarkets(
  loanSymbols: readonly string[],
  chainId: number = DEFAULT_MORPHO_CHAIN_ID,
  options: { fetchTimeoutMs?: number; debug?: boolean } = {},
): Promise<MorphoFetchResult> {
  const { fetchTimeoutMs = 6_000, debug = false } = options

  if (loanSymbols.length === 0) {
    return { markets: [], totalReturned: 0, chainId, endpoint: MORPHO_GRAPHQL_ENDPOINT }
  }

  const upperSymbols = loanSymbols.map((s) => s.toUpperCase())

  // Step 1 — resolve loan-asset contract addresses via assets query
  const loanAddresses = await fetchLoanAssetAddresses(
    upperSymbols,
    chainId,
    { fetchTimeoutMs, debug },
  )

  if (loanAddresses.length === 0) {
    if (debug) {
      console.warn(
        `[morpho] no loan-asset addresses resolved for symbols=${upperSymbols.join(",")}`,
      )
    }
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint: MORPHO_GRAPHQL_ENDPOINT,
    }
  }

  // Step 2 — query markets filtered by those addresses
  const body = JSON.stringify({
    query: LOAN_MARKETS_QUERY,
    variables: {
      chainId: [chainId],
      loanAddresses,
    },
  })

  let res: Response
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), fetchTimeoutMs)
    res = await fetch(MORPHO_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(t)
  } catch {
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint: MORPHO_GRAPHQL_ENDPOINT,
    }
  }

  if (!res.ok) {
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint: MORPHO_GRAPHQL_ENDPOINT,
    }
  }

  let json: GraphQLResponse<{
    markets: { items: RawMorphoMarket[] }
  }>
  try {
    json = (await res.json()) as GraphQLResponse<{
      markets: { items: RawMorphoMarket[] }
    }>
  } catch {
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint: MORPHO_GRAPHQL_ENDPOINT,
    }
  }

  if (json.errors && json.errors.length > 0) {
    if (debug) {
      console.warn(
        `[morpho] loan-market GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      )
    }
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint: MORPHO_GRAPHQL_ENDPOINT,
    }
  }

  const raw = json.data?.markets.items ?? []
  const markets: MorphoMarket[] = raw.map((m) => ({
    marketId: m.marketId,
    chainId: m.chain?.id ?? chainId,
    loanAssetSymbol: m.loanAsset?.symbol ?? "",
    loanAssetAddress: m.loanAsset?.address ?? "",
    loanAssetName: m.loanAsset?.name ?? null,
    collateralAssetSymbol: m.collateralAsset?.symbol ?? "",
    collateralAssetAddress: m.collateralAsset?.address ?? "",
    collateralAssetName: m.collateralAsset?.name ?? null,
    oracleAddress: m.oracleAddress ?? "",
    lltv: parseLltv(m.lltv),
    listed: Boolean(m.listed),
    supplyApy: percent(m.state?.supplyApy),
    borrowApy: percent(m.state?.borrowApy),
    supplyAssetsUsd: numberOrNull(m.state?.supplyAssetsUsd),
    borrowAssetsUsd: numberOrNull(m.state?.borrowAssetsUsd),
    utilization: percent(m.state?.utilization),
  }))

  return {
    markets,
    totalReturned: raw.length,
    chainId,
    endpoint: MORPHO_GRAPHQL_ENDPOINT,
  }
}

/**
 * Resolve Morpho asset contract addresses for the given symbols on
 * the target chain. Returns lowercase addresses (the GraphQL filter
 * expects lowercase). Empty array when no symbols resolve or the
 * network call fails.
 */
async function fetchLoanAssetAddresses(
  symbols: readonly string[],
  chainId: number,
  options: { fetchTimeoutMs?: number; debug?: boolean } = {},
): Promise<string[]> {
  const { fetchTimeoutMs = 6_000, debug = false } = options

  const body = JSON.stringify({
    query: ASSETS_BY_SYMBOL_QUERY,
    variables: {
      chainId,
      symbols: Array.from(new Set(symbols)),
    },
  })

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), fetchTimeoutMs)
    const res = await fetch(MORPHO_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(t)
    if (!res.ok) return []
    const json = (await res.json()) as GraphQLResponse<{
      assets: { items: Array<{ address: string; symbol: string; chain: { id: number } }> }
    }>
    if (json.errors && json.errors.length > 0) return []
    const items = json.data?.assets.items ?? []
    const addrs = items
      .filter((a) => a.chain?.id === chainId)
      .map((a) => (a.address ?? "").toLowerCase())
      .filter((a) => a.length > 0)
    if (debug) {
      console.info(
        `[morpho] resolved loan-asset addresses: ${addrs.join(",")} (symbols=${symbols.join(",")})`,
      )
    }
    return addrs
  } catch {
    return []
  }
}

/**
 * Fetch listed Morpho Blue markets for the target chain.
 *
 * Uses the public `api.morpho.org` GraphQL endpoint. No API key
 * required. The default cap is 100 — sufficient for Robinhood Chain
 * today (probe shows 100 listed markets, all on 4663).
 *
 * On error, returns an empty result with the error context. The
 * caller decides whether to fall back to mock.
 */
export async function fetchMorphoMarkets(
  chainId: number = DEFAULT_MORPHO_CHAIN_ID,
  options: { fetchTimeoutMs?: number; debug?: boolean } = {},
): Promise<MorphoFetchResult> {
  const { fetchTimeoutMs = 6_000, debug = false } = options
  const endpoint = MORPHO_GRAPHQL_ENDPOINT

  const body = JSON.stringify({
    query: CHAIN_MARKETS_QUERY,
    variables: { chainId: [chainId] },
  })

  if (debug) {
    console.info(
      `[morpho] request endpoint=${endpoint} chainId=${chainId}`,
    )
  }

  let res: Response
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), fetchTimeoutMs)
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
      // Cache bust per request so dev refresh always hits live.
      cache: "no-store",
    })
    clearTimeout(t)
  } catch (err) {
    if (debug) {
      console.warn(
        `[morpho] fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint,
    }
  }

  if (!res.ok) {
    if (debug) {
      console.warn(`[morpho] HTTP ${res.status} from ${endpoint}`)
    }
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint,
    }
  }

  let json: GraphQLResponse<{
    markets: { items: RawMorphoMarket[] }
  }>
  try {
    json = (await res.json()) as GraphQLResponse<{
      markets: { items: RawMorphoMarket[] }
    }>
  } catch {
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint,
    }
  }

  if (json.errors && json.errors.length > 0) {
    if (debug) {
      console.warn(
        `[morpho] GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      )
    }
    return {
      markets: [],
      totalReturned: 0,
      chainId,
      endpoint,
    }
  }

  const raw = json.data?.markets.items ?? []

  if (debug) {
    console.info(`[morpho] returned ${raw.length} markets for chainId=${chainId}`)
  }

  const markets: MorphoMarket[] = raw.map((m) => ({
    marketId: m.marketId,
    chainId: m.chain?.id ?? chainId,
    loanAssetSymbol: m.loanAsset?.symbol ?? "",
    loanAssetAddress: m.loanAsset?.address ?? "",
    loanAssetName: m.loanAsset?.name ?? null,
    collateralAssetSymbol: m.collateralAsset?.symbol ?? "",
    collateralAssetAddress: m.collateralAsset?.address ?? "",
    collateralAssetName: m.collateralAsset?.name ?? null,
    oracleAddress: m.oracleAddress ?? "",
    lltv: parseLltv(m.lltv),
    listed: Boolean(m.listed),
    supplyApy: percent(m.state?.supplyApy),
    borrowApy: percent(m.state?.borrowApy),
    supplyAssetsUsd: numberOrNull(m.state?.supplyAssetsUsd),
    borrowAssetsUsd: numberOrNull(m.state?.borrowAssetsUsd),
    utilization: percent(m.state?.utilization),
  }))

  return {
    markets,
    totalReturned: raw.length,
    chainId,
    endpoint,
  }
}

function percent(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  // Morpho returns APYs as decimals (e.g. 0.0421 = 4.21%). The ZEKS
  // LendingMarket contract documents APYs in percent (e.g. 4.32).
  return v * 100
}

function numberOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v
}

function parseLltv(v: string | null | undefined): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // Morpho returns LLTV in WAD (1e18). Convert to fraction.
  return n / 1e18
}
