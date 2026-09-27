"use client"

/**
 * MarketSummary — composed soft-sage container with 4 metrics (UI-2).
 *
 *   · Markets        — count of the displayed universe
 *   · Total Liquidity — sum of available liquidity / total supply
 *   · Avg Supply APY  — simple mean over finite values
 *   · Avg Borrow APY  — simple mean over finite values
 *
 * UI-2 visual pass:
 *   · Single composed container — soft sage surface, ~18px radius,
 *     subtle border, no internal gap-px grid lines.
 *   · Sans-first typography for everything (numbers AND labels).
 *   · Numbers > labels in size and weight.
 *   · Green only semantically (Supply APY in up-green tone); Borrow
 *     APY uses neutral foreground, never aggressive red.
 *
 * Calculation rules are unchanged from the prior version — stats are
 * always derived from whatever `markets` the parent passes in. No
 * admin chrome. Read-only. No data fetched here.
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

    const supplies: number[] = []
    const borrows: number[] = []
    for (const m of markets) {
      if (m.supplyApy != null && Number.isFinite(m.supplyApy))
        supplies.push(m.supplyApy)
      if (m.borrowApy != null && Number.isFinite(m.borrowApy))
        borrows.push(m.borrowApy)
    }
    const avgSupplyApy =
      supplies.length > 0
        ? supplies.reduce((a, b) => a + b, 0) / supplies.length
        : null
    const avgBorrowApy =
      borrows.length > 0
        ? borrows.reduce((a, b) => a + b, 0) / borrows.length
        : null

    return {
      active: markets.length,
      liquidity: anyLiquidity ? totalLiquidityUsd : null,
      avgSupplyApy,
      avgBorrowApy,
    }
  }, [markets])

  return (
    <div
      data-testid="markets-summary"
      aria-label="Market summary"
      data-markets-stats
      style={{
        backgroundColor: "var(--card-soft)",
        borderRadius: "18px",
        border: "1px solid var(--border)",
        padding: "22px 24px",
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        columnGap: "32px",
        rowGap: "20px",
      }}
    >
      <Metric label="Markets" value={String(stats.active)} />
      <Metric
        label="Total Liquidity"
        value={
          stats.liquidity != null ? formatCompact(stats.liquidity) : "—"
        }
      />
      <Metric
        label="Avg Supply APY"
        value={formatApy(stats.avgSupplyApy)}
        tone={stats.avgSupplyApy != null ? "up" : undefined}
      />
      <Metric
        label="Avg Borrow APY"
        value={formatApy(stats.avgBorrowApy)}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  const valueColor =
    tone === "up"
      ? "var(--up-strong)"
      : tone === "down"
        ? "var(--down-strong)"
        : "var(--foreground)"

  return (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        data-finance
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "26px",
          fontWeight: 500,
          color: valueColor,
          lineHeight: 1.05,
          marginTop: "8px",
          letterSpacing: "-0.018em",
        }}
      >
        {value}
      </div>
    </div>
  )
}
