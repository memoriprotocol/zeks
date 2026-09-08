/**
 * GET /api/loop/markets
 *
 * Returns curated LoopMarkets (AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, SPCX)
 * and YieldVenues (USDG / USDC / USDT supply markets on Morpho) with real
 * GraphQL data. Falls back gracefully per-field when no onchain market exists.
 */

import { NextResponse } from "next/server"
import { fetchLoopMarkets } from "@/lib/markets/loop/service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const result = await fetchLoopMarkets()
    return NextResponse.json({
      ok: true,
      markets: result.markets,
      yieldVenues: result.yieldVenues,
      failedStockSymbols: result.failedStockSymbols,
      failedLoanSymbols: result.failedLoanSymbols,
      fetchedAt: result.fetchedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[/api/loop/markets]", message)
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
