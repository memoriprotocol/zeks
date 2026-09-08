"use client"

/**
 * Dashboard — locked composition (v3)
 *
 *   <PageTitle>Dashboard</PageTitle>                            (28px serif)
 *   <AnnouncementBanner/>                            (full-width, 56px)
 *   <ProductExplainer/>                              (full-width, 104px)
 *   <SectionTitle>Live Liquidity</SectionTitle>
 *     · LEFT  (32%)  Total Liquidity card (108px)
 *     · RIGHT (68%)  Live Network Activity feed (max 228px · 120px empty)
 *   <SectionTitle>Stock Opportunities</SectionTitle>
 *     · Toolbar: search · filter
 *     · 3-col grid · 8 curated tickers (≥250px cards)
 *
 *   · Content width locked to 980px max.
 *   · Section titles live OUTSIDE cards.
 *   · 28px section gap · 14px card gap · 28px top padding.
 *   · No hero · no admin-table · no developer RPC text.
 *   · Strategy Signals & Market Capacity sections removed.
 */

import * as React from "react"
import { PageTitle, SectionTitle } from "@/components/zeks/page-title"
import { AnnouncementBanner } from "@/components/zeks/dashboard/announcement-banner"
import { ProductExplainer } from "@/components/zeks/dashboard/product-explainer"
import { LiveLiquidity } from "@/components/zeks/dashboard/live-liquidity"
import { StockOpportunities } from "@/components/zeks/dashboard/stock-opportunities"
import type { LendingMarket } from "@/lib/markets/lending"

interface DashboardProps {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
  marketsError: string | null
  stockMarketCount: number | null
}

const SECTION_GAP = "28px"
const TOP_PAD = "28px"

export function Dashboard({
  markets,
  marketsFetchedAt,
  marketsError,
  stockMarketCount,
}: DashboardProps) {
  return (
    <div
      className="w-full mx-auto"
      style={{ maxWidth: "var(--content-max)" }}
      data-testid="dashboard-root"
    >
      <div
        className="px-5 md:px-6 pb-12"
        style={{
          paddingTop: TOP_PAD,
          display: "flex",
          flexDirection: "column",
          gap: SECTION_GAP,
        }}
      >
        {/* 1 · Page title */}
        <PageTitle>Dashboard</PageTitle>

        {/* 2 · Announcement banner (56px) */}
        <AnnouncementBanner />

        {/* 3 · Product explainer (104px) */}
        <ProductExplainer
          markets={markets}
          stockMarketCount={stockMarketCount}
        />

        {/* 4 · LIVE LIQUIDITY (32% / 68%) */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <SectionTitle>Live Liquidity</SectionTitle>
          <LiveLiquidity markets={markets} />
        </section>

        {/* 5 · STOCK OPPORTUNITIES (3-col grid) — the strongest section */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <SectionTitle
            trailing={
              marketsError
                ? "Live data unavailable"
                : `Updated ${relative(marketsFetchedAt)}`
            }
          >
            Stock Opportunities
          </SectionTitle>
          <StockOpportunities markets={markets} />
        </section>
      </div>
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
