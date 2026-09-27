/**
 * ZEKS Persistent Storage — Drizzle schema (Phase 4B)
 *
 * Phase 4B introduces the MINIMUM durable table needed by the future
 * price-history collector (Phase C). It contains exactly ONE table:
 *
 *   price_history
 *
 * Schema is intentionally minimal — only the four fields required by
 * the Phase 4B spec:
 *
 *   symbol     — canonical uppercase ZEKS ticker (e.g. "AAPL")
 *   timestamp  — UTC UNIX seconds (matches the existing chart layer's
 *                UNIX-seconds convention; see HistoricalPoint)
 *   price      — multiplier-adjusted Stock-Token price in USD;
 *                stored as numeric(40, 18) to preserve precision
 *   source     — short canonical provenance tag (e.g. "robinhood",
 *                "chainlink", "backfill-provider")
 *
 * Constraints:
 *
 *   - unique(symbol, timestamp) — prevents duplicate samples and gives
 *     us the primary range-query access path.
 *   - idx_price_history_symbol_timestamp — explicit index optimized
 *     for "all rows for symbol X between timestamps A and B".
 *
 * No mock / synthetic source tags exist in code. No seed rows are
 * inserted. This table is empty after migration; Phase C will be
 * responsible for populating it.
 */

import { sql } from "drizzle-orm"
import {
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

export const priceHistory = pgTable(
  "price_history",
  {
    /** Canonical uppercase ZEKS ticker. Validated at the storage layer. */
    symbol: text("symbol").notNull(),
    /**
     * UTC UNIX seconds (matches `HistoricalPoint.timestamp` and the
     * onchain Chainlink `updatedAt` convention used elsewhere).
     * Stored as `timestamp with time zone` for SQL portability; we
     * round-trip through UTC at the storage boundary.
     */
    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    /**
     * Multiplier-adjusted Stock-Token price in USD.
     *
     * numeric(40, 18) preserves ~22 integer digits of headroom — far
     * more than any tokenized equity will ever need — while keeping 18
     * fractional digits, which is enough to round-trip on-chain
     * 1e-18 wei-style values without precision loss.
     */
    price: numeric("price", { precision: 40, scale: 18 }).notNull(),
    /** Short canonical provenance tag (e.g. "robinhood"). */
    source: text("source").notNull(),
  },
  (table) => ({
    /**
     * Unique (symbol, timestamp). This is the primary access path for
     * both range queries AND idempotent inserts.
     */
    symbolTimestampUnique: uniqueIndex("price_history_symbol_timestamp_uq").on(
      table.symbol,
      table.timestamp,
    ),
    /**
     * Explicit btree index for fast range scans on
     * `WHERE symbol = $1 AND timestamp BETWEEN $2 AND $3 ORDER BY timestamp`.
     *
     * Note: the unique index above already supports this access path,
     * but having a clearly-named non-unique index documents the
     * intended query shape and leaves room for the storage layer to
     * relax uniqueness in a later phase if needed without rewriting
     * the query planner assumptions.
     */
    symbolTimestampRange: index("price_history_symbol_timestamp_idx").on(
      table.symbol,
      table.timestamp,
    ),
  }),
)

/**
 * Inferred insert shape — passed to drizzle's `.insert(...).values(...)`.
 *
 * The Phase 4B storage API will validate, normalize, and type-coerce
 * fields before constructing this object.
 */
export type PriceHistoryInsert = typeof priceHistory.$inferInsert

/**
 * Inferred row shape — what `getPriceHistory` returns per row.
 *
 * `price` is returned as a string (Postgres `numeric` round-trips
 * through string in node-postgres / neon-serverless) so the caller can
 * parse to Decimal/bigint/number at the boundary as appropriate. Callers
 * MUST NOT lose precision when parsing.
 */
export type PriceHistoryRow = typeof priceHistory.$inferSelect & {
  /** Convenience aliases alongside the native Date. */
  timestampMs: number
  /** Convenience alias — price parsed as a JS number for display. */
  priceNumber: number
}

/**
 * Canonical list of supported ZEKS symbols for price-history storage.
 *
 * The Phase 4B spec lists eight tickers. This array is the
 * authoritative source-of-truth for what the storage layer will
 * accept; `lib/assets/registry.ts` already covers all of these plus a
 * few additional non-stock-token assets (ETH, USDG) which are
 * intentionally NOT tracked here — price history is a Stock-Token
 * feature only for now.
 *
 * Phase C may extend this list. The storage layer validates against
 * this list (case-insensitive) regardless of how callers obtained the
 * symbol.
 */
export const SUPPORTED_PRICE_HISTORY_SYMBOLS = [
  "AAPL",
  "NVDA",
  "MSFT",
  "GOOGL",
  "TSLA",
  "META",
  "AMZN",
  "SPCX",
] as const

export type SupportedPriceHistorySymbol =
  (typeof SUPPORTED_PRICE_HISTORY_SYMBOLS)[number]

/**
 * Defensive type guard for the supported-symbol list. Used by the
 * storage layer to reject unknown tickers before they reach SQL.
 */
export function isSupportedPriceHistorySymbol(
  value: string,
): value is SupportedPriceHistorySymbol {
  return (
    typeof value === "string" &&
    (SUPPORTED_PRICE_HISTORY_SYMBOLS as readonly string[]).includes(
      value.toUpperCase(),
    )
  )
}

/**
 * Re-export of the SQL tag helper for callers that need to build
 * bespoke queries (Phase C may need it for time-bucketed aggregates).
 */
export { sql }
