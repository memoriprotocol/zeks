/**
 * ZEKS Markets — Earn-specific Morpho single-market fetcher.
 *
 * SCOPE: This module is intentionally narrow. It is consumed ONLY by
 * the Earn SSR API route (/api/markets/lending/earn) to look up the
 * canonical AMZN market by its known Morpho Blue `marketId`.
 *
 * It does NOT touch:
 *   - `morpho.ts`              (the shared /api/markets/lending source)
 *   - `service.ts`             (the shared lending pipeline)
 *   - `mock.ts`                (placeholder data)
 *   - `supported.ts`           (the supported-asset registry)
 *   - `/api/markets/lending/route.ts` (shared SSR proxy)
 *
 * Hard rules:
 *   - Query Morpho by exact `marketId` only. No symbol filter.
 *   - On any failure or empty result: return `null` and emit
 *     `amzn_unavailable`. The caller MUST NOT fall back to mock.
 *   - Numeric `0` from Morpho is valid; do NOT treat it as missing.
 */

import { ROBINHOOD_CHAIN_ID } from "../types"
import { resolveProtocolContractsForChain } from "../protocol/registry"
import type { LendingMarket } from "./types"

export const MORPHO_GRAPHQL_ENDPOINT =
  "https://api.morpho.org/graphql"

/** Known canonical AMZN market on Robinhood Chain (4663). */
export const AMZN_MARKET_ID =
  "0xff762c8aee3849902b33d8ec6432668f19f88b755bf3dbf186f66a2cac7750ca"

/**
 * Minimal Morpho query — fetch ONE market by `marketId`, scoped to
 * one chain. We deliberately request only the fields we need so the
 * payload is small and the query is auditable.
 */
const MARKET_BY_ID_QUERY = /* GraphQL */ `
  query MarketById($marketId: String!, $chainId: Int!) {
    marketById(marketId: $marketId, chainId: $chainId) {
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
      irmAddress
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
`

interface RawMarketById {
  marketId: string
  chain?: { id: number } | null
  loanAsset?: {
    symbol?: string | null
    address?: string | null
    name?: string | null
  } | null
  collateralAsset?: {
    symbol?: string | null
    address?: string | null
    name?: string | null
  } | null
  oracleAddress?: string | null
  irm?: { address: string } | string | null
  irmAddress?: string | null
  lltv?: string | null
  listed?: boolean | null
  state?: {
    supplyApy?: number | null
    borrowApy?: number | null
    supplyAssetsUsd?: number | null
    borrowAssetsUsd?: number | null
    utilization?: number | null
  } | null
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

/**
 * Fetch a single Morpho Blue market by its `marketId`, on the
 * specified chain. Returns `null` on any failure (network error,
 * GraphQL error, or empty result). Never throws.
 *
 * IMPORTANT: This function MUST NOT be used to broaden the global
 * lending query — it is scoped to the Earn fallback path for the
 * single AMZN market.
 */
export async function fetchMorphoMarketById(
  marketId: string,
  chainId: number = ROBINHOOD_CHAIN_ID,
  options: { fetchTimeoutMs?: number } = {},
): Promise<RawMarketById | null> {
  const { fetchTimeoutMs = 6_000 } = options
  const id = (marketId ?? "").trim().toLowerCase()
  if (!id) return null

  try {
    const res = await fetch(MORPHO_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: MARKET_BY_ID_QUERY,
        variables: { marketId: id, chainId },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(fetchTimeoutMs),
    })
    if (!res.ok) return null
    const json = (await res.json()) as GraphQLResponse<{
      marketById: RawMarketById | null
    }>
    if (json.errors && json.errors.length > 0) return null
    const m = json.data?.marketById
    if (!m || typeof m !== "object") return null
    return m
  } catch {
    return null
  }
}

/** Convert Morpho's decimal APY (0.0421) to percent (4.21). */
function percent(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v * 100
}

/** Safe number or null — preserves `0`. */
function numberOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v
}

/** Morpho returns LLTV in WAD (1e18). Convert to a 0..1 fraction. */
function parseLltv(v: string | null | undefined): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n / 1e18
}

/**
 * Normalize a Morpho raw marketById result into the SAME
 * `LendingMarket` shape produced by the shared service
 * (`buildFromMorpho`). This guarantees downstream UI consumers see
 * the same field set.
 *
 * `0` values from Morpho are preserved. There is no mock fallback —
 * missing or malformed values become `null`.
 */
export function buildLendingMarketFromById(
  raw: RawMarketById,
  fetchedAt: string,
): LendingMarket {
  const collateralSym = (raw.collateralAsset?.symbol ?? "").toUpperCase()
  const name =
    (raw.collateralAsset?.name && raw.collateralAsset.name.length > 0
      ? raw.collateralAsset.name
      : collateralSym) || collateralSym

  const supplyUsd = numberOrNull(raw.state?.supplyAssetsUsd)
  const borrowUsd = numberOrNull(raw.state?.borrowAssetsUsd)
  const totalSupply = supplyUsd
  const totalBorrow = borrowUsd
  const availableLiquidity =
    supplyUsd !== null && borrowUsd !== null
      ? Math.max(0, supplyUsd - borrowUsd)
      : null
  const utilization = percent(raw.state?.utilization)

  // Pull the verified IRM / loan-token decimals from the same
  // canonical registry the shared service uses. This keeps the
  // Earn-specific AMZN row consistent with the shared rows.
  const verified = resolveProtocolContractsForChain(chainIdNumber(raw))
  const loanTokenDecimals = verified.loanTokenDecimals ?? null
  const irmAddress =
    typeof raw.irmAddress === "string"
      ? raw.irmAddress
      : raw.irm && typeof (raw.irm as { address?: string }).address === "string"
        ? (raw.irm as { address: string }).address
        : verified.morphoBlueIrmAddress ?? null

  return {
    symbol: collateralSym,
    name,
    logoUrl: null,
    oraclePrice: null,
    oracleSource: "unknown",
    supplyApy: percent(raw.state?.supplyApy),
    borrowApy: percent(raw.state?.borrowApy),
    totalSupply,
    totalBorrow,
    availableLiquidity,
    utilization,
    tvl: totalSupply,
    status: "active",
    protocolSource: "morpho",
    // This row is ALWAYS sourced from real Morpho. We never emit
    // sourceMode: "mock" from this path.
    sourceMode: raw.listed ? "real-morpho" : "real-morpho-unlisted",
    listed: typeof raw.listed === "boolean" ? raw.listed : false,
    contractAddress: null,
    marketId: raw.marketId ?? null,
    collateralAssetSymbol: collateralSym || null,
    loanAssetSymbol: (raw.loanAsset?.symbol ?? "").toUpperCase() || null,
    lltv: parseLltv(raw.lltv),
    oracleAddress: (raw.oracleAddress ?? "").toLowerCase() || null,
    irmAddress,
    loanTokenAddress: (raw.loanAsset?.address ?? "").toLowerCase() || null,
    collateralTokenAddress:
      (raw.collateralAsset?.address ?? "").toLowerCase() || null,
    loanTokenDecimals,
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
    fetchedAt,
    // F12 — the AMZN-by-id path produces a Morpho-sourced row; the
    // verifier in service.ts populates the F12 fields. Defaults are
    // conservative.
    lifecycle: null,
    onchainLltvWad: null,
    transactionEligible: false,
  }
}

function chainIdNumber(raw: RawMarketById): number {
  return typeof raw.chain?.id === "number" ? raw.chain.id : ROBINHOOD_CHAIN_ID
}
