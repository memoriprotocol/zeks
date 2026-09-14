/**
 * /terminal — ZEKS dashboard
 *
 *   Server fetches: lending market universe + loop venues.
 *   First paint uses honest data; sections re-render client-side
 *   as live data arrives.
 *
 *   No transactions enabled. Read-only.
 */

import AppShell from "@/components/app/app-shell"
import { Dashboard } from "@/components/zeks/dashboard"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import { fetchLoopMarkets } from "@/lib/markets/loop/service"
import { fetchRobinhoodQuotes } from "@/lib/markets/client"
import type { LendingMarket } from "@/lib/markets/lending"
import type { MarketQuote } from "@/lib/markets/client"
import type { YieldVenue } from "@/lib/markets/loop/types"

export const metadata = {
  title: "ZEKS Terminal — Dashboard",
}

export const dynamic = "force-dynamic"

/** Canonical curated 8 — must match every curated-only downstream
 * surface so symbols are never dropped because Morpho did not return
 * a market row. */
const CURATED_SYMBOLS = [
  "AAPL",
  "SPCX",
  "TSLA",
  "NVDA",
  "GOOGL",
  "AMZN",
  "MSFT",
  "META",
] as const

export default async function TerminalOverviewPage() {
  let markets: LendingMarket[] = []
  let marketsError: string | null = null
  let marketsFetchedAt: string | null = null
  let yieldVenues: YieldVenue[] = []
  let yieldVenuesFetchedAt: string | null = null
  let curatedQuotes: Record<string, MarketQuote> = {}

  try {
    const [lending, loop, quotes] = await Promise.allSettled([
      fetchLendingMarkets(undefined, { debug: false }),
      fetchLoopMarkets(),
      fetchRobinhoodQuotes(CURATED_SYMBOLS, { timeoutMs: 3_500 }),
    ])
    if (lending.status === "fulfilled") {
      if (lending.value.kind !== "error") {
        markets = lending.value.payload.markets
        marketsFetchedAt = lending.value.payload.fetchedAt
      } else {
        marketsError = lending.value.message
      }
    } else {
      marketsError = lending.reason instanceof Error
        ? lending.reason.message
        : String(lending.reason)
    }
    if (loop.status === "fulfilled") {
      yieldVenues = loop.value.yieldVenues
      yieldVenuesFetchedAt = loop.value.fetchedAt
    }
    if (quotes.status === "fulfilled") {
      curatedQuotes = quotes.value.quotes
    }
  } catch (err) {
    marketsError = err instanceof Error ? err.message : String(err)
  }

  const stockMarketCount =
    markets.length === 0 ? null : new Set(markets.map((m) => m.symbol)).size

  return (
    <AppShell>
      <Dashboard
        markets={markets}
        marketsFetchedAt={marketsFetchedAt}
        marketsError={marketsError}
        stockMarketCount={stockMarketCount}
        yieldVenues={yieldVenues}
        yieldVenuesFetchedAt={yieldVenuesFetchedAt}
        curatedQuotes={curatedQuotes}
        curatedSymbols={CURATED_SYMBOLS as readonly string[]}
      />
    </AppShell>
  )
}

