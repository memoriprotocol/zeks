"use client"

/**
 * OverviewOpportunities
 *
 * Compact horizontal opportunities strip — single row of 6
 * priority markets. No big table.
 *
 *   - Each cell: asset, APY (mono), TVL/Liquidity (compact).
 *   - Featured (highest APY) gets a lime ribbon + larger APY type.
 *   - Click → /terminal/markets/[symbol].
 *
 * No header chrome — the hero on the Overview page already covers
 * that role.
 */

import * as React from "react"
import Link from "next/link"
import {
  formatPrice,
  formatApy,
  formatUtilization,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface OverviewOpportunitiesProps {
  markets: LendingMarket[]
  fetchedAt: string | null
  errorMessage: string | null
  loading?: boolean
}

const MAX_CELLS = 6

export default function OverviewOpportunities({
  markets,
  fetchedAt,
  errorMessage,
  loading,
}: OverviewOpportunitiesProps) {
  const rows = React.useMemo(() => {
    return markets
      .filter((m) => m.supplyApy != null)
      .slice()
      .sort((a, b) => {
        const apyDiff =
          (b.supplyApy ?? Number.NEGATIVE_INFINITY) -
          (a.supplyApy ?? Number.NEGATIVE_INFINITY)
        if (apyDiff !== 0) return apyDiff
        return (b.totalSupply ?? 0) - (a.totalSupply ?? 0)
      })
      .slice(0, MAX_CELLS)
  }, [markets])

  return (
    <section
      aria-label="Top earn opportunities"
      data-testid="overview-opportunities"
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-baseline justify-between gap-2 px-5 py-3 border-b border-border">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            OPPORTUNITIES
          </span>
          <span className="text-[11px] text-muted-foreground">
            Top supply APY on Morpho
          </span>
        </div>
        <Link
          href="/terminal/earn"
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          View all →
        </Link>
      </div>

      {errorMessage ? (
        <EmptyStrip message="Live data unavailable" />
      ) : rows.length === 0 ? (
        <EmptyStrip message="No opportunities available" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-border">
          {rows.map((m, i) => (
            <OpportunityCell key={m.marketId} market={m} featured={i === 0} />
          ))}
        </div>
      )}

      <div className="px-5 py-2 border-t border-border flex items-center justify-between gap-2 text-[10px] font-mono tracking-wider text-muted-foreground/60">
        <span>{loading ? "Refreshing…" : `Updated ${relative(fetchedAt)}`}</span>
        <span>Morpho</span>
      </div>
    </section>
  )
}

function OpportunityCell({
  market,
  featured,
}: {
  market: LendingMarket
  featured: boolean
}) {
  return (
    <Link
      href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
      className={
        "relative block px-4 py-3.5 hover:bg-secondary/50 transition-colors " +
        (featured ? "bg-accent/30" : "")
      }
    >
      {featured ? (
        <span
          aria-hidden="true"
          className="absolute left-3 right-3 top-0 h-[2px] bg-primary"
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold text-foreground truncate">
          {market.symbol}
        </span>
        <span
          className={
            "font-mono tabular-nums " +
            (featured ? "text-[17px] text-up" : "text-[14px] text-up/90")
          }
        >
          {formatApy(market.supplyApy)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-mono tracking-wider text-muted-foreground/70">
        <span className="truncate">{market.collateralAssetSymbol} collateral</span>
        <span className="tabular-nums">
          {formatUtilization(market.utilization)}
        </span>
      </div>
      <div className="mt-1 text-[10px] font-mono tracking-wider text-muted-foreground/60 truncate">
        TVL {formatPrice(market.totalSupply)}
      </div>
    </Link>
  )
}

function EmptyStrip({ message }: { message: string }) {
  return (
    <div className="px-5 py-4 text-[12px] font-mono text-muted-foreground">
      {message}
    </div>
  )
}

function relative(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
