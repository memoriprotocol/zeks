/**
 * GET /api/markets/history/[symbol]?range=1D
 *
 * Server-side route for historical price series.
 *
 * This route is the ONLY place the provider key is read. The
 * browser never talks to the upstream provider directly. The
 * provider key (RHRPC_API_KEY) is loaded server-side from
 * `.env.local` and is never serialized into the response.
 *
 * Response envelope:
 *
 *   {
 *     ok: true,
 *     series: HistoricalSeries | null,   // null when no usable data
 *     result: HistoryFetchResult,        // discriminated state
 *     generatedAt: string                // server timestamp
 *   }
 *
 * On validation failure (bad symbol, bad/missing range) the route
 * returns 400 with `{ ok: false, message }`. On unexpected errors
 * it returns 502 with `{ ok: false, message }`. The route never
 * hangs — the provider call is raced against a hard timeout.
 *
 * Cache headers:
 *
 *   - READY result: short Cache-Control (10s) so the chart can
 *     refresh without spamming upstream.
 *   - non-READY result: no-store, so a stale "provider-not-
 *     configured" response never sticks around after the key is
 *     added.
 */

import { NextResponse } from "next/server"
import { getHistoricalSeries } from "@/lib/markets/history/provider"
import { isHistoryRange, type HistoryRange } from "@/lib/markets/history/types"
import type { HistoricalSeries } from "@/lib/markets/history/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Hard upper bound on how long this route may take. */
const ROUTE_TIMEOUT_MS = 8_000

/** Sanity cap for symbol length — defensive guard against URL abuse. */
const MAX_SYMBOL_LENGTH = 32

/** Permitted characters in a symbol path segment. */
const SYMBOL_PATTERN = /^[A-Z0-9]{1,32}$/

interface RouteParams {
  params: Promise<{ symbol: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
  // 1. Symbol — must be uppercase alnum, length-bounded.
  const { symbol: rawSymbol } = await params
  const symbol = (rawSymbol ?? "").trim().toUpperCase()
  if (!symbol || symbol.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json(
      { ok: false, message: "Invalid symbol." },
      { status: 400 },
    )
  }

  // 2. Range — must be one of the allowed enum values.
  const url = new URL(request.url)
  const rangeRaw = url.searchParams.get("range") ?? ""
  if (!isHistoryRange(rangeRaw)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Invalid or missing range. Allowed: 1H, 1D, 1W, 1M.",
      },
      { status: 400 },
    )
  }
  const range: HistoryRange = rangeRaw

  // 3. Provider call — raced against a hard timeout so the route
  //    can never block indefinitely on a slow upstream.
  const providerCall = getHistoricalSeries(symbol, range, {
    timeoutMs: ROUTE_TIMEOUT_MS,
  })
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<"__timeout__">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("__timeout__"), ROUTE_TIMEOUT_MS)
  })

  let result = await Promise.race([providerCall, timeoutPromise])
  if (timeoutHandle) clearTimeout(timeoutHandle)

  if (result === "__timeout__") {
    return NextResponse.json(
      {
        ok: false,
        message: "Historical provider timed out.",
      },
      { status: 504 },
    )
  }

  // 4. Shape the response. We never serialize the upstream key
  //    (it's never on the object) and we never echo back raw
  //    provider errors as secrets.
  const series: HistoricalSeries | null =
    result.kind === "ready" || result.kind === "stale"
      ? result.series
      : null

  // Cache policy: real data is cacheable briefly; non-data states
  // are not (so adding the provider later immediately unblocks the
  // UI without waiting on a cached "not-configured" answer).
  const cacheControl =
    result.kind === "ready"
      ? "public, max-age=10, s-maxage=10"
      : "no-store"

  return NextResponse.json(
    {
      ok: true,
      series,
      result,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": cacheControl } },
  )
}
