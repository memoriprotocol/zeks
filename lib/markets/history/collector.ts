/**
 * ZEKS Markets — Real price-history collector (Phase C1)
 *
 * Server-only. Reads the CANONICAL real current-price pipeline used by
 * the rest of ZEKS (Robinhood /rhj/prices) and persists one sample per
 * supported symbol into the `price_history` table.
 *
 * Design constraints (Phase C1):
 *
 *   - ONE source: `fetchRobinhoodQuotes` from `lib/markets/robinhood-prices`.
 *     No second price implementation. No DOM scraping. No hardcoded
 *     prices. No interpolation. No mocks.
 *
 *   - Symbol universe: `SUPPORTED_PRICE_HISTORY_SYMBOLS` from
 *     `db/schema.ts` (the canonical 8-stock Earn universe). We do not
 *     maintain a parallel list.
 *
 *   - Source tag: `"robinhood"` — the truthful provenance for every
 *     sample this collector writes. The storage layer accepts
 *     `"chainlink"` and `"backfill-provider"` for future phases; this
 *     module does not invent or alias them.
 *
 *   - Minute-bucket timestamp: a single collector run writes all of its
 *     samples at the same UTC minute boundary
 *     (`Math.floor(nowMs / 60000) * 60000`). This makes a retry within
 *     the same minute collapse onto the existing row via the
 *     `unique(symbol, timestamp)` index — `insertPriceSample` is
 *     idempotent on conflict.
 *
 *   - Per-symbol failure isolation: one symbol failing upstream or in
 *     validation must NOT prevent valid symbols from being stored.
 *
 *   - No fabrication: a row is only written when a real, finite, > 0
 *     price is obtained from the canonical pipeline. We never write 0,
 *     never carry forward a previous price, never fabricate a missing
 *     symbol.
 *
 *   - No scheduling: this module is one-shot only. Cron, `setInterval`,
 *     Vercel Cron, background workers, and similar recurring entry
 *     points belong to Phase C2.
 *
 * Out of scope (Phase C1): backfill, historical-vendor integration,
 * chart wiring, retry policy beyond what `fetchRobinhoodQuotes`
 * already provides.
 */

import { fetchRobinhoodQuotes } from "@/lib/markets/robinhood-prices"
import {
  SUPPORTED_PRICE_HISTORY_SYMBOLS,
  type SupportedPriceHistorySymbol,
} from "@/db/schema"
import { insertPriceSample } from "@/lib/markets/history/storage"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result for a single symbol within a single collector run.
 *
 * Exactly one of `inserted` or `skipped` is true on success; on failure
 * both are false and `reason` is populated.
 */
export interface CollectorSymbolResult {
  symbol: SupportedPriceHistorySymbol | string
  /** Resolved UTC UNIX seconds that the row was written at. */
  timestamp: number
  /** Stored price in USD. Present iff `inserted` is true. */
  price: number | null
  /** Truthful provenance tag. Always `"robinhood"` for Phase C1. */
  source: "robinhood"
  /** True when a new row was created. */
  inserted: boolean
  /** True when upstream returned no usable price for this symbol. */
  skipped: boolean
  /** Failure reason when neither `inserted` nor `skipped` is true. */
  reason: string | null
}

export interface CollectorRunSummary {
  /** UTC UNIX seconds used for this entire run (minute-bucketed). */
  timestamp: number
  /** ISO string of the same timestamp, for human-friendly logs. */
  timestampIso: string
  /** Total symbols attempted. */
  attempted: number
  /** Symbols that produced a new row. */
  inserted: number
  /** Symbols where upstream returned no usable price (no row written). */
  skipped: number
  /** Symbols where the run failed (network / validation / DB). */
  failed: number
  /** Per-symbol detail. */
  results: CollectorSymbolResult[]
}

/** Hard timeout (ms) for the upstream batch in a one-shot run. */
const COLLECT_BATCH_TIMEOUT_MS = 8_000

/** Bucket a Date to the start of its UTC minute. */
function bucketToMinute(date: Date): Date {
  const ms = date.getTime()
  const minuteStart = Math.floor(ms / 60_000) * 60_000
  return new Date(minuteStart)
}

/**
 * Collect one current-price sample for every symbol in
 * `SUPPORTED_PRICE_HISTORY_SYMBOLS` and persist them to `price_history`.
 *
 * The returned `timestamp` is a minute-bucket shared by every result in
 * the same call. A second invocation within the same minute will reuse
 * the same bucket, and `insertPriceSample` collapses onto the existing
 * row via `unique(symbol, timestamp)`.
 *
 * One failed symbol does NOT block the others. The summary reports
 * `inserted / skipped / failed` plus a per-symbol breakdown.
 *
 * No secrets are logged. No `DATABASE_URL` is exposed.
 */
