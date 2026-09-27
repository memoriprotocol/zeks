"use client"

/**
 * DashboardHero — composed top summary (UI-1B).
 *
 *   Replaces the previous two-banner stack (announcement + product
 *   explainer) with ONE soft sage surface.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │   Robinhood Chain                            Markets · Liquidity│
 *   │   Short ZEKS description / status          69      $511.49M   │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *   Single surface · ~20px radius · soft border · restrained text.
 *   All data is real (curated stock count + sum of totalSupply).
 */

import * as React from "react"
import { formatCompact } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface DashboardHeroProps {
  markets: LendingMarket[]
  stockMarketCount: number | null
}

export function DashboardHero({
  markets,
  stockMarketCount,
}: DashboardHeroProps) {
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
    <section
      data-testid="section-dashboard-hero"
      aria-label="Dashboard summary"
      style={{
        padding: "var(--dash-hero-pad)",
        borderRadius: "var(--dash-hero-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)",
        gap: "32px",
        alignItems: "center",
      }}
    >
      {/* LEFT — chain pill + ZEKS description */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              height: "26px",
              padding: "0 10px",
              borderRadius: "999px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--foreground)",
              letterSpacing: 0,
            }}
          >
            <span
              aria-hidden="true"
              className="zeks-anim-pulse"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--up)",
              }}
            />
            Robinhood Chain · 4663
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              fontWeight: 500,
              color: "var(--muted-foreground)",
              letterSpacing: 0,
            }}
          >
            Live data · Morpho & Chainlink
          </span>
        </div>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "14.5px",
            lineHeight: 1.45,
            color: "var(--foreground)",
            fontWeight: 400,
            maxWidth: "56ch",
            letterSpacing: "-0.008em",
            margin: 0,
          }}
        >
          Deposit a tokenized stock as collateral on Morpho, borrow a
          stablecoin against it, and route the stablecoin into a verified
          yield venue.
        </p>
      </div>

      {/* RIGHT — Markets + Liquidity metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
          borderLeft: "1px solid var(--border)",
          paddingLeft: "32px",
        }}
      >
        <HeroMetric label="Markets" value={stockMarketCount ?? "—"} />
        <HeroMetric
          label="Liquidity"
          value={
            totalLiquidityUsd != null
              ? formatCompact(totalLiquidityUsd)
              : "—"
          }
        />
      </div>
    </section>
  )
}

function HeroMetric({
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
          fontSize: "12px",
          letterSpacing: 0,
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "28px",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          fontWeight: 500,
          marginTop: "6px",
          fontVariantNumeric: "lining-nums tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  )
}
