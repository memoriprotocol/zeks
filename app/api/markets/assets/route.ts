/**
 * GET /api/markets/assets
 *
 * Server-side proxy for the Robinhood Stock Token asset universe.
 *
 * Browser code calls this rather than hitting Robinhood directly so:
 *   - we control caching / revalidation centrally,
 *   - we don't leak upstream URLs into the bundle,
 *   - we can later swap providers without rewriting callers.
 *
 * Response shape is a `MarketsPayload` fragment — just the assets +
 * `assetsFetchedAt`. Quote data is fetched separately via
 * `/api/markets/quotes` so the two can refresh at different cadences.
 */

import { NextResponse } from "next/server"
import { fetchRobinhoodAssets } from "@/lib/markets/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const assets = await fetchRobinhoodAssets()
    return NextResponse.json(
      {
        ok: true,
        assets,
        assetsFetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          // Allow the browser to cache the asset universe for a
          // short window too — metadata is slow-moving.
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      },
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load markets."
    return NextResponse.json(
      { ok: false, message },
      { status: 502 },
    )
  }
}
