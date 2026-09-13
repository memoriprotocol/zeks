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

  // Upstream response envelope varies: { quotes: [...] }, { data: [...] },
  // { results: [...] }, or a bare single quote object. Pick the first
  // shape that parses to an array; otherwise treat the body as a
  // single-quote envelope.
  const bodyObj = body as Record<string, unknown> | null
  const candidates: unknown[] = []
  for (const key of ["quotes", "data", "results"]) {
    const v = bodyObj && bodyObj[key]
    if (Array.isArray(v)) {
      candidates.push(...v)
      break
    }
  }
  if (candidates.length === 0 && bodyObj && typeof bodyObj === "object") {
    candidates.push(bodyObj)
  }

  if (candidates.length === 0) {
    return { quote: null, failed: true }
  }

  // Each response should carry a single quote for the requested symbol,
  // but the envelope is sometimes an array — pick the first row whose
  // identity (tokenSymbol / tokenContractAddress / instrumentId / rhid
  // / contractAddress / id) matches the requested symbol. Falls back
  // to the first usable quote when only one row exists.
  const requested = symbol.toUpperCase()
  let firstUsable: MarketQuote | null = null
  for (const q of candidates) {
    const normalized = normalizeQuote(q)
    if (!normalized) continue
    if (!firstUsable) firstUsable = normalized
    const identityMatch = identityMatches(q, requested)
    if (identityMatch) return { quote: normalized, failed: false }
  }

  // Identity didn't match — if we only got one row, take it anyway
  // (some upstream endpoints ignore the path symbol). The caller still
  // gets a quote, mapped to the requested canonical symbol below.
  if (candidates.length === 1 && firstUsable) {
    return { quote: { ...firstUsable, symbol: requested }, failed: false }
  }

  return { quote: null, failed: true }
}

/**
 * Match a raw upstream quote element to a canonical UI symbol using
 * any of: tokenSymbol, symbol, tokenContractAddress, contractAddress,
 * instrumentId, rhid, id. We never use fuzzy name matching.
 */
function identityMatches(raw: unknown, requestedSymbol: string): boolean {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  const upper = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== ""
      ? v.trim().toUpperCase()
      : null

  const candidates: Array<string | null> = [
    upper(r.tokenSymbol),
    upper(r.symbol),
    upper(r.tokenContractAddress),
    upper(r.contractAddress),
    upper(r.instrumentId),
    upper(r.rhid),
    upper(r.id),
  ]
  return candidates.some((c) => c === requestedSymbol)
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
