/**
 * ZEKS Markets — client-side history cache
 *
 * Tiny in-memory cache keyed by `(symbol, range)`.
 *
 * Why this exists:
 *   - Rapid timeframe switching (1H -> 1D -> 1W -> 1M -> back to 1H)
 *     must not refetch the previous range over the wire. The
 *     upstream server already short-caches; mirroring that on the
 *     client makes switching feel instant.
 *   - Back/forward navigation between Asset Detail pages should
 *     show the last good chart for a recently visited symbol
 *     without a fresh fetch.
 *
 * Why this is NOT a real cache library:
 *   - The cache lives for the page lifetime only (it is module-scope,
 *     so it survives route changes within a single tab). A hard
 *     refresh drops it.
 *   - Size is bounded by `MAX_CACHED_SERIES` to prevent unbounded
 *     growth on long-lived single-page sessions.
 *   - LRU eviction by insertion order; we never store more than
 *     `MAX_CACHED_SERIES` series.
 *   - Each entry carries its `cachedAt` (server `generatedAt`) so
 *     the chart can render a STALE indicator once the TTL elapses
 *     and the user revisits the same range.
 *
 * This module has NO React dependencies — it's plain TypeScript
 * so the chart component stays decoupled from cache mechanics.
 */

import type { HistoryFetchResult, HistoryRange } from "@/lib/markets/history/types"
import { HISTORY_RANGE_META } from "@/lib/markets/history/range"

interface CacheEntry {
  result: HistoryFetchResult
  cachedAt: number
}

const store = new Map<string, CacheEntry>()

/** Maximum number of (symbol, range) pairs retained in memory. */
const MAX_CACHED_SERIES = 24

/** Build a stable cache key. */
function keyOf(symbol: string, range: HistoryRange): string {
  return `${symbol.toUpperCase()}::${range}`
}

/**
 * Look up a cached series.
 *
 * Returns the entry ONLY if:
 *   - it exists,
 *   - the result is chartable (`ready` or `stale`),
 *   - the entry is younger than its range's TTL.
 *
 * Non-chartable results (loading / empty / provider-not-configured /
 * error) are NEVER served from cache — the user should see the
 * freshest signal in those states.
 */
export function getCachedSeries(
  symbol: string,
  range: HistoryRange,
): HistoryFetchResult | null {
  const entry = store.get(keyOf(symbol, range))
  if (!entry) return null

  if (entry.result.kind !== "ready" && entry.result.kind !== "stale") {
    return null
  }

  const ageMs = Date.now() - entry.cachedAt
  if (ageMs > HISTORY_RANGE_META[range].cacheTtlMs) {
    // Soft-expire: drop from store, return null.
    store.delete(keyOf(symbol, range))
    return null
  }

  return entry.result
}

/**
 * Store a series result. Only chartable results are kept; the rest
 * are ignored to keep the cache shape simple.
 */
export function setCachedSeries(
  symbol: string,
  range: HistoryRange,
  result: HistoryFetchResult,
): void {
  if (result.kind !== "ready" && result.kind !== "stale") return

  const k = keyOf(symbol, range)
  store.set(k, { result, cachedAt: Date.now() })

  // Evict oldest entries when we exceed the cap. Map iteration
  // order is insertion order, so the first key is the oldest.
  if (store.size > MAX_CACHED_SERIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey !== undefined) store.delete(oldestKey)
  }
}

/**
 * Drop a single entry — used after a deliberate retry action so a
 * previously-cached "error" doesn't shadow the next attempt.
 */
export function invalidateCachedSeries(
  symbol: string,
  range: HistoryRange,
): void {
  store.delete(keyOf(symbol, range))
}

/** Test/debug helper — exported but not used by the chart UI. */
export function __resetHistoryCacheForTests(): void {
  store.clear()
}
