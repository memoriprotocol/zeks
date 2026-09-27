/**
 * ZEKS Markets — Persistent price-history storage layer (Phase 4B)
 *
 * Server-side access layer for the `price_history` table defined in
 * `db/schema.ts`. This module is the ONLY place in the codebase that
 * performs SQL reads / writes for price history — UI components, API
 * routes, and future collectors must go through these functions.
 *
 * Scope (Phase 4B):
 *
 *   - Typed insert + read primitives.
 *   - Strict symbol validation against the canonical supported list.
 *   - Idempotent insert behavior (duplicate symbol+timestamp is a
 *     no-op, NOT an upsert that overwrites historical data).
 *   - Chronological ascending reads.
 *   - Empty arrays when no data exists — never fabricated.
 *   - Server-side only — importing from a client component is a bug.
 *
 * Out of scope (Phase 4B):
 *
 *   - Polling / cron / collector wiring (Phase C).
 *   - External historical-data provider integration (separate phase).
 *   - API route changes — the chart still shows the empty-state copy.
 *   - Chart downsampling.
 *
 * No seed data is inserted by this module. After migration, the table
 * is empty until Phase C populates it with real samples.
 */

import { and, asc, eq, gte, lte } from "drizzle-orm"

import { getDb } from "@/db/client"
import {
  isSupportedPriceHistorySymbol,
  priceHistory,
  type PriceHistoryInsert,
} from "@/db/schema"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical source tags accepted by the storage layer.
 *
 * Phase C will populate this list as real collection paths are added.
 * Mock / synthetic source tags are intentionally NOT permitted.
 */
export const PRICE_HISTORY_SOURCES = [
  "robinhood",
  "chainlink",
  "backfill-provider",
] as const

export type PriceHistorySource = (typeof PRICE_HISTORY_SOURCES)[number]

function isPriceHistorySource(value: string): value is PriceHistorySource {
  return (PRICE_HISTORY_SOURCES as readonly string[]).includes(value)
}

/**
 * A single canonical price sample, normalized for return to callers.
 *
 * `price` is returned as a string so the caller can preserve full
 * numeric(40, 18) precision. A `priceNumber` convenience field is
 * exposed for callers that need a JS number for chart rendering.
 *
 * Callers MUST treat `priceNumber` as lossy for any value whose
 * decimal precision exceeds `Number.MAX_SAFE_INTEGER` digits — none
 * of our current tokenized equities approach that range, but the
 * contract is documented for safety.
 */
export interface StoredPriceSample {
  /** Canonical uppercase ZEKS symbol. */
  symbol: string
  /** UTC UNIX seconds. */
  timestamp: number
  /** Decimal string preserving numeric(40, 18) precision. */
  price: string
  /** Lossy JS-number copy of `price` for convenience. */
  priceNumber: number
  /** Canonical provenance tag. */
  source: PriceHistorySource
}

export interface GetPriceHistoryArgs {
  /** Canonical uppercase ZEKS symbol. Validation enforced. */
  symbol: string
  /** Inclusive lower bound, UTC UNIX seconds. */
  from: number
  /** Inclusive upper bound, UTC UNIX seconds. */
  to: number
}

