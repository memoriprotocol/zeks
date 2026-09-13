/**
 * ZEKS Markets — ticker priority list
 *
 * The top toolbar ticker must always show the full curated 8-stock
 * set regardless of which fields are populated. Missing price /
 * previousClose / logo values render as "—" placeholders; assets
 * are NEVER filtered out merely because one field is missing.
 *
 * Order is canonical: AAPL, SPCX, TSLA, NVDA, GOOGL, AMZN, MSFT, META.
 */

export const TICKER_PRIORITY: readonly string[] = [
  "AAPL",
  "SPCX",
  "TSLA",
  "NVDA",
  "GOOGL",
  "AMZN",
  "MSFT",
  "META",
] as const

/** Maximum number of ticker chips rendered at once. */
export const TICKER_MAX_VISIBLE = 8

/**
 * Resolve the actual ticker symbols to show in the strip, preserving
 * the priority order from `TICKER_PRIORITY`.
 *
 * Symbols present in the upstream asset universe are returned first
 * (in priority order). Symbols that the upstream metadata does NOT
 * include are appended AFTER (still in priority order) so the ticker
 * always shows the full curated set — we never silently drop an
 * asset because the registry didn't return it.
 */
export function resolveTickerSymbols(available: readonly string[]): string[] {
  const availableSet = new Set(available.map((s) => s.toUpperCase()))
  const resolved: string[] = []
  const appended: string[] = []

  for (const sym of TICKER_PRIORITY) {
    if (resolved.length >= TICKER_MAX_VISIBLE) break
    if (availableSet.has(sym)) {
      resolved.push(sym)
    } else {
      appended.push(sym)
    }
  }

  // Backfill with priority items that were missing upstream — keep
  // them so the topbar still shows the full curated 8.
  for (const sym of appended) {
    if (resolved.length >= TICKER_MAX_VISIBLE) break
    resolved.push(sym)
  }

  return resolved
}
