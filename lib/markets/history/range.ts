/**
 * ZEKS Markets — History range metadata
 *
 * Single source of truth for the duration, display label, and
 * client-cache TTL for each UI timeframe. The chart UI, the
 * timeframe controls, and the in-memory client cache all read
 * from here so they can never disagree.
 *
 * TTL semantics:
 *
 *   - 1H → 30 s.      Live tape moves quickly; keep charts fresh.
 *   - 1D → 60 s.      Sub-minute cadence is enough for intraday UX.
 *   - 1W → 5  min.    Hourly movement is the resolution we display.
 *   - 1M → 15 min.    Daily bars; refreshing faster is wasted work.
 *
 * These are CLIENT-side TTLs on top of the SERVER-side Cache-Control
 * header set in `/api/markets/history/[symbol]/route.ts`.
 */

import type { HistoryRange } from "./types"

export interface HistoryRangeMeta {
  /** Display label (matches the `HistoryRange` enum). */
  label: HistoryRange
  /** Human-readable duration suffix, e.g. "1 hour", "1 day". */
  durationLabel: string
  /** Duration of the range, in milliseconds. Used for x-axis bounds. */
  durationMs: number
  /** Client-cache TTL, in milliseconds. */
  cacheTtlMs: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const HISTORY_RANGE_META: Readonly<Record<HistoryRange, HistoryRangeMeta>> =
  {
    "1H": {
      label: "1H",
      durationLabel: "1 hour",
      durationMs: 1 * HOUR,
      cacheTtlMs: 30_000,
    },
    "1D": {
      label: "1D",
      durationLabel: "1 day",
      durationMs: 1 * DAY,
      cacheTtlMs: 60_000,
    },
    "1W": {
      label: "1W",
      durationLabel: "1 week",
      durationMs: 7 * DAY,
      cacheTtlMs: 5 * MINUTE,
    },
    "1M": {
      label: "1M",
      durationLabel: "1 month",
      durationMs: 30 * DAY,
      cacheTtlMs: 15 * MINUTE,
    },
  }

/** Default range shown on first Asset Detail render. */
export const DEFAULT_HISTORY_RANGE: HistoryRange = "1D"

/** Maximum allowed chart payload size — safety net for the client. */
export const MAX_POINTS_PER_SERIES = 5_000
