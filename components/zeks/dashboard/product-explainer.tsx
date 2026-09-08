"use client"

/**
 * ProductExplainer — full-width two-column explainer.
 *
 *   Left  (≈ 2fr) — product text (≤ 2 lines)
 *   Right (≈ 1fr) — 2 small metrics, vertically centered
 *
 * Height target = 104px. Single beige surface; thin border.
 */

import * as React from "react"
import { formatCompact } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface ProductExplainerProps {
  markets: LendingMarket[]
  stockMarketCount: number | null
}

export function ProductExplainer({
  markets,
  stockMarketCount,
}: ProductExplainerProps) {
  const totalLiquidityUsd = React.useMemo(() => {
    let total = 0
    let any = false
    for (const m of markets) {
      const v = m.totalSupply ?? null
      if (v != null && Number.isFinite(v)) {
        total += v
        any = true
      }
    }
    return any ? total : null
  }, [markets])

  return (
    <div
      data-testid="section-product-explainer"
      aria-label="Product explainer"
      className="w-full rounded-[14px] border border-border overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-0"
      style={{
        minHeight: "var(--dash-explainer-h)",
        backgroundColor: "var(--card-soft)",
      }}
    >
      <div className="px-5 md:border-r md:border-border flex items-center">
        <p
          className="text-[13px] text-foreground/90 max-w-prose"
          style={{
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          Deposit a tokenized stock as collateral on Morpho, borrow a
          stablecoin against it, and route the stablecoin into a yield venue.
        </p>
      </div>

      <div className="px-5 flex items-center justify-between gap-4">
        <Metric
          label="Markets"
          value={stockMarketCount ?? "—"}
        />
        <Metric
          label="Liquidity"
          value={
            totalLiquidityUsd != null
              ? formatCompact(totalLiquidityUsd)
              : "—"
          }
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase">
        {label}
      </div>
      <div
        className="font-serif tabular-nums leading-none text-[24px] text-foreground mt-1.5"
      >
        {value}
      </div>
    </div>
  )
}
