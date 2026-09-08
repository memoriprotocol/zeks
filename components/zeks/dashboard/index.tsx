"use client"

/**
 * Dashboard — measured reference composition.
 *
 *   1. Dashboard title  (26px serif · -0.04em)
 *   2. Announcement banner (rounded-2xl · mb-4)
 *   3. Product explainer (rounded-2xl · mb-8)
 *   4. Live Liquidity (3-col grid: 1fr / 2fr)
 *   5. Stock Opportunities (3-col cards · equal height · spread + lime CTA)
 *   6. Yield Venues (same card system)
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
  markets,
  marketsFetchedAt,
  marketsError,
  stockMarketCount,
  yieldVenues,
  yieldVenuesFetchedAt,
}: DashboardProps) {
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
            marketsError
              ? "Live data unavailable"
              : `Updated ${relative(marketsFetchedAt)}`
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
            yieldVenuesFetchedAt
              ? `Updated ${relative(yieldVenuesFetchedAt)}`
              : "—"
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

function relative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