export async function collectCurrentPriceHistory(
  options: { now?: Date } = {},
): Promise<CollectorRunSummary> {
  const rawNow = options.now ?? new Date()
  const bucket = bucketToMinute(rawNow)
  const timestampSeconds = Math.floor(bucket.getTime() / 1000)

  const symbols = [...SUPPORTED_PRICE_HISTORY_SYMBOLS]

  // Fetch all canonical current prices in a single batched call.
  // `fetchRobinhoodQuotes` is the only authoritative real-price path.
  const set = await fetchRobinhoodQuotes(symbols, {
    timeoutMs: COLLECT_BATCH_TIMEOUT_MS,
  })
  const failedSet = new Set(set.failedSymbols)

  // Process each symbol in parallel so a slow / failing symbol does not
  // serialize the whole run. `Promise.allSettled` guarantees isolation.
  const perSymbol = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const quote = set.quotes[symbol]
      if (!quote || typeof quote.referencePrice !== "number") {
        if (failedSet.has(symbol)) {
          return {
            symbol,
            timestamp: timestampSeconds,
            price: null,
            source: "robinhood" as const,
            inserted: false,
            skipped: false,
            reason:
              "Upstream /rhj/prices did not return a usable referencePrice.",
          }
        }
        return {
          symbol,
          timestamp: timestampSeconds,
          price: null,
          source: "robinhood" as const,
          inserted: false,
          skipped: true,
          reason:
            "Canonical price pipeline returned no quote and no failure marker.",
        }
      }

      const price = quote.referencePrice
      if (!Number.isFinite(price) || price <= 0) {
        return {
          symbol,
          timestamp: timestampSeconds,
          price: null,
          source: "robinhood" as const,
          inserted: false,
          skipped: false,
          reason: `Non-finite or non-positive price: ${JSON.stringify(price)}.`,
        }
      }

      try {
        const r = await insertPriceSample({
          symbol,
          timestamp: timestampSeconds,
          price,
          source: "robinhood",
        })
        return {
          symbol,
          timestamp: r.timestamp,
          price,
          source: "robinhood" as const,
          inserted: r.inserted,
          // An idempotent re-run within the same minute is treated as
          // "skipped" rather than a successful insert. This communicates
          // to the caller that the canonical row already existed.
          skipped: !r.inserted,
          reason: r.inserted
            ? null
            : "Duplicate (symbol, timestamp) — existing row preserved.",
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Insert failed for unknown reason."
        return {
          symbol,
          timestamp: timestampSeconds,
          price: null,
          source: "robinhood" as const,
          inserted: false,
          skipped: false,
          reason: message,
        }
      }
    }),
  )

  const results: CollectorSymbolResult[] = perSymbol.map((p, i) => {
    if (p.status === "fulfilled") return p.value
    const message =
      p.reason instanceof Error ? p.reason.message : String(p.reason)
    return {
      symbol: symbols[i],
      timestamp: timestampSeconds,
      price: null,
      source: "robinhood",
      inserted: false,
      skipped: false,
      reason: `Unhandled collector error: ${message}`,
    }
  })

  let inserted = 0
  let skipped = 0
  let failed = 0
  for (const r of results) {
    if (r.inserted) inserted += 1
    else if (r.skipped) skipped += 1
    else failed += 1
  }

  return {
    timestamp: timestampSeconds,
    timestampIso: bucket.toISOString(),
    attempted: symbols.length,
    inserted,
    skipped,
    failed,
    results,
  }
}

/**
 * Collect one current-price sample for a single symbol. Convenience
 * wrapper for diagnostic / on-demand use. Phase C1 does NOT wire this
 * to any UI or route handler — it exists so Phase C2 (or manual
 * investigation) can target a single ticker without a batch.
 */
export async function collectCurrentPriceForSymbol(
  symbolInput: string,
  options: { now?: Date } = {},
): Promise<CollectorSymbolResult> {
  const symbol = symbolInput.trim().toUpperCase()
  if (!(SUPPORTED_PRICE_HISTORY_SYMBOLS as readonly string[]).includes(symbol)) {
    const rawNow = options.now ?? new Date()
    const bucket = bucketToMinute(rawNow)
    const timestampSeconds = Math.floor(bucket.getTime() / 1000)
    return {
      symbol,
      timestamp: timestampSeconds,
      price: null,
      source: "robinhood",
      inserted: false,
      skipped: false,
      reason: `Unsupported symbol "${symbol}". See SUPPORTED_PRICE_HISTORY_SYMBOLS.`,
    }
  }

  const set = await fetchRobinhoodQuotes([symbol], {
    timeoutMs: COLLECT_BATCH_TIMEOUT_MS,
  })
  const quote = set.quotes[symbol]
  const rawNow = options.now ?? new Date()
  const bucket = bucketToMinute(rawNow)
  const timestampSeconds = Math.floor(bucket.getTime() / 1000)

  if (!quote || typeof quote.referencePrice !== "number") {
    return {
      symbol,
      timestamp: timestampSeconds,
      price: null,
      source: "robinhood",
      inserted: false,
      skipped: false,
      reason: "Upstream /rhj/prices did not return a usable referencePrice.",
    }
  }

  const price = quote.referencePrice
  if (!Number.isFinite(price) || price <= 0) {
    return {
      symbol,
      timestamp: timestampSeconds,
      price: null,
      source: "robinhood",
      inserted: false,
      skipped: false,
      reason: `Non-finite or non-positive price: ${JSON.stringify(price)}.`,
    }
  }

  try {
    const r = await insertPriceSample({
      symbol,
      timestamp: timestampSeconds,
      price,
      source: "robinhood",
    })
    return {
      symbol,
      timestamp: r.timestamp,
      price,
      source: "robinhood",
      inserted: r.inserted,
      skipped: !r.inserted,
      reason: r.inserted
        ? null
        : "Duplicate (symbol, timestamp) — existing row preserved.",
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Insert failed for unknown reason."
    return {
      symbol,
      timestamp: timestampSeconds,
      price: null,
      source: "robinhood",
      inserted: false,
      skipped: false,
      reason: message,
    }
  }
}