export interface InsertPriceSampleArgs {
  symbol: string
  /** UTC UNIX seconds. */
  timestamp: number
  /** Multiplier-adjusted Stock-Token price in USD. */
  price: number
  source: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize and validate a sample argument. Returns a normalized
 * `PriceHistoryInsert` shape (or throws a descriptive Error). Kept
 * pure so unit tests can target it without a DB connection.
 */
export function buildPriceHistoryInsert(
  args: InsertPriceSampleArgs,
): PriceHistoryInsert {
  // --- symbol ----------------------------------------------------------
  if (typeof args.symbol !== "string") {
    throw new Error("PriceHistory: symbol must be a string.")
  }
  const symbol = args.symbol.trim().toUpperCase()
  if (!isSupportedPriceHistorySymbol(symbol)) {
    throw new Error(
      `PriceHistory: symbol "${args.symbol}" is not a supported ` +
        `ZEKS price-history symbol. See ` +
        `SUPPORTED_PRICE_HISTORY_SYMBOLS in db/schema.ts for the ` +
        `canonical list.`,
    )
  }

  // --- timestamp -------------------------------------------------------
  if (typeof args.timestamp !== "number" || !Number.isFinite(args.timestamp)) {
    throw new Error(
      `PriceHistory: timestamp must be a finite number (UNIX ` +
        `seconds). Received: ${JSON.stringify(args.timestamp)}`,
    )
  }
  // Reject fractional UNIX seconds — the schema treats timestamp as
  // a Date with second granularity. Negative values are also rejected
  // because they would represent times before 1970, which has no
  // meaning for our collectors.
  if (!Number.isInteger(args.timestamp) || args.timestamp < 0) {
    throw new Error(
      `PriceHistory: timestamp must be a non-negative integer ` +
        `(UNIX seconds). Received: ${args.timestamp}`,
    )
  }
  const date = new Date(args.timestamp * 1000)
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `PriceHistory: timestamp ${args.timestamp} produced an ` +
        `invalid Date.`,
    )
  }

  // --- price -----------------------------------------------------------
  if (typeof args.price !== "number" || !Number.isFinite(args.price)) {
    throw new Error(
      `PriceHistory: price must be a finite number. Received: ` +
        `${JSON.stringify(args.price)}`,
    )
  }
  if (args.price < 0) {
    throw new Error(
      `PriceHistory: price must be non-negative. Received: ${args.price}.`,
    )
  }

  // --- source ----------------------------------------------------------
  if (typeof args.source !== "string" || args.source.trim().length === 0) {
    throw new Error("PriceHistory: source must be a non-empty string.")
  }
  const source = args.source.trim().toLowerCase()
  if (!isPriceHistorySource(source)) {
    throw new Error(
      `PriceHistory: source "${args.source}" is not a canonical ` +
        `provenance tag. Allowed: ${PRICE_HISTORY_SOURCES.join(", ")}.`,
    )
  }

  // Encode the price as a decimal string with at most 18 fractional
  // digits to match the SQL `numeric(40, 18)` column. JS `toFixed`
  // rounds half-to-even in V8, which is the same default Postgres
  // uses for numeric conversions, so the round-trip is stable.
  const priceStr = args.price.toFixed(18)

  return {
    symbol,
    timestamp: date,
    price: priceStr,
    source,
  }
}

/**
 * Insert a single price sample. Duplicate `(symbol, timestamp)` is a
 * no-op — the existing row is preserved untouched. Returns `true` if
 * a new row was inserted, `false` if the duplicate was ignored.
 *
 * This is server-side only. The caller is responsible for the
 * surrounding transaction if multiple samples are inserted together
 * (Phase C may add a `insertPriceSamples` bulk primitive; this
 * phase keeps the surface to single-row inserts).
 */
export async function insertPriceSample(
  args: InsertPriceSampleArgs,
): Promise<{ inserted: boolean; symbol: string; timestamp: number }> {
  const values = buildPriceHistoryInsert(args)
  const db = getDb()

  // We use ON CONFLICT DO NOTHING so that re-running a collector tick
  // does NOT clobber an earlier record. This matches the spec's
  // "idempotent / ignore duplicate" preference.
  const result = await db
    .insert(priceHistory)
    .values(values)
    .onConflictDoNothing({
      target: [priceHistory.symbol, priceHistory.timestamp],
    })
    .returning({ symbol: priceHistory.symbol, timestamp: priceHistory.timestamp })

  // `.returning(...)` on a no-op insert yields zero rows. We still
  // re-query to confirm idempotency because Drizzle's
  // `onConflictDoNothing` does not always populate `result.rowCount`
  // portably.
  const inserted = result.length > 0
  const tsSeconds = Math.floor(values.timestamp.getTime() / 1000)
  return { inserted, symbol: values.symbol, timestamp: tsSeconds }
}

