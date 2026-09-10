/**
 * ZEKS — Numeric Display Helpers
 *
 * Defense-in-depth helpers that ALWAYS return a string and ALWAYS
 * treat non-finite values as "—" so the UI never displays:
 *
 *   - the literal string "NaN"
 *   - the literal string "undefined"
 *   - the literal string "null"
 *   - the literal string "Infinity" or "-Infinity"
 *
 * Every consumer should prefer these helpers over raw `.toFixed()`,
 * `.toLocaleString()`, or template literals because those will leak
 * non-finite values when the upstream data is missing or corrupt.
 */

export function safeToFixed(
  value: number | null | undefined,
  fractionDigits: number,
): string {
  if (value == null) return "—"
  if (!Number.isFinite(value)) return "—"
  return value.toFixed(fractionDigits)
}

export function safeFormatPercent(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(fractionDigits)}%`
}

export function safeFormatSignedPercent(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(fractionDigits)}%`
}

export function safeFormatNumber(
  value: number | null | undefined,
  fractionDigits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function safeFormatBlock(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US")
}
