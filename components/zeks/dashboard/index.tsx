"use client"

/**
 * Dashboard — measured reference composition (live realtime edition).
 *
 *   1. Dashboard title  (26px serif · -0.04em)
 *   2. Announcement banner (rounded-2xl · mb-4)
 *   3. Product explainer (rounded-2xl · mb-8)
 *   4. Live Liquidity (3-col grid: 1fr / 2fr) — internal live loop (2s)
 *   5. Stock Opportunities (3-col cards · equal height · spread + lime CTA)
 *      — refreshed every 3s via /api/markets/lending
 *   6. Yield Venues — refreshed every 5s via /api/loop/markets
 *
 *   Content max width: var(--content-max) ≈ max-w-6xl (1152px)
 *   Section gap: 32-40 (use 36)
 *   Card gap: 16 · card radius 16 · card pad 20
 */

import * as React from "react"
import { PageTitle, SectionTitle } from "@/components/zeks/page-title"
import { AnnouncementBanner } from "@/components/zeks/dashboard/announcement-banner"
import { ProductExplainer } from "@/components/zeks/dashboard/product-explainer"
import { LiveLiquidity } from "@/components/zeks/dashboard/live-liquidity"
import { StockOpportunities } from "@/components/zeks/dashboard/stock-opportunities"
import { YieldVenues } from "@/components/zeks/dashboard/yield-venues"
import { LiveSyncedTag } from "@/components/zeks/live-synced-tag"
import { useMarketSummary } from "@/components/zeks/dashboard/use-market-summary"
import { useLoopVenues } from "@/components/zeks/dashboard/use-loop-venues"
import type { LendingMarket } from "@/lib/markets/lending"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface DashboardProps {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
  marketsError: string | null
  stockMarketCount: number | null
  yieldVenues: YieldVenue[]
  yieldVenuesFetchedAt: string | null
}

export function Dashboard({
  markets: serverMarkets,
  marketsFetchedAt: serverMarketsFetchedAt,
  marketsError: serverMarketsError,
  stockMarketCount,
  yieldVenues: serverYieldVenues,
  yieldVenuesFetchedAt: serverYieldVenuesFetchedAt,
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
      className="w-full mx-auto flex flex-col"
      style={{
        maxWidth: "var(--content-max)",
        gap: "var(--dash-section-gap)",
      }}
      data-testid="dashboard-root"
    >
      {/* 1 · Page title */}
      <PageTitle>Dashboard</PageTitle>

      {/* 2 · Announcement banner */}
      <AnnouncementBanner />

      {/* 3 · Product explainer */}
      <ProductExplainer
        markets={markets}
        stockMarketCount={stockMarketCount}
      />

      {/* 4 · Live Liquidity */}
      <section className="flex flex-col">
        <SectionTitle>Live Liquidity</SectionTitle>
        <LiveLiquidity markets={markets} />
      </section>

      {/* 5 · Stock Opportunities */}
      <section className="flex flex-col">
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
        />
      </section>

      {/* 6 · Yield Venues */}
      <section className="flex flex-col">
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