/**
 * Read price samples for one symbol between two timestamps,
 * ascending by timestamp. Returns an empty array if no samples
 * exist — never fabricates points, never interpolates.
 *
 * The (from, to) range is INCLUSIVE on both ends.
 */
export async function getPriceHistory(
  args: GetPriceHistoryArgs,
): Promise<StoredPriceSample[]> {
  // Validation mirrors `buildPriceHistoryInsert` but does NOT touch
  // price/source — those are irrelevant for a read.
  if (typeof args.symbol !== "string") {
    throw new Error("PriceHistory: symbol must be a string.")
  }
  const symbol = args.symbol.trim().toUpperCase()
  if (!isSupportedPriceHistorySymbol(symbol)) {
    return []
  }
  if (
    typeof args.from !== "number" ||
    !Number.isInteger(args.from) ||
    args.from < 0
  ) {
    throw new Error(
      `PriceHistory: from must be a non-negative integer ` +
        `(UNIX seconds). Received: ${JSON.stringify(args.from)}`,
    )
  }
  if (
    typeof args.to !== "number" ||
    !Number.isInteger(args.to) ||
    args.to < 0
  ) {
    throw new Error(
      `PriceHistory: to must be a non-negative integer ` +
        `(UNIX seconds). Received: ${JSON.stringify(args.to)}`,
    )
  }
  if (args.from > args.to) {
    return []
  }

  const db = getDb()
  const fromDate = new Date(args.from * 1000)
  const toDate = new Date(args.to * 1000)

  const rows = await db
    .select({
      symbol: priceHistory.symbol,
      timestamp: priceHistory.timestamp,
      price: priceHistory.price,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.symbol, symbol),
        gte(priceHistory.timestamp, fromDate),
        lte(priceHistory.timestamp, toDate),
      ),
    )
    .orderBy(asc(priceHistory.timestamp))

  return rows.map((row) => {
    const tsSeconds = Math.floor(row.timestamp.getTime() / 1000)
    const priceStr = typeof row.price === "string" ? row.price : String(row.price)
    const priceNumber = Number.parseFloat(priceStr)
    return {
      symbol: row.symbol,
      timestamp: tsSeconds,
      price: priceStr,
      priceNumber: Number.isFinite(priceNumber) ? priceNumber : 0,
      source: row.source as PriceHistorySource,
    }
  })
}

/**
 * Return the most recent stored sample for a symbol, or `null` if
 * the storage layer has no data yet.
 *
 * This is a thin convenience helper. Phase 4B only declares it as
 * part of the surface so the future collector can avoid double-
 * inserting the latest observed timestamp; it is NOT yet called from
 * any UI or API code.
 */
export async function getLatestStoredPrice(
  symbol: string,
): Promise<StoredPriceSample | null> {
  if (typeof symbol !== "string") {
    throw new Error("PriceHistory: symbol must be a string.")
  }
  const normalized = symbol.trim().toUpperCase()
  if (!isSupportedPriceHistorySymbol(normalized)) {
    return null
  }

  const db = getDb()
  const rows = await db
    .select({
      symbol: priceHistory.symbol,
      timestamp: priceHistory.timestamp,
      price: priceHistory.price,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .where(eq(priceHistory.symbol, normalized))
    .orderBy(asc(priceHistory.timestamp))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  const tsSeconds = Math.floor(row.timestamp.getTime() / 1000)
  const priceStr = typeof row.price === "string" ? row.price : String(row.price)
  const priceNumber = Number.parseFloat(priceStr)
  return {
    symbol: row.symbol,
    timestamp: tsSeconds,
    price: priceStr,
    priceNumber: Number.isFinite(priceNumber) ? priceNumber : 0,
    source: row.source as PriceHistorySource,
  }
}
