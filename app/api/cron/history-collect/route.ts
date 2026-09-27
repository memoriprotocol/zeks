/**
 * Phase 4B / Phase C2 — Scheduled real-price history collector trigger.
 *
 *   GET /api/cron/history-collect
 *
 * Vercel Cron calls this route once per minute (per the schedule in
 * `vercel.json`). The handler reuses the Phase C1 collector exactly:
 * no price calculation is re-implemented here, no second price source
 * is introduced, and the chart layer is not wired up by this route.
 *
 * Security:
 *
 *   Vercel sends an `Authorization: Bearer <CRON_SECRET>` header on
 *   every cron invocation when the project has `CRON_SECRET` set as a
 *   plain-text environment variable. We verify the bearer token using
 *   a constant-time comparison.
 *
 *   The default Vercel mechanism is used here — there is no separate
 *   "cron" auth convention in this codebase yet, so we follow Vercel's
 *   documented CRON_SECRET flow rather than invent a new one.
 *
 *   We never log the secret, the database URL, or any authorization
 *   header value. Unauthorized requests receive 401 with no body.
 *
 * Concurrency:
 *
 *   A single in-process promise reference guards against overlapping
 *   runs inside the same serverless instance. On overlap we return 429
 *   immediately rather than spawning a second batch.
 *
 * Behavior:
 *
 *   - Calls `collectCurrentPriceHistory()` (Phase C1) unchanged.
 *   - Returns a concise JSON summary: timestamp, attempted, inserted,
 *     skipped, failed.
 *   - On success returns 200.
 *   - On DB / unrecoverable collector error returns 500.
 *   - Never writes a synthetic row, never retries in a tight loop.
 */

import { NextResponse } from "next/server"

import { collectCurrentPriceHistory } from "@/lib/markets/history/collector"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Vercel sends GET on cron invocations. We keep POST disabled. */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, message: "Method not allowed." },
    { status: 405, headers: { Allow: "GET" } },
  )
}

/** In-process guard against two overlapping cron invocations on the
 *  same serverless instance. Resets when the run resolves. */
let inFlight: Promise<unknown> | null = null

/**
 * Constant-time string comparison. We deliberately avoid `===` so a
 * timing side-channel cannot leak the secret character by character.
 *
 * Returns false for any malformed input (non-string, mismatched length)
 * without leaking which one.
 */
function safeBearerEquals(provided: string | null, expected: string): boolean {
  if (typeof provided !== "string") return false
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return mismatch === 0
}

export async function GET(request: Request): Promise<NextResponse> {
  // --- Auth -------------------------------------------------------------
  const expected = process.env.CRON_SECRET
  if (typeof expected !== "string" || expected.length === 0) {
    // We deliberately fail closed: if the secret is not configured,
    // we do NOT allow anyone to invoke the collector over HTTP. Local
    // runs use `npm run history:collect-once` instead, which does not
    // go through this route.
    return NextResponse.json(
      { ok: false, message: "Cron not configured." },
      { status: 503 },
    )
  }
  const header = request.headers.get("authorization")
  const provided = header && header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length)
    : null
  if (!safeBearerEquals(provided, expected)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized." },
      { status: 401 },
    )
  }

  // --- Concurrency guard ------------------------------------------------
  if (inFlight) {
    return NextResponse.json(
      { ok: false, message: "Collector already running." },
      { status: 429 },
    )
  }

  // --- Run --------------------------------------------------------------
  let summary: Awaited<ReturnType<typeof collectCurrentPriceHistory>>
  try {
    const run = collectCurrentPriceHistory()
    inFlight = run
    summary = await run
  } catch (err) {
    inFlight = null
    const message =
      err instanceof Error ? err.message : "Collector run failed."
    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    )
  } finally {
    inFlight = null
  }

  // --- Concise log line (no secrets) ------------------------------------
  // Server-side logging only; we keep the format compact and omit any
  // per-symbol detail or sensitive data.
  // eslint-disable-next-line no-console
  console.log(
    `[history-collect] ${summary.timestampIso} ` +
      `attempted=${summary.attempted} ` +
      `inserted=${summary.inserted} ` +
      `skipped=${summary.skipped} ` +
      `failed=${summary.failed}`,
  )

  return NextResponse.json(
    {
      ok: true,
      timestamp: summary.timestamp,
      timestampIso: summary.timestampIso,
      attempted: summary.attempted,
      inserted: summary.inserted,
      skipped: summary.skipped,
      failed: summary.failed,
    },
    { status: 200 },
  )
}
