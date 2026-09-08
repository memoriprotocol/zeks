/**
 * ZEKS Markets — client-side sort and filter utilities.
 *
 * All sort and filter operations run purely in the browser on the
 * already-loaded asset universe. No upstream API hit per keystroke.
 *
 * Isolated so the implementation can be swapped when the live API
 * gains server-side sort/filter capabilities.
 */

/** Sort field identifiers. */
export type SortField = "market" | "price" | "change24h" | "volume" | "liquidity"
/** Sort direction. */
export type SortDir = "asc" | "desc"
/** Filter mode identifiers. */
export type FilterMode = "all" | "gainers" | "losers" | "most-active"

/**
 * Compute the 24h change percentage from current and previous reference prices.
 *
 * Returns: (currentRef - previousRef) / previousRef * 100
 * Returns null when either price is null/undefined or previous is 0.
 *
 * NOTE: `previousRef` is currently a Phase 1 stub. The real Robinhood
 * upstream may not yet provide previous-day close. Until then, pass null
 * to render "—" instead of a fabricated percentage.
 */
export function computeChange24h(
  currentRef: number | null,
  previousRef: number | null,
): number | null {
  if (currentRef === null || previousRef === null) return null
  if (!Number.isFinite(currentRef) || !Number.isFinite(previousRef)) return null
  if (previousRef === 0) return null
  return ((currentRef - previousRef) / previousRef) * 100
}

/**
 * Estimate liquidity from volume and reference price.
 *
 * liquidity ≈ volume × referencePrice.
 * Returns null when either field is null, non-finite, or zero.
 */
export function computeLiquidity(
  volume: number | null,
  price: number | null,
): number | null {
  if (volume === null || price === null) return null
  if (!Number.isFinite(volume) || !Number.isFinite(price)) return null
  if (volume === 0 || price === 0) return null
  return volume * price
}
