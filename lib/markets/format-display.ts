/**
 * ZEKS Markets — Display-side formatting helpers.
 *
 * Small formatting utilities for human-readable amounts. Differs
 * from `format-units.ts` (which is pure bigint → string with full
 * precision) — these helpers clamp precision for tables.
 */

import { formatUnits } from "./onchain/format-units"

/**
 * Format a raw bigint token balance for display using the supplied
 * token decimals, then trim to at most `maxFrac` fractional digits.
 */
export function formatRawAmount(
  value: bigint,
  decimals: number,
  maxFrac: number = 6,
): string {
  if (decimals < 0 || decimals > 30) return "—"
  const full = formatUnits(value, decimals)
  if (!full.includes(".")) return full
  const [whole, frac] = full.split(".")
  if (!frac) return whole
  if (maxFrac <= 0) return whole
  return `${whole}.${frac.slice(0, maxFrac)}`
}

/**
 * Round a USD value to a sensible number of decimals.
 */
export function formatUsdCompact(value: number, maxFrac: number = 2): string {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs === 0) return "$0"
  if (abs >= 1) {
    return `$${value.toLocaleString(undefined, {
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: 0,
    })}`
  }
  return `$${value.toFixed(maxFrac)}`
}
