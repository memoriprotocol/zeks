/**
 * GET /api/protocol/head
 *
 * Tiny endpoint: returns the current Robinhood Chain head block
 * number. The dashboard polls this every 2 seconds for the live
 * block ticker. The endpoint is heavily cached server-side so we
 * issue at most one upstream `eth_blockNumber` call every 2
 * seconds regardless of how many dashboards are open.
 */

import { NextResponse } from "next/server"
import { getCachedChainHead } from "@/lib/markets/protocol/chain-head"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const r = await getCachedChainHead()
    return NextResponse.json(
      {
        ok: r.head != null,
        head: r.head,
        fetchedAt: r.fetchedAt,
        errorMessage: r.errorMessage,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      {
        ok: false,
        head: null,
        fetchedAt: new Date().toISOString(),
        errorMessage: message,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
