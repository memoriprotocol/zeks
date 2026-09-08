/**
 * ZEKS Markets — default asset ordering
 *
 * Phase 1 visual refinement:
 *
 *   1. A small priority list of well-recognized symbols appears first.
 *   2. The remaining assets are sorted alphabetically by symbol.
 *   3. Priority symbols that the live universe does NOT contain are
 *      silently dropped (the API remains the source of truth — we
 *      never invent priority symbols).
 *
 * The result is deterministic for a given universe: the priority
 * ordering is fixed, and the alphabetical tail is stable.
 */

import { TICKER_PRIORITY } from "./ticker-priority"
import type { MarketAsset } from "./types"

/**
 * Re-order the given asset list into:
 *
 *   [priority symbols present in the universe] +
 *   [remaining symbols sorted alphabetically, case-insensitive]
 *
 * Stable across calls for the same input. Never adds symbols that
 * are not in the input.
 */
export function orderAssetsByPriorityThenSymbol(
  assets: readonly MarketAsset[],
): MarketAsset[] {
  const bySymbol = new Map<string, MarketAsset>()
  for (const a of assets) {
    if (!bySymbol.has(a.symbol)) bySymbol.set(a.symbol, a)
  }

  const ordered: MarketAsset[] = []
  const seen = new Set<string>()

  // 1. Priority symbols (only those that exist).
  for (const sym of TICKER_PRIORITY) {
    const upper = sym.toUpperCase()
    const a = bySymbol.get(upper)
    if (a && !seen.has(upper)) {
      ordered.push(a)
      seen.add(upper)
    }
  }

  // 2. Remaining symbols, sorted alphabetically by symbol (case-insensitive).
  const tail = assets
    .filter((a) => !seen.has(a.symbol))
    .slice()
    .sort((a, b) => {
      const ua = a.symbol.toUpperCase()
      const ub = b.symbol.toUpperCase()
      if (ua < ub) return -1
      if (ua > ub) return 1
      return 0
    })

  ordered.push(...tail)
  return ordered
}