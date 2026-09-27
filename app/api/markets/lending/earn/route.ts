/**
 * GET /api/markets/lending/earn
 *
 * Earn-specific lending market route. This is a NEW, separate
 * endpoint from `/api/markets/lending`. It:
 *
 *   1. Calls the SAME shared `fetchLendingMarkets()` function used by
 *      the Dashboard, Markets, Borrow, Portfolio, and Activity
 *      pages — no changes to the shared pipeline.
 *   2. Filters to SUPPORTED_EARN_SYMBOLS (AAPL/SPCX/TSLA/NVDA/GOOGL/
 *      AMZN/MSFT/META) — symbol-based, not logo-based.
 *   3. Rejects every row whose `sourceMode === "mock"`. Mock rows
 *      are NEVER rendered on Earn.
 *   4. Reuses the seven real Morpho rows that already exist in the
 *      shared response as-is. No re-fetch, no re-mapping.
 *   5. If AMZN is missing, performs a DEDICATED Morpho single-market
 *      lookup by exact marketId. No symbol-based Morpho filter is
 *      ever used here.
 *   6. If the dedicated AMZN lookup fails or returns no market:
 *      AMZN is omitted from the Earn dataset, `amzn_unavailable` is
 *      reported, and there is NO mock fallback / NO synthesis.
 *
 * Hard contract:
 *   - `sourceMode === "mock"` is impossible in the returned payload.
 *   - Numeric `0` from Morpho is preserved (never substituted).
 *   - Shared `/api/markets/lending/route.ts` is not touched.
 */

import { NextResponse } from "next/server"
import {
  fetchLendingMarkets,
  toWireLendingMarket,
  type LendingMarket,
} from "@/lib/markets/lending"
import {
  AMZN_MARKET_ID,
  buildLendingMarketFromById,
  fetchMorphoMarketById,
} from "@/lib/markets/lending/morpho-by-id"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CACHE_TTL_MS = 15_000

let inFlight: Promise<EarnResponse> | null = null

function fetchDeduped(): Promise<EarnResponse> {
  if (inFlight) return inFlight
  inFlight = (async (): Promise<EarnResponse> => {
    // 1. Reuse the existing shared lending call unchanged.
    const result = await fetchLendingMarkets(undefined, { debug: false })
    const sharedMarkets =
      result.kind === "error" ? [] : result.payload.markets
    const sharedFetchedAt =
      result.kind === "error" ? new Date().toISOString() : result.payload.fetchedAt

    // 2. Reject mock rows for Earn — they MUST NEVER be rendered here.
    //    Reuse real Morpho rows exactly as they came from the shared
    //    pipeline. This guarantees Dashboard/Markets/Borrow data
    //    behavior is unchanged.
    const realRows = sharedMarkets.filter(
      (m) => m.sourceMode !== "mock",
    )

    // 3. Reuse the seven real rows that already exist.
    const reusedRealRows = realRows.filter(
      (m) =>
        m.symbol === "AAPL" ||
        m.symbol === "SPCX" ||
        m.symbol === "TSLA" ||
        m.symbol === "NVDA" ||
        m.symbol === "GOOGL" ||
        m.symbol === "MSFT" ||
        m.symbol === "META",
    )

    // 4. AMZN: ALWAYS run the dedicated single-market Morpho lookup
    //    by exact marketId. We do this regardless of whether the
    //    shared pipeline returned an AMZN row, because the shared
    //    pipeline emits a `curated-reference` stub when Morpho's
    //    collateral-based scan returns nothing for AMZN. The by-id
    //    path produces an honest `real-morpho-unlisted` row sourced
    //    directly from onchain data (zeros, never fabricated).
    //    No symbol-based filter; marketId only.
    let amznRow: LendingMarket | null = null
    let amznUnavailableReason: string | null = null
    const raw = await fetchMorphoMarketById(AMZN_MARKET_ID)
    if (raw) {
      const built = buildLendingMarketFromById(raw, sharedFetchedAt)
      // Final guard: the by-id builder MUST never produce mock.
      if (built.sourceMode !== "mock") {
        amznRow = built
      } else {
        amznUnavailableReason = "by_id_source_mode_unexpected"
      }
    } else {
      amznUnavailableReason = "by_id_empty_or_failed"
    }

    if (!amznRow && !amznUnavailableReason) {
      amznUnavailableReason = "missing"
    }

    if (amznUnavailableReason) {
      console.warn(
        `[earn] amzn_unavailable reason=${amznUnavailableReason} marketId=${AMZN_MARKET_ID}`,
      )
    }

    const finalRows = amznRow ? [...reusedRealRows, amznRow] : reusedRealRows

    return {
      ok: true,
      markets: finalRows,
      amznUnavailableReason,
      fetchedAt: sharedFetchedAt,
    }
  })()
  return inFlight
}

export interface EarnResponse {
  ok: boolean
  markets: import("@/lib/markets/lending").LendingMarket[]
  /** Null when AMZN was successfully resolved (real Morpho). */
  amznUnavailableReason: string | null
  fetchedAt: string
}

export async function GET() {
  try {
    const data = await fetchDeduped()
    return NextResponse.json(
      {
        ok: true,
        markets: data.markets.map(toWireLendingMarket),
        amznUnavailableReason: data.amznUnavailableReason,
        fetchedAt: data.fetchedAt,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=15, s-maxage=15`,
        },
      },
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load earn markets."
    console.error(`[/api/markets/lending/earn] ${message}`)
    return NextResponse.json(
      {
        ok: false,
        message,
        markets: [],
        amznUnavailableReason: "internal_error",
        fetchedAt: new Date().toISOString(),
      },
      { status: 502 },
    )
  }
}
