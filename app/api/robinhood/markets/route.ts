/**
 * GET /api/robinhood/markets
 *
 * Canonical internal proxy for Robinhood Stock Token data
 * (assets + quotes).
 *
 * Why this route exists:
 *
 *   - Browser code must NEVER hit api.robinhood.com directly
 *     (CORS, rate-limit, config exposure, spec §05).
 *   - Server-side fetches are centralized here so every UI client
 *     gets the SAME normalized payload with the SAME caching
 *     semantics.
 *   - Cache window: 15 seconds (`Cache-Control: public,
 *     max-age=15, s-maxage=15`). High-frequency quote data lives
 *     here; metadata updates are slower.
 *   - Concurrent requests are deduplicated via an in-flight
 *     Promise so a burst of UI components polling simultaneously
 *     never amplifies upstream load.
 *
 * Query params:
 *   ?symbols=AAPL,TSLA,NVDA   (optional; omit for the full
 *                              universe). Capped at 200 symbols.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     assets: MarketAsset[],          // filtered to chain 4663 + ACTIVE
 *     quotes: Record<string, MarketQuote>,
 *     failedSymbols: string[],        // quotes that failed upstream
 *     assetsFetchedAt: string,
 *     quotesFetchedAt: string,
 *   }
 *
 * No auth, no rate-limit on the route itself — the upstream is
 * protected by the per-symbol 15s server-side cache. Browser cache
 * is also bounded.
 */

import { NextResponse } from "next/server"
import {
  fetchRobinhoodAssets,
  fetchRobinhoodQuotes,
  ROBINHOOD_PUBLIC_RPC_URL,
} from "@/lib/markets/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_SYMBOLS_PER_REQUEST = 200
const ROUTE_TIMEOUT_MS = 8_000
const ROUTE_CACHE_TTL_SECONDS = 15

/* ── In-flight dedupe ──────────────────────────────────────────── */

interface InFlightPayload {
  assets: Awaited<ReturnType<typeof fetchRobinhoodAssets>>
  quotes: ReturnType<typeof toQuoteRecord>
  assetsFetchedAt: string
  quotesFetchedAt: string
}

let inFlightAll: Promise<InFlightPayload> | null = null

/**
 * Dedupe the "fetch everything" path. Multiple UI components
 * mounting in the same tick share one upstream request.
 */
function fetchAllDeduped(timeoutMs: number): Promise<InFlightPayload> {
  if (inFlightAll) return inFlightAll
  inFlightAll = (async () => {
    const quotesFetchedAt = new Date().toISOString()
    const assetsFetchedAt = quotesFetchedAt
    try {
      const assets = await fetchRobinhoodAssets()
      // Build a symbol list from the universe — quotes for everything
      // we know about is the "all markets" view.
      const symbols = assets.map((a) => a.symbol)
      const quoteSet =
        symbols.length > 0
          ? await fetchRobinhoodQuotes(symbols, { timeoutMs })
          : { quotes: {}, fetchedAt: quotesFetchedAt, failedSymbols: [] }
      return {
        assets,
        quotes: toQuoteRecord(quoteSet.quotes),
        assetsFetchedAt,
        quotesFetchedAt: quoteSet.fetchedAt,
      }
    } finally {
      // Always release so subsequent requests can re-fetch once the
      // cache window elapses.
      inFlightAll = null
    }
  })()
  return inFlightAll
}

function toQuoteRecord(
  quotes: Awaited<ReturnType<typeof fetchRobinhoodQuotes>>["quotes"],
): Record<string, Awaited<ReturnType<typeof fetchRobinhoodQuotes>>["quotes"][string]> {
  // The upstream shape is already a Record<string, MarketQuote>.
  return quotes
}

/* ── GET handler ───────────────────────────────────────────────── */

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get("symbols") ?? ""

  // No symbols requested → return the full universe (assets + all
  // known quotes). This is the loop / markets / dashboard path.
  if (!raw.trim()) {
    try {
      const payload = await fetchAllDeduped(ROUTE_TIMEOUT_MS)
      return NextResponse.json(
        {
          ok: true,
          assets: payload.assets,
          quotes: payload.quotes,
          assetsFetchedAt: payload.assetsFetchedAt,
          quotesFetchedAt: payload.quotesFetchedAt,
          failedSymbols: [],
        },
        {
          headers: {
            "Cache-Control": `public, max-age=${ROUTE_CACHE_TTL_SECONDS}, s-maxage=${ROUTE_CACHE_TTL_SECONDS}`,
          },
        },
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load Robinhood markets."
      return NextResponse.json({ ok: false, message }, { status: 502 })
    }
  }

  // Specific symbols requested → only fetch quotes for those.
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
        quotesFetchedAt: set.fetchedAt,
        failedSymbols: set.failedSymbols,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=${ROUTE_CACHE_TTL_SECONDS}, s-maxage=${ROUTE_CACHE_TTL_SECONDS}`,
        },
      },
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load Robinhood quotes."
    return NextResponse.json({ ok: false, message }, { status: 502 })
  }
}
