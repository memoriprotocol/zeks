/**
 * ZEKS Markets — Morpho user-position reader.
 *
 * Reads real Morpho Blue positions for one wallet on Robinhood
 * Chain via the public Morpho GraphQL endpoint. The endpoint is the
 * same `api.morpho.org/graphql` that powers the existing lending
 * service; we extend that integration rather than adding a second
 * HTTP client.
 *
 * Position data the API exposes per market:
 *
 *   - supplyAssets        (raw, loan-token smallest units)
 *   - supplyAssetsUsd     (USD value)
 *   - borrowAssets
 *   - borrowAssetsUsd
 *   - collateral
 *   - collateralUsd
 *   - margin, marginUsd
 *   - borrowPnl, borrowPnlUsd
 *   - borrowRoe
 *
 * The position is keyed by `market.marketId` (32-byte hex) which we
 * use to join with the existing `LendingMarket` set in the lending
 * service.
 */

import type { Address } from "@/lib/wallet/types-common"
import { ROBINHOOD_CHAIN_ID_DEC } from "../onchain/rpc"
import { fetchMorphoMarkets } from "../lending/morpho"

export const ROBINHOOD_CHAIN_ID_HEX = "0x1237"
export const MORPHO_GRAPHQL_ENDPOINT = "https://api.morpho.org/graphql"

export interface RawMorphoUserPosition {
  /** Morpho market id (32-byte hex). */
  marketId: string
  /** Morpho Blue contract address the market lives on (per API). */
  morphoBlueAddress: string | null
  oracleAddress: string | null
  irmAddress: string | null
  /** LLTV as a 0..1 decimal (e.g. 0.965). */
  lltv: number | null
  loanAssetSymbol: string
  loanAssetAddress: string
  collateralAssetSymbol: string | null
  collateralAssetAddress: string | null
  marketSupplyApy: number | null
  marketBorrowApy: number | null
  marketUtilization: number | null
  supplyAssetsRaw: bigint
  supplyAssetsUsd: number | null
  borrowAssetsRaw: bigint
  borrowAssetsUsd: number | null
  collateralRaw: bigint
  collateralUsd: number | null
  marginRaw: bigint | null
  marginUsd: number | null
  borrowPnlRaw: bigint | null
  borrowPnlUsd: number | null
  borrowRoe: number | null
}

export interface UserPositionsResult {
  positions: RawMorphoUserPosition[]
  fetchedAt: string
  /** True when the API was unreachable; positions may still be present
   * (e.g. partial fill of one network request). */
  partial: boolean
  /** Underlying error message if the API call failed. */
  apiError: string | null
}

const USER_POSITIONS_QUERY = /* GraphQL */ `
  query UserMarketPositions($user: String!) {
    marketPositions(where: { userAddress_in: [$user] }) {
      items {
        market {
          marketId
          morphoBlue {
            address
          }
          oracle {
            address
          }
          irmAddress
          lltv
          loanAsset {
            symbol
            address
          }
          collateralAsset {
            symbol
            address
          }
          state {
            supplyApy
            borrowApy
            utilization
          }
        }
        state {
          collateral
          collateralUsd
          supplyAssets
          supplyAssetsUsd
          borrowAssets
          borrowAssetsUsd
          margin
          marginUsd
          borrowPnl
          borrowPnlUsd
          borrowRoe
        }
      }
    }
  }
`

interface RawUserPositionResponse {
  data?: {
    marketPositions?: {
      items?: Array<{
        market?: {
          marketId?: string
          morphoBlue?: { address?: string | null } | null
          oracle?: { address?: string | null } | null
          irmAddress?: string | null
          lltv?: string | number | null
          loanAsset?: { symbol?: string; address?: string } | null
          collateralAsset?: { symbol?: string | null; address?: string | null } | null
          state?: {
            supplyApy?: number | null
            borrowApy?: number | null
            utilization?: number | null
          } | null
        } | null
        state?: {
          collateral?: string | null
          collateralUsd?: number | null
          supplyAssets?: string | null
          supplyAssetsUsd?: number | null
          borrowAssets?: string | null
          borrowAssetsUsd?: number | null
          margin?: string | null
          marginUsd?: number | null
          borrowPnl?: string | null
          borrowPnlUsd?: number | null
          borrowRoe?: number | null
        } | null
      }>
    }
  }
  errors?: Array<{ message: string }>
}

