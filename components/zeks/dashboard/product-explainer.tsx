"use client"

/**
 * ProductExplainer — single-line product strip.
 *
 *   sage-cream surface · rounded-2xl · p-4
 *   left = product copy
 *   right = 2 KPI metrics
 *
 *   No editorial feel — sans throughout, tight spacing.
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
        padding: "16px 20px",
        borderRadius: "12px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
        gap: "24px",
        marginBottom: "24px",
        alignItems: "center",
      }}
    >
      {/* Left — product copy */}
      <div className="flex items-center">
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            lineHeight: 1.5,
            color: "var(--foreground)",
            fontWeight: 400,
            maxWidth: "62ch",
            letterSpacing: "-0.005em",
          }}
        >
          Deposit a tokenized stock as collateral on Morpho, borrow a stablecoin
          against it, and route the stablecoin into a verified yield venue.
        </p>
      </div>

      {/* Right — metrics */}
      <div className="flex items-center gap-10">
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
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          letterSpacing: 0,
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="zeks-num-lg"
        style={{
          color: "var(--foreground)",
          marginTop: "2px",
        }}
      >
        {value}
      </div>
    </div>
  )
}
