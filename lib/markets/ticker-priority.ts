/**
 * ZEKS Markets — ticker priority list
 *
 * Per spec §10 the ticker strip should prefer a small well-known
 * subset, but only render symbols that actually exist as ACTIVE
 * Robinhood Chain Stock Tokens at runtime.
 *
 * This file deliberately holds ONLY a static "preferred order". The
 * UI MUST intersect it with the live asset universe — symbols that
 * are absent from the upstream metadata are silently dropped, never
 * fabricated.
 */

export const TICKER_PRIORITY: readonly string[] = [
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
  "META",
  "AMZN",
  "GOOGL",
] as const

/** Maximum number of ticker chips rendered at once. */
export const TICKER_MAX_VISIBLE = 7

/**
 * Resolve the actual ticker symbols to show in the strip, preserving
 * the priority order from `TICKER_PRIORITY`. Symbols that the live
 * asset universe does not contain are dropped.
 */
export function resolveTickerSymbols(available: readonly string[]): string[] {
  const availableSet = new Set(available.map((s) => s.toUpperCase()))
  const resolved: string[] = []
  for (const sym of TICKER_PRIORITY) {
    if (availableSet.has(sym)) {
      resolved.push(sym)
      if (resolved.length >= TICKER_MAX_VISIBLE) break
    }
  }
  return resolved
}
