/**
 * One-shot runner for the Phase C1 real price-history collector.
 *
 *   npm run history:collect-once
 *
 * Loads `.env.local` (same convention as `drizzle.config.ts` and the
 * Next.js runtime), invokes `collectCurrentPriceHistory()`, prints a
 * human-readable summary, and exits with code 0 when at least one
 * symbol resolved and was stored, or non-zero otherwise.
 *
 * This script is the ONLY manual entry point for Phase C1. It does not
 * install any cron, schedule, or background work. Re-running it within
 * the same UTC minute is safe: the minute-bucket timestamp plus the
 * `unique(symbol, timestamp)` index make the second run a no-op for
 * symbols that already have a row.
 */

// Load .env* before any module reads `process.env.DATABASE_URL`.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv({ path: ".env" })

import { collectCurrentPriceHistory } from "../lib/markets/history/collector"

async function main(): Promise<void> {
  const summary = await collectCurrentPriceHistory()
  const lines: string[] = []
  lines.push("=== price_history collector run ===")
  lines.push(`bucket timestamp: ${summary.timestampIso} (UNIX ${summary.timestamp}s)`)
  lines.push(
    `summary: attempted=${summary.attempted} inserted=${summary.inserted} skipped=${summary.skipped} failed=${summary.failed}`,
  )
  for (const r of summary.results) {
    const status = r.inserted ? "INSERTED" : r.skipped ? "SKIPPED  " : "FAILED   "
    const priceStr = r.price === null ? "      —" : r.price.toFixed(6).padStart(10)
    lines.push(
      `  ${status}  ${r.symbol.padEnd(6)}  price=${priceStr}  reason=${r.reason ?? "—"}`,
    )
  }
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"))

  // Exit non-zero only when the entire run produced zero usable rows
  // AND every symbol failed. This matches the "real data or nothing"
  // policy of Phase C1.
  if (summary.inserted === 0 && summary.failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    "collector: fatal error:",
    err instanceof Error ? err.message : String(err),
  )
  process.exit(1)
})
