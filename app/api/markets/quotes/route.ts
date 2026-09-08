/**
 * GET /api/markets/quotes?symbols=AAPL,TSLA,NVDA,...
 *
 * Server-side proxy for Robinhood Stock Token quotes.
 *
 * The asset universe is small enough to be returned by /api/markets/assets;
 * the quote endpoint is called separately so it can refresh at ~15–30s
 * without dragging the entire asset list along.
 *
 * Symbols that fail upstream (e.g. 429) are returned in `failedSymbols`
 * so the client can render a row with "—" instead of disappearing the
 * asset.
 *
 * Resilience: the upstream quote batch is always raced against a
 * hard timeout so this API route can never hang indefinitely. On
 * timeout the caller still gets a 200 with whatever quotes were
 * collected + the not-yet-resolved symbols in `failedSymbols`.
 */

import { NextResponse } from "next/server"
import { fetchRobinhoodQuotes } from "@/lib/markets/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_SYMBOLS_PER_REQUEST = 200
/** Hard upper bound on how long this route may take. */
const ROUTE_TIMEOUT_MS = 8_000

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get("symbols") ?? ""
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SYMBOLS_PER_REQUEST)

  if (symbols.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Missing symbols query parameter." },
      { status: 400 },
    )
  }

  try {
    const set = await fetchRobinhoodQuotes(symbols, {
      timeoutMs: ROUTE_TIMEOUT_MS,
    })
    return NextResponse.json(
      {
        ok: true,
        quotes: set.quotes,
        fetchedAt: set.fetchedAt,
        failedSymbols: set.failedSymbols,
      },
      {
        headers: {
          // 15s browser-cache window — aligns with Phase 1 refresh
          // strategy (spec §06).
          "Cache-Control": "public, max-age=15, s-maxage=15",
        },
      },
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load quotes."
    return NextResponse.json(
      { ok: false, message },
      { status: 502 },
    )
  }
}
