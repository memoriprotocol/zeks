/**
 * GET /api/protocol/activity
 *
 * Server-side endpoint for the dashboard's Live Protocol Activity
 * feed. The browser polls this route ONLY. Robinhood RPC is never
 * called from the client for this feed.
 *
 * Why:
 *   · Avoids browser-side CORS / 429 from `rpc.mainnet.chain.robinhood.com`.
 *   · Server-side cache + inflight dedupe means many concurrent
 *     dashboards share one upstream scan every 10 seconds.
 *   · Incremental scanning (trailing ~1,000 blocks on warm refresh)
 *     keeps the upstream RPC bill bounded.
 *
 * Response shape:
 *
 *   {
 *     ok: boolean,
 *     events: ProtocolFeedEvent[],
 *     addedLast6Deposits: string,
 *     latestBlock: number | null,
 *     fromBlock: number | null,
 *     updatedAt: string,
 *     errorMessage: string | null,
 *     partial: boolean,
 *   }
 */

import { NextResponse } from "next/server"
import { getCachedProtocolFeed } from "@/lib/markets/protocol/cached-feed"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ZERO = "0x0000000000000000000000000000000000000000"

function bigIntPow10(decimals: number): bigint {
  let v = BigInt(1)
  for (let i = 0; i < decimals; i++) v *= BigInt(10)
  return v
}

function formatUsdg(raw: bigint, decimals: number): string {
  if (raw === BigInt(0)) return "0"
  if (decimals === 0) return raw.toString()
  const base = bigIntPow10(decimals)
  const whole = raw / base
  const frac = raw % base
  if (whole === BigInt(0)) {
    const fracStr = frac
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "")
    return fracStr ? `0.${fracStr}` : "0"
  }
  const fracStr = frac.toString().padStart(decimals, "0")
  const trimmed = fracStr.replace(/0+$/, "")
  return trimmed.length > 0
    ? `${whole.toString()}.${trimmed}`
    : whole.toString()
}

export async function GET() {
  try {
    const result = await getCachedProtocolFeed()

    // ── Aggregate "Added in last 6 deposits" (sum of newest 6 IN events) ──
    const ins = result.events
      .filter((e) => e.kind === "in")
      .slice(0, 6)

    let addedLast6Usdg: string = "0"
    if (ins.length > 0) {
      let totalRaw = BigInt(0)
      for (const e of ins) totalRaw += e.amountRaw
      const dec = ins[0]?.decimals ?? 18
      addedLast6Usdg = formatUsdg(totalRaw, dec)
    }

    return NextResponse.json(
      {
        ok: true,
        events: result.events.map((e) => ({
          id: e.id,
          txHash: e.txHash,
          logIndex: e.logIndex,
          blockNumber: e.blockNumber,
          timestamp: e.timestamp,
          vault: e.vault,
          venue: e.venue,
          label: e.label,
          kind: e.kind,
          amountUsdg: e.amountUsdg,
        })),
        addedLast6Deposits: addedLast6Usdg,
        latestBlock: result.scannedHead,
        fromBlock: result.fromBlock,
        updatedAt: result.fetchedAt,
        errorMessage: result.errorMessage,
        partial: result.partial,
      },
      {
        headers: {
          // Tell the browser / CDN this is hot — don't cache client-side.
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      {
        ok: false,
        events: [],
        addedLast6Deposits: "0",
        latestBlock: null,
        fromBlock: null,
        updatedAt: new Date().toISOString(),
        errorMessage: message,
        partial: false,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}

void ZERO
