"use client"

/**
 * Dashboard — composed rhythm (UI-1B · live realtime edition).
 *
 *   1. Page title                  (24px sans · -0.02em)
 *   2. Hero summary                (single composed sage surface)
 *   3. Live Liquidity              (34% / 66% · soft surfaces)
 *   4. Stock Opportunities         (search + filter row · 3-col cards)
 *   5. Yield Venues
 *
 *   Tight composed rhythm, no mechanical stacking.
 *   Section gap: 40px · heading gap: 16px · card gap: 16px.
 */

import * as React from "react"
import { PageTitle, SectionTitle } from "@/components/zeks/page-title"
import { DashboardHero } from "@/components/zeks/dashboard/hero-summary"
import { LiveLiquidity } from "@/components/zeks/dashboard/live-liquidity"
import { StockOpportunities } from "@/components/zeks/dashboard/stock-opportunities"
import { YieldVenues } from "@/components/zeks/dashboard/yield-venues"
import { LiveSyncedTag } from "@/components/zeks/live-synced-tag"
import { useMarketSummary } from "@/components/zeks/dashboard/use-market-summary"
import { useLoopVenues } from "@/components/zeks/dashboard/use-loop-venues"
import type { LendingMarket } from "@/lib/markets/lending"
import type { MarketQuote } from "@/lib/markets/client"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface DashboardProps {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
  marketsError: string | null
  stockMarketCount: number | null
  yieldVenues: YieldVenue[]
  yieldVenuesFetchedAt: string | null
  /** Real Robinhood quotes keyed by symbol for the 8 curated stocks.
   *  Used to surface REFERENCE PRICE on cards that have no Morpho /
   *  Chainlink oracle row (e.g. SPCX). NEVER fabricated. */
  curatedQuotes: Record<string, MarketQuote>
  /** Canonical curated 8 — used to backfill missing Morpho rows. */
  curatedSymbols: readonly string[]
}

export function Dashboard({
  markets: serverMarkets,
  marketsFetchedAt: serverMarketsFetchedAt,
  marketsError: serverMarketsError,
  stockMarketCount,
  yieldVenues: serverYieldVenues,
  yieldVenuesFetchedAt: serverYieldVenuesFetchedAt,
  curatedQuotes,
  curatedSymbols,
}: DashboardProps) {
  // ── Live market summary — refreshes every 3s via internal cache ──
  const {
    markets,
    fetchedAt: marketsFetchedAt,
    error: marketsLiveError,
  } = useMarketSummary({
    markets: serverMarkets,
    fetchedAt: serverMarketsFetchedAt,
  })

  // ── Live yield venues — refreshes every 5s via /api/loop/markets ──
  const {
    venues: yieldVenues,
    fetchedAt: yieldVenuesFetchedAt,
    error: yieldVenuesError,
  } = useLoopVenues({
    venues: serverYieldVenues,
    fetchedAt: serverYieldVenuesFetchedAt,
  })

  const marketsError = marketsLiveError ?? serverMarketsError
  const defaultVenueApy = React.useMemo<number | null>(() => {
    const live = yieldVenues.filter(
      (v) => v.apy != null && v.status === "live",
    )
    if (live.length === 0) return null
    return live.reduce(
      (best, v) => (v.apy != null && v.apy > best ? v.apy : best),
      0,
    )
  }, [yieldVenues])

  return (
    <div
      className="zeks-page"
      data-testid="dashboard-root"
    >
      {/* 1 · Page title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--page-title-gap)",
        }}
      >
        <PageTitle>Dashboard</PageTitle>
      </div>

      {/* 2 · Composed hero summary (replaces old 2 banners) */}
      <DashboardHero
        markets={markets}
        stockMarketCount={stockMarketCount}
      />

      {/* 3 · Live Liquidity */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "var(--dash-heading-gap)" }}
      >
        <SectionTitle>Live Liquidity</SectionTitle>
        <LiveLiquidity
          markets={markets}
          marketsFetchedAt={marketsFetchedAt}
        />
      </section>

      {/* 4 · Stock Opportunities */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "var(--dash-heading-gap)" }}
      >
        <SectionTitle
          trailing={
            marketsError ? (
              <LiveSyncedTag fetchedAt={null} prefix="Live data unavailable" />
            ) : (
              <LiveSyncedTag fetchedAt={marketsFetchedAt} prefix="Updated" />
            )
          }
        >
          Stock Opportunities
        </SectionTitle>
        <StockOpportunities
          markets={markets}
          venueApy={defaultVenueApy}
          curatedQuotes={curatedQuotes}
          curatedSymbols={curatedSymbols}
        />
      </section>

      {/* 5 · Yield Venues */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "var(--dash-heading-gap)" }}
      >
        <SectionTitle
          trailing={
            yieldVenuesError ? (
              <LiveSyncedTag fetchedAt={null} prefix="Live data unavailable" />
            ) : (
              <LiveSyncedTag
                fetchedAt={yieldVenuesFetchedAt}
                prefix="Updated"
              />
            )
          }
        >
          Yield Venues
        </SectionTitle>
        <YieldVenues
          venues={yieldVenues}
          fetchedAt={yieldVenuesFetchedAt}
        />
      </section>
    </div>
  )
}
