/**
 * /terminal — ZEKS Loop Dashboard (v4)
 *
 * Loopr-style product hierarchy. Asymmetric composition:
 *
 *   1. Product banner          (ZEKS Loop explainer + Explore Loop CTA)
 *   2. Live liquidity          (TOTAL + largest markets | activity feed)
 *   3. Stock collateral markets (curated priority, search, filter, cards)
 *
 * Portfolio moved to /terminal/portfolio — dashboard no longer leads
 * with portfolio chrome.
 *
 * Server pre-fetches lending market universe + loop venues so the
 * first paint is honest; banner / liquidity / market sections render
 * with real Morpho data immediately.
 *
 * No transactions. No wallet signing. No fabricated numbers.
 */

import AppShell from "@/components/app/app-shell"
import AppOverview from "@/components/app/app-overview"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import { fetchLoopMarkets } from "@/lib/markets/loop/service"
import type { LendingMarket } from "@/lib/markets/lending"
import type { YieldVenue } from "@/lib/markets/loop/types"

export const metadata = {
  title: "ZEKS Terminal — Overview",
}

export const dynamic = "force-dynamic"

export default async function TerminalOverviewPage() {
  let markets: LendingMarket[] = []
  let marketsError: string | null = null
  let marketsFetchedAt: string | null = null

  let yieldVenues: YieldVenue[] = []

  try {
    const [lending, loop] = await Promise.allSettled([
      fetchLendingMarkets(undefined, { debug: false }),
      fetchLoopMarkets(),
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
    }
  } catch (err) {
    marketsError = err instanceof Error ? err.message : String(err)
  }

  const stockMarketCount =
    markets.length === 0 ? null : new Set(markets.map((m) => m.symbol)).size

  return (
    <AppShell current="overview" title="DASHBOARD">
      <AppOverview
        markets={markets}
        marketsFetchedAt={marketsFetchedAt}
        marketsError={marketsError}
        stockMarketCount={stockMarketCount}
        yieldVenueCount={yieldVenues.length}
        yieldVenues={yieldVenues}
      />
    </AppShell>
  )
}
