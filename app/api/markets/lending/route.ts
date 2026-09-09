/**
 * GET /api/markets/lending
 *
 * Internal proxy for the full lending market universe.
 *
 * All three borrowing-aware client components
 *   - /terminal/markets      (markets-page-client.tsx)
 *   - /terminal/borrow       (borrow-live.tsx)
 *   - /terminal/earn        (earn-live.tsx)
 * are "use client" and must not directly import server-only modules
 * that call api.robinhood.com. This route serves as their data
 * boundary — it calls fetchLendingMarkets() server-side and returns
 * the normalized LendingMarket[] payload.
 *
 * Response shape mirrors LendingServiceResult (non-error case):
 *   {
 *     ok: true,
 *     markets: LendingMarket[],
 *     failedSymbols: string[],
 *     fetchedAt: string,
 *   }
 *
 * Cache: 15 seconds. Deduplication: module-level in-flight promise
 * (same pattern as the Robinhood markets route).
 */

import { NextResponse } from "next/server"
import { fetchLendingMarkets } from "@/lib/markets/lending"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CACHE_TTL_MS = 15_000

/* ── In-flight dedupe ──────────────────────────────────────────── */

let inFlight: Promise<{
  markets: import("@/lib/markets/lending").LendingMarket[]
  failedSymbols: string[]
  fetchedAt: string
}> | null = null

function fetchDeduped() {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const result = await fetchLendingMarkets(undefined, { debug: false })
    if (result.kind === "error") {
      return {
        markets: [],
        failedSymbols: [],
        fetchedAt: new Date().toISOString(),
      }
    }
    return {
      markets: result.payload.markets,
      failedSymbols: result.payload.failedSymbols,
      fetchedAt: result.payload.fetchedAt,
    }
  })()
  return inFlight
}

/* ── GET handler ───────────────────────────────────────────────── */

export async function GET() {
  const startedAt = Date.now()
  try {
    const data = await fetchDeduped()
    return NextResponse.json(
      {
        ok: true,
        markets: data.markets,
        failedSymbols: data.failedSymbols,
        fetchedAt: data.fetchedAt,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=15, s-maxage=15`,
        },
      },
    )
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const message =
      err instanceof Error ? err.message : "Failed to load markets."
    console.error(`[/api/markets/lending] ${message} (${elapsed}ms)`)
    return NextResponse.json(
      { ok: false, message, markets: [], failedSymbols: [], fetchedAt: new Date().toISOString() },
      { status: 502 },
    )
  }
}
