/**
 * ZEKS Markets — Historical price provider (Phase 2B → Phase 4C3)
 *
 * Provider-neutral entry point. Every caller (server route, future
 * indexer, future tests) goes through `getHistoricalSeries` so we
 * can swap implementations without rewriting upstream code.
 *
 * ============================================================
 * PHASE 4C3: DATABASE-BACKED HISTORICAL PRICES
 * ============================================================
 *
 * Prices are sourced from the `price_history` table in Neon (via
 * the `getPriceHistory` storage layer). The cron collector in
 * Phase C populated this table with real samples from the Robinhood
 * live-price pipeline.
 *
 * No external historical vendor is queried. No mock candles. No
 * synthetic points. No interpolation. The chart honestly shows
 * whatever the database has accumulated for the requested symbol
 * and range.
 */

import type {
  HistoryFetchResult,
  HistoryRange,
  HistoricalSeries,
} from "./types"

import { getPriceHistory, type StoredPriceSample } from "@/lib/markets/history/storage"

export interface ProviderContext {
  /** Hard timeout in ms. Providers MUST honor this. */
  timeoutMs?: number
  /** External cancellation (e.g. an AbortSignal from the caller). */
  signal?: AbortSignal
}

/** Seconds per unit for each supported range. */
const RANGE_SECONDS: Readonly<Record<HistoryRange, number>> = {
  "1H": 60 * 60,
  "1D": 60 * 60 * 24,
  "1W": 60 * 60 * 24 * 7,
  "1M": 60 * 60 * 24 * 30,
}

/**
 * Build inclusive (from, to) UNIX-second bounds for a range,
 * using UTC wall-clock arithmetic.
 */
function rangeBounds(
  range: HistoryRange,
): { from: number; to: number } {
  const nowSec = Math.floor(Date.now() / 1000)
  const duration = RANGE_SECONDS[range]
  return { from: nowSec - duration, to: nowSec }
}

/**
 * Provider-neutral history fetcher backed by the Neon price_history
 * table.
 *
 * Contract:
 *   - MUST return a `HistoryFetchResult` (never throw for a
 *     predictable, recoverable failure — those are encoded as
 *     `{ kind: "error", ... }` or `{ kind: "empty", ... }`).
 *   - MUST honor `ctx.timeoutMs` if provided.
 *   - MUST respect `ctx.signal.aborted` (caller cancellation).
 *   - MUST NOT fabricate, interpolate, or repeat data points.
 *   - MUST return `{ kind: "empty" }` when no rows exist for the
 *     symbol/range, NOT `provider-not-configured` (the database
 *     IS configured; it simply has no history yet).
 *
 * @param symbol - uppercase ticker, e.g. "AAPL"
 * @param range - one of `HistoryRange`
 * @param ctx - optional timeout / cancellation context
 */
export async function getHistoricalSeries(
  symbol: string,
  range: HistoryRange,
  ctx?: ProviderContext,
): Promise<HistoryFetchResult> {
  // Honour external cancellation.
  if (ctx?.signal?.aborted) {
    return {
      kind: "error",
      symbol,
      range,
      message: "Request cancelled.",
    }
  }

  // Resolve (from, to) in UTC seconds.
  const { from, to } = rangeBounds(range)

  // Honour timeout if provided — race the DB query against a timer.
  const timeoutMs = ctx?.timeoutMs
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const doQuery = async () => {
    try {
      return await getPriceHistory({ symbol, from, to })
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }

  // Initialize to an empty typed array. If the timeout branch wins
  // the race (`timedOut = true`), we early-return at the timeout
  // guard below and `rows` is never read. Likewise for the
  // cancellation guard. Reaching the empty-state check with `[]`
  // produces exactly the existing `{ kind: "empty" }` result.
  let rows: StoredPriceSample[] = []

  if (timeoutMs && timeoutMs > 0) {
    const result = await Promise.race([
      doQuery(),
      new Promise<"__timeout__">((resolve) => {
        timeoutId = setTimeout(() => resolve("__timeout__"), timeoutMs)
      }),
    ])
    if (result === "__timeout__") {
      timedOut = true
    } else {
      rows = result
    }
  } else {
    rows = await doQuery()
  }

  if (timedOut) {
    return { kind: "error", symbol, range, message: "Provider timeout." }
  }

  if (ctx?.signal?.aborted) {
    return { kind: "error", symbol, range, message: "Request cancelled." }
  }

  if (rows.length === 0) {
    return { kind: "empty", symbol, range }
  }

  const points = rows.map((row) => ({
    timestamp: row.timestamp,
    price: row.priceNumber,
  }))

  const series: HistoricalSeries = {
    symbol,
    range,
    points,
    source: "robinhood",
    priceSemantics: "multiplier-adjusted-token-price",
    generatedAt: new Date().toISOString(),
  }

  return { kind: "ready", series }
}

/**
 * Type guard: did the provider return a usable series we can chart?
 * Convenience helper for UI code that doesn't care about the
 * distinction between "ready" and "stale" (both have a real series).
 */
export function hasUsableSeries(
  result: HistoryFetchResult,
): result is Extract<HistoryFetchResult, { series: HistoricalSeries }> {
  return result.kind === "ready" || result.kind === "stale"
}
