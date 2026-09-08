"use client"

/**
 * AppOverview — ZEKS dashboard (Loopr-quality, original content).
 *
 * Sections:
 *   1. Product banner     — "Put tokenized stocks to work on
 *                          Robinhood Chain." (ProductBanner)
 *   2. Market capacity    — total liquidity · active markets · avg
 *                          borrow cost (MarketCapacity)
 *   3. Live network flow  — IN / TRANSFER / REVERTED onchain events
 *                          (NetworkFlow)
 *   4. Strategy signals   — top opportunities ranked by yield spread
 *                          · borrow cost · liquidity (StrategySignals)
 *   5. Stock opportunities — 8 curated ticker cards (StockOpportunities)
 *
 * Read-only. No transactions. No guessed contracts.
 */

import * as React from "react"
import ProductBanner from "./overview/overview-info-banner"
import MarketCapacity from "./overview/overview-liquidity"
import NetworkFlow from "./overview/overview-feed"
import StrategySignals from "./overview/overview-stock-markets"
import StockOpportunities from "./overview/overview-stock-collateral"
import type { LendingMarket } from "@/lib/markets/lending"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface AppOverviewProps {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
  marketsError: string | null
  stockMarketCount: number | null
  yieldVenueCount: number | null
  yieldVenues: YieldVenue[]
}

export default function AppOverview({
  markets,
  marketsFetchedAt,
  marketsError,
  stockMarketCount,
  yieldVenueCount,
  yieldVenues,
}: AppOverviewProps) {
  return (
    <div
      className="w-full max-w-[1320px] mx-auto space-y-3"
      data-testid="overview-root"
    >
      {/* Section 1 — Put stocks to work (product banner) */}
      <ProductBanner
        stockMarketCount={stockMarketCount}
        yieldVenueCount={yieldVenueCount}
      />

      {/* Section 2 — Market Capacity (3 stats) */}
      <MarketCapacity
        markets={markets}
        fetchedAt={marketsFetchedAt}
      />

      {/* Section 3 — Live Network Flow + Activity */}
      <section
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] gap-3"
        data-testid="overview-flow-row"
      >
        <div>
          <NetworkFlow />
        </div>
        <div
          aria-hidden="true"
          className="hidden lg:flex flex-col gap-1 font-mono text-[10px] tracking-wider text-muted-foreground/60"
        >
          <span>Network: Robinhood Chain 4663</span>
          <span>Prices: Chainlink oracles</span>
          <span>Lending: Morpho Blue</span>
          <span className="mt-1 text-muted-foreground/40">Read-only · no transactions</span>
        </div>
      </section>

      {/* Section 4 — Strategy Signals */}
      <StrategySignals
        markets={markets}
        yieldVenues={yieldVenues}
      />

      {/* Section 5 — Stock Opportunities (8 ticker cards) */}
      <StockOpportunities
        markets={markets}
        yieldVenues={yieldVenues}
        fetchedAt={marketsFetchedAt}
        errorMessage={marketsError}
      />

      {/* Footer attribution rail */}
      <div className="pt-2 flex items-center justify-between gap-2 flex-wrap font-mono text-[10px] tracking-wider text-muted-foreground/60">
        <span>ZEKS · Robinhood Chain 4663 · Morpho Blue + Chainlink oracles</span>
        <span>Read-only dashboard</span>
      </div>
    </div>
  )
}
