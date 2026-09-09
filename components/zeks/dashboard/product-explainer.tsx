"use client"

/**
 * ProductExplainer — editorial two-column explainer.
 *
 *   rounded-2xl · p-5 · mb-8 · warm beige surface · thin border
 *   left = product copy (≤ 2 lines, 13px sans)
 *   right = 2 small ZEKS metrics
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
      className="grid"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
        gap: "24px",
        marginBottom: "var(--dash-explainer-mb)",
      }}
    >
      {/* Left — product copy */}
      <div className="flex items-center">
        <p
          style={{
            fontSize: "var(--font-body)",
            lineHeight: 1.5,
            color: "var(--foreground)",
            opacity: 0.78,
            maxWidth: "60ch",
          }}
        >
          Deposit a tokenized stock as collateral on Morpho, borrow a stablecoin
          against it, and route the stablecoin into a verified yield venue.
        </p>
      </div>

      {/* Right — metrics */}
      <div className="flex items-center gap-8">
        <MiniMetric label="Markets" value={stockMarketCount ?? "—"} />
        <MiniMetric
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

function MiniMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div>
      <div className="zeks-label">{label}</div>
      <div
        className="zeks-num-lg"
        style={{
          color: "var(--foreground)",
          marginTop: "4px",
        }}
      >
        {value}
      </div>
    </div>
  )
}