/**
 * BigInt strings can be huge — `BigInt(...)` rejects scientific
 * notation. We coerce defensively.
 */
function safeBigInt(v: string | null | undefined): bigint {
  if (!v) return BigInt(0)
  try {
    return BigInt(v)
  } catch {
    return BigInt(0)
  }
}

/**
 * LLTV is returned by the API as a 0..1 decimal string (e.g.
 * "0.965") or sometimes as a numeric percentage. We coerce to a
 * 0..1 float; UI layers multiply by 100 for percent display.
 */
function safeLltv(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === "string" ? Number(v) : v
  if (!Number.isFinite(n)) return null
  if (n > 1.5) return n / 100 // likely already percent
  return n
}

/**
 * Fetch all Morpho Blue positions for `user` on Robinhood Chain.
 * Returns an empty array when the user has no positions, and a
 * `partial: true` flag + `apiError` when the upstream is
 * unreachable.
 */
export async function fetchUserMarketPositions(
  user: Address,
  options: { fetchTimeoutMs?: number } = {},
): Promise<UserPositionsResult> {
  const { fetchTimeoutMs = 6_000 } = options
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), fetchTimeoutMs)
  try {
    const res = await fetch(MORPHO_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: USER_POSITIONS_QUERY,
        variables: { user },
      }),
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(t)
    if (!res.ok) {
      return {
        positions: [],
        fetchedAt: new Date().toISOString(),
        partial: true,
        apiError: `HTTP ${res.status}`,
      }
    }
    const j = (await res.json()) as RawUserPositionResponse
    if (j.errors && j.errors.length > 0) {
      return {
        positions: [],
        fetchedAt: new Date().toISOString(),
        partial: true,
        apiError: j.errors.map((e) => e.message).join("; "),
      }
    }
    const items = j.data?.marketPositions?.items ?? []
    const positions: RawMorphoUserPosition[] = []
    for (const it of items) {
      const m = it.market
      const s = it.state
      if (!m || !s || !m.marketId) continue
      positions.push({
        marketId: m.marketId,
        morphoBlueAddress: m.morphoBlue?.address ?? null,
        oracleAddress: m.oracle?.address ?? null,
        irmAddress: m.irmAddress ?? null,
        lltv: safeLltv(m.lltv ?? null),
        loanAssetSymbol: m.loanAsset?.symbol ?? "?",
        loanAssetAddress: m.loanAsset?.address ?? "",
        collateralAssetSymbol: m.collateralAsset?.symbol ?? null,
        collateralAssetAddress: m.collateralAsset?.address ?? null,
        marketSupplyApy: m.state?.supplyApy ?? null,
        marketBorrowApy: m.state?.borrowApy ?? null,
        marketUtilization: m.state?.utilization ?? null,
        supplyAssetsRaw: safeBigInt(s.supplyAssets),
        supplyAssetsUsd: typeof s.supplyAssetsUsd === "number" ? s.supplyAssetsUsd : null,
        borrowAssetsRaw: safeBigInt(s.borrowAssets),
        borrowAssetsUsd: typeof s.borrowAssetsUsd === "number" ? s.borrowAssetsUsd : null,
        collateralRaw: safeBigInt(s.collateral),
        collateralUsd: typeof s.collateralUsd === "number" ? s.collateralUsd : null,
        marginRaw: s.margin ? safeBigInt(s.margin) : null,
        marginUsd: typeof s.marginUsd === "number" ? s.marginUsd : null,
        borrowPnlRaw: s.borrowPnl ? safeBigInt(s.borrowPnl) : null,
        borrowPnlUsd: typeof s.borrowPnlUsd === "number" ? s.borrowPnlUsd : null,
        borrowRoe: typeof s.borrowRoe === "number" ? s.borrowRoe : null,
      })
    }
    return {
      positions,
      fetchedAt: new Date().toISOString(),
      partial: false,
      apiError: null,
    }
  } catch (err) {
    clearTimeout(t)
    return {
      positions: [],
      fetchedAt: new Date().toISOString(),
      partial: true,
      apiError: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Convenience — fetch Morpho market list (already used by the
 * lending service) so callers can decorate positions with cached
 * market metadata. We re-export this so the portfolio layer does
 * not need to know about `lending/morpho`.
 */
export async function fetchMarketsForChain(
  chainId: number = ROBINHOOD_CHAIN_ID_DEC,
) {
  return fetchMorphoMarkets(chainId)
}
