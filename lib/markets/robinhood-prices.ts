/**
 * ZEKS Markets — Robinhood quote fetcher
 *
 * Server-only. Reads from:
 *
 *   GET https://api.robinhood.com/rhj/prices/{symbol}
 *
 * Strategy (spec §05, §06):
 *
 *   - Centralized fetch — never scattered across components.
 *   - Bounded concurrency to avoid 429 rate-limits (upstream enforces
 *     local rate limits; we observed 429s after ~3 rapid sequential
 *     symbol requests in local testing).
 *   - Per-symbol retry-once-on-429 with a short backoff.
 *   - Symbols that ultimately fail are returned in `failedSymbols`
 *     so the UI can render a row with "—" instead of disappearing
 *     the asset.
 *   - `fetchedAt` is captured once at the start of the batch so the
 *     "Updated Xs ago" indicator is consistent across rows.
 *
 * Caching:
 *   - Per-symbol 15-second in-memory TTL. Phase 1 refresh strategy
 *     targets ~15–30s (spec §06). The Next.js route handler that
 *     calls this is itself the cache boundary; the UI polls it.
 */

import {
  fetchWithTimeout,
  ROBINHOOD_API_BASE,
  robinhoodHeaders,
} from "./http"
import { normalizeQuote } from "./normalize"
import type { MarketQuote, MarketQuoteSet } from "./types"

const PRICES_ENDPOINT_PREFIX = `${ROBINHOOD_API_BASE}/rhj/prices/`

/** Per-symbol TTL inside a single batch — short window to absorb
 *  bursty traffic without hammering upstream. */
const QUOTE_BATCH_TTL_MS = 15_000

/** Maximum simultaneous upstream requests in one batch. */
const MAX_CONCURRENCY = 4

/** Wait this long between retry-on-429 attempts. */
const RETRY_BACKOFF_MS = 600

interface CacheEntry {
  expiresAt: number
  quote: MarketQuote
}

const perSymbolCache: Map<string, CacheEntry> = new Map()

async function fetchSingleQuote(
  symbol: string,
): Promise<{ quote: MarketQuote | null; failed: boolean }> {
  const url = `${PRICES_ENDPOINT_PREFIX}${encodeURIComponent(symbol)}`
  const attempt = async (): Promise<Response> =>
    fetchWithTimeout(url, {
      headers: robinhoodHeaders(),
      // Do NOT cache individual upstream requests at the Next.js
      // data-cache layer — we manage freshness in this module so
      // the cache boundary is the route handler that aggregates.
      cache: "no-store",
    })

  let res: Response
  try {
    res = await attempt()
  } catch {
    return { quote: null, failed: true }
  }

  if (res.status === 429) {
    // Single, short backoff retry. Robinhood is occasionally
    // aggressive; one retry keeps the UI stable without amplifying
    // load.
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
    try {
      res = await attempt()
    } catch {
      return { quote: null, failed: true }
    }
    if (res.status === 429) {
      return { quote: null, failed: true }
    }
  }

  if (!res.ok) {
    return { quote: null, failed: true }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { quote: null, failed: true }
  }

  const quotesRaw = (body as { quotes?: unknown })?.quotes
  const list = Array.isArray(quotesRaw) ? quotesRaw : []
  // Each response carries a single quote per request, but the
  // envelope is an array — we pick the first matching symbol.
  for (const q of list) {
    const normalized = normalizeQuote(q)
    if (normalized && normalized.symbol === symbol.toUpperCase()) {
      return { quote: normalized, failed: false }
    }
  }
  return { quote: null, failed: true }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const total = items.length
  const lanes = Math.min(limit, total)
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (cursor < total) {
        const idx = cursor++
        results[idx] = await worker(items[idx])
      }
    }),
  )
  return results
}

/**
 * Fetch a batch of quotes. The per-symbol in-memory cache is consulted
 * first; missing symbols are fetched upstream with bounded concurrency.
 *
 * The returned `fetchedAt` is captured once at the start of the batch
 * so the UI's freshness indicator is consistent across rows.
 *
 * `options.timeoutMs` races the entire batch against a hard timeout
 * so an upstream stall can never block a server render / route
 * handler / API response. On timeout, the function resolves with
 * whatever quotes were already collected and lists the not-yet-
 * resolved symbols in `failedSymbols`. This guarantees callers
 * always get a usable `MarketQuoteSet` and navigation / API
 * responses are never left hanging.
 */
export async function fetchRobinhoodQuotes(
  symbols: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<MarketQuoteSet> {
  const fetchedAt = new Date().toISOString()
  const upper = symbols.map((s) => s.toUpperCase())
  const now = Date.now()

  const quoteMap: Record<string, MarketQuote> = {}
  const failedSymbols: string[] = []
  const toFetch: string[] = []

  for (const sym of upper) {
    const cached = perSymbolCache.get(sym)
    if (cached && cached.expiresAt > now) {
      quoteMap[sym] = cached.quote
    } else {
      toFetch.push(sym)
    }
  }

  if (toFetch.length === 0) {
    return { quotes: quoteMap, fetchedAt, failedSymbols }
  }

  // Build a promise that resolves the full batch. When a caller-
  // supplied timeout is set, race it against a timeout so we always
  // return within budget and the route handler / API / server
  // component never gets stuck waiting for an upstream stall.
  const batchPromise = runWithConcurrency(
    toFetch,
    MAX_CONCURRENCY,
    fetchSingleQuote,
  ).then((results) => {
    toFetch.forEach((sym, i) => {
      const r = results[i]
      if (r && r.quote) {
        quoteMap[sym] = r.quote
        perSymbolCache.set(sym, {
          quote: r.quote,
          expiresAt: Date.now() + QUOTE_BATCH_TTL_MS,
        })
      } else {
        failedSymbols.push(sym)
      }
    })
    return { quotes: quoteMap, fetchedAt, failedSymbols }
  })

  const timeoutMs = options.timeoutMs
  if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
    return batchPromise
  }

  return new Promise<MarketQuoteSet>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // On timeout, return whatever we have so far and mark every
      // not-yet-fetched symbol as failed. The route handler can
      // still render a partial table; the client poll recovers
      // the missing quotes on its next tick.
      const remaining = toFetch.filter((s) => !(s in quoteMap))
      for (const s of remaining) failedSymbols.push(s)
      resolve({ quotes: quoteMap, fetchedAt, failedSymbols })
    }, timeoutMs)
    batchPromise.then((result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    })
  })
}
