"use client"

/**
 * MarketSummary — compact 104px three-metric strip.
 *
 *   · Active markets count
 *   · Total liquidity (USD)
 *   · Avg borrow APY
 *
 * No admin chrome. Same beige surface as the rest of the
 * dashboard. Fields with no underlying data render as `—`.
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
      className="rounded-[14px] border border-border overflow-hidden"
      style={{
        minHeight: "var(--dash-explainer-h)",
        backgroundColor: "var(--card-soft)",
      }}
    >
      <div className="grid grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
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
    <div
      className="flex flex-col justify-center px-5 py-4"
      style={{ minHeight: "var(--dash-explainer-h)" }}
    >
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase">
        {label}
      </div>
      <div
        className={[
          "font-serif tabular-nums leading-none mt-2",
          tone === "down" ? "text-down" : "text-foreground",
        ].join(" ")}
        style={{ fontSize: "24px" }}
      >
        {value}
      </div>
    </div>
  )
}
