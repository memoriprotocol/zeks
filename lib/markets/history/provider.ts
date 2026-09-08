/**
 * ZEKS Markets — Historical price provider (Phase 2B)
 *
 * Provider-neutral entry point. Every caller (server route, future
 * indexer, future tests) goes through `getHistoricalSeries` so we
 * can swap implementations without rewriting upstream code.
 *
 * ============================================================
 * PHASE 2B STATUS: PROVIDER NOT YET CONNECTED
 * ============================================================
 *
 * Until the RobinhoodRPC key is available AND the production
 * endpoint contract is confirmed, this function returns a
 * controlled `provider-not-configured` result for every call.
 * The chart UI is built to handle that state as a first-class
 * outcome — see `components/markets/asset-history-chart.tsx`.
 *
 * NO fake candles. NO repeated current price. NO random walk.
 * NO interpolation. NO historical JSON.
 *
 * When the real provider is connected, the body of
 * `getHistoricalSeries` is the ONLY thing that changes; the
 * public signature and `HistoryFetchResult` shape are frozen.
 */

import type {
  HistoryFetchResult,
  HistoryRange,
  HistoricalSeries,
} from "./types"
import { HISTORY_ERROR_PROVIDER_NOT_CONFIGURED } from "./types"

/**
 * Optional context passed to the provider. Currently unused but
 * reserved so the real provider can receive a hard timeout and an
 * abort signal without a breaking signature change.
 */
export interface ProviderContext {
  /** Hard timeout in ms. Providers MUST honor this. */
  timeoutMs?: number
  /** External cancellation (e.g. an AbortSignal from the caller). */
  signal?: AbortSignal
}

/**
 * Provider-neutral history fetcher.
 *
 * Contract:
 *   - MUST return a `HistoryFetchResult` (never throw for a
 *     predictable, recoverable failure — those are encoded as
 *     `{ kind: "error", ... }` or `{ kind: "empty", ... }`).
 *   - MUST honor `ctx.timeoutMs` if provided.
 *   - MUST respect `ctx.signal.aborted` (caller cancellation).
 *   - MUST NOT fabricate, interpolate, or repeat data points.
 *   - MUST return `provider-not-configured` rather than fake
 *     success when no real provider is wired up.
 *
 * @param symbol - uppercase ticker, e.g. "AAPL"
 * @param range - one of `HistoryRange`
 * @param ctx - optional timeout / cancellation context
 */
export async function getHistoricalSeries(
  symbol: string,
  range: HistoryRange,
  _ctx?: ProviderContext,
): Promise<HistoryFetchResult> {
  // Reserved for the real provider implementation.
  void symbol
  void range

  // The current behavior is intentional and documented above.
  // We return a structured "provider not configured" result so the
  // chart UI can render a clean provider-pending state.
  return {
    kind: "provider-not-configured",
    symbol,
    range,
    reason: "Historical data provider not configured.",
  }
}

/**
 * Sentinel used by tests / future code paths that need to know the
 * provider is in placeholder mode. Exported so the API route can
 * stamp the response with the same code the types module uses.
 */
export const PROVIDER_PLACEHOLDER_CODE = HISTORY_ERROR_PROVIDER_NOT_CONFIGURED

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
