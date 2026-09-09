"use client"

/**
 * MarketSummary — compact 3-metric strip.
 *
 *   · Active markets count
 *   · Total liquidity (USD)
 *   · Avg borrow APY
 *
 * No admin chrome. Same beige surface as the rest of the
 * dashboard. Fields with no underlying data render as `—`.
 * Uses locked tokens: --dash-card-radius · --dash-card-pad.
 */

import * as React from "react"
import { formatApy, formatCompact } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface MarketSummaryProps {
  markets: LendingMarket[]
}

export function MarketSummary({ markets }: MarketSummaryProps) {
  const stats = React.useMemo(() => {
    let totalLiquidityUsd = 0
    let anyLiquidity = false
    for (const m of markets) {
      const v = m.availableLiquidity ?? m.totalSupply ?? null
      if (v != null && Number.isFinite(v)) {
        totalLiquidityUsd += v
        anyLiquidity = true
      }
    }

    const borrows: number[] = []
    for (const m of markets) {
      if (m.borrowApy != null && Number.isFinite(m.borrowApy))
        borrows.push(m.borrowApy)
    }
    const avgBorrowApy =
      borrows.length > 0
        ? borrows.reduce((a, b) => a + b, 0) / borrows.length
        : null

    return {
      active: markets.length,
      liquidity: anyLiquidity ? totalLiquidityUsd : null,
      avgBorrowApy,
    }
  }, [markets])

  return (
    <div
      data-testid="markets-summary"
      aria-label="Market summary"
      className="border overflow-hidden"
      style={{
        backgroundColor: "var(--card-soft)",
        borderColor: "var(--border)",
        borderRadius: "var(--dash-card-radius)",
        padding: "var(--dash-card-pad)",
      }}
    >
      <div
        className="grid grid-cols-1 sm:grid-cols-3"
        style={{ rowGap: "16px", columnGap: "16px" }}
      >
        <SummaryCell label="Active Markets" value={String(stats.active)} />
        <SummaryCell
          label="Total Liquidity"
          value={stats.liquidity != null ? formatCompact(stats.liquidity) : "—"}
        />
        <SummaryCell
          label="Avg Borrow APY"
          value={formatApy(stats.avgBorrowApy)}
          tone={stats.avgBorrowApy != null ? "down" : undefined}
        />
      </div>
    </div>
  )
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "down"
}) {
  return (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "28px",
          letterSpacing: "-0.02em",
          color: tone === "down" ? "var(--down)" : "var(--foreground)",
          marginTop: "8px",
        }}
      >
        {value}
      </div>
    </div>
  )
}
