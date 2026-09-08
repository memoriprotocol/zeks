/**
 * ZEKS Markets — display formatters (USD price, volume, freshness).
 *
 * Pure, no React, no DOM. Re-used by both server and client code.
 */

/** Format a USD price with currency-aware thousands grouping. */
export function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  // Whole-dollar vs cents — keeps the table visually quiet.
  if (Math.abs(value) >= 1000) {
    return formatUsd(value, 2)
  }
  return formatUsd(value, 2)
}

/** Format a USD number with N decimals and grouping separators. */
export function formatUsd(value: number, decimals: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return formatted
}

/**
 * Compact volume renderer (e.g. 13,535,241 -> "13.5M"). Returns "—"
 * for non-finite / null inputs. Spec §07 forbids fake numbers so we
 * fall back to the em-dash when the upstream field is missing.
 */
export function formatVolume(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${trim(abs / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${trim(abs / 1_000)}K`
  return new Intl.NumberFormat("en-US").format(value)
}

/**
 * Signed percentage formatter for 24h change.
 * Returns e.g. "+2.34%", "-1.05%", "—".
 * Always shows a sign for non-zero values.
 */
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  // If the value is 0, skip the sign
  if (value === 0) return "0.00%"
  return `${sign}${abs.toFixed(2)}%`
}

/**
 * APY formatter (e.g. 4.32 → "4.32%", null → "—").
 * Trailing "0.00%" is preserved so the column aligns visually.
 */
export function formatApy(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(2)}%`
}

/**
 * Utilization formatter (e.g. 52.33 → "52.33%", null → "—").
 * Identical surface to formatApy but kept distinct so future code
 * paths (e.g. range labels, color bands) can specialize.
 */
export function formatUtilization(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(2)}%`
}

/**
 * Compact USD formatter for derived fields like liquidity.
 * Returns e.g. "$1.2B", "$340M", "$12.5K".
 */
export function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${trim(abs / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `$${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `$${trim(abs / 1_000)}K`
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

/**
 * Human-readable token formatter for onchain stablecoin amounts
 * (e.g. USDG) coming from raw decimal strings like "1330.994441…".
 *
 * Spec:
 *   · >= 1,000,000 → "$1.23M"
 *   · >= 1,000     → "$1,330.99"
 *   · <  1,000     → max 2-4 meaningful decimals
 *   · never display long raw token decimals
 *
 * Accepts either a number (already-parsed) or a decimal string
 * (raw onchain output). Falls back to "—" for null / NaN / empty.
 */
export function formatTokenAmount(value: number | string | null): string {
  if (value == null || value === "") return "—"
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"

  const abs = Math.abs(n)
  // Millions / billions → compact
  if (abs >= 1_000_000) return `$${trim(n / 1_000_000)}M`
  if (abs >= 1_000_000_000) return `$${trim(n / 1_000_000_000)}B`

  // Thousands → grouped 2-decimal currency
  if (abs >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  }

  // Sub-thousand → 2-4 meaningful decimals (trim trailing zeros)
  if (abs === 0) return "$0"
  if (abs >= 1) return `$${n.toFixed(2)}`
  if (abs >= 0.01) return `$${n.toFixed(4)}`
  if (abs >= 0.0001) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function trim(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/**
 * "Updated Xs ago" relative time. Pure function — given `now` and a
 * past ISO timestamp, returns the shortest sensible label.
 *
 * If the timestamp is in the future (clock skew), returns "just now".
 */
export function relativeUpdated(
  pastIso: string | null,
  nowMs: number = Date.now(),
): string {
  if (!pastIso) return "—"
  const t = Date.parse(pastIso)
  if (!Number.isFinite(t)) return "—"
  const diffSec = Math.max(0, Math.round((nowMs - t) / 1000))
  if (diffSec < 2) return "just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ago`
}

/** "15:42:18 UTC" absolute timestamp. Falls back to "—". */
export function absoluteTimestamp(pastIso: string | null): string {
  if (!pastIso) return "—"
  const t = Date.parse(pastIso)
  if (!Number.isFinite(t)) return "—"
  const d = new Date(t)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  const ss = String(d.getUTCSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss} UTC`
}
