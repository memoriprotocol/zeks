/**
 * ZEKS Markets — Historical price series types (Phase 2B)
 *
 * Provider-neutral shape for any time-series price source we might
 * plug in later (RobinhoodRPC, internal indexer, mock for tests,
 * etc.). The chart UI consumes ONLY this shape — it never sees the
 * raw provider payload.
 *
 *   - Timestamp: UNIX seconds (number). Provider-specific epochs are
 *     normalized at the boundary.
 *   - Price:     finite number in the SAME price semantic as the
 *                onchain Chainlink feed (multiplier-adjusted Stock
 *                Token price). NEVER raw underlying-equity REST.
 *   - Source:    short provenance tag, useful for the chart footer.
 *
 * The result is a discriminated union (`HistoryFetchResult`) so the
 * UI can render LOADING / READY / EMPTY / PROVIDER_NOT_CONFIGURED /
 * ERROR / STALE states without a separate parallel type for status.
 */

/**
 * Supported UI timeframes for the Asset Detail chart.
 *
 * IMPORTANT: `1Y` is intentionally NOT part of this list yet — the
 * 1Y range requires the paid "Scale" tier of the historical data
 * provider (90-day ceiling on the Build tier). It will be added
 * once the provider key is confirmed and the Scale plan is active.
 */
export const HISTORY_RANGES = ["1H", "1D", "1W", "1M"] as const

export type HistoryRange = (typeof HISTORY_RANGES)[number]

/** Type guard for runtime-validated range strings. */
export function isHistoryRange(value: unknown): value is HistoryRange {
  return (
    typeof value === "string" &&
    (HISTORY_RANGES as readonly string[]).includes(value)
  )
}

/**
 * One point on the price series.
 *
 * `timestamp` is UNIX seconds (matches the onchain Chainlink
 * `updatedAt` convention); `price` is the multiplier-adjusted Stock
 * Token price in USD (NOT the raw underlying-equity bid/ask).
 */
export interface HistoricalPoint {
  /** UNIX seconds. */
  timestamp: number
  /** Multiplier-adjusted Stock Token price in USD. */
  price: number
}

/**
 * A complete historical series for one symbol + one range.
 *
 * `source` is a short provenance tag (e.g. `"robinhood-rpc"`),
 * `priceSemantics` records what kind of price these points
 * represent so downstream consumers cannot accidentally mix
 * semantics. `generatedAt` (optional) is the upstream fetch time
 * used for stale-data indicators.
 */
export interface HistoricalSeries {
  symbol: string
  range: HistoryRange
  points: HistoricalPoint[]
  /** Short tag identifying the upstream provider. */
  source: string
  /**
   * MUST be one of:
   *   `"multiplier-adjusted-token-price"` (onchain Chainlink feed
   *     semantic — what the chart should display)
   *   `"raw-underlying-equity"`          (NOT for chart use; allowed
   *     here only so a future debug/diagnostic view can render it)
   */
  priceSemantics: "multiplier-adjusted-token-price" | "raw-underlying-equity"
  /** ISO-8601 timestamp when the provider was queried. Optional. */
  generatedAt?: string
}

/**
 * Discriminated result returned by `getHistoricalSeries`.
 *
 * The UI uses this directly — there is no separate parallel
 * "status" object. Each `kind` maps 1:1 to one of the chart states
 * defined in the Phase 2B spec.
 */
export type HistoryFetchResult =
  | { kind: "loading" }
  | { kind: "ready"; series: HistoricalSeries }
  | { kind: "empty"; symbol: string; range: HistoryRange }
  | {
      kind: "provider-not-configured"
      symbol: string
      range: HistoryRange
      /** Human-readable reason, surfaced verbatim to the UI footer. */
      reason: string
    }
  | {
      kind: "error"
      symbol: string
      range: HistoryRange
      message: string
    }
  | {
      kind: "stale"
      series: HistoricalSeries
      /** Human-readable reason describing why we kept the prior data. */
      reason: string
    }

/** Sentinel error code emitted by providers when no real history exists. */
export const HISTORY_ERROR_PROVIDER_NOT_CONFIGURED =
  "PROVIDER_NOT_CONFIGURED" as const

/** Reasons the provider may be unavailable — surfaced in the UI footer. */
export type ProviderUnavailableReason =
  | "missing-api-key"
  | "unsupported-range"
  | "upstream-disabled"
