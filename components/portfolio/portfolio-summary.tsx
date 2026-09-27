"use client"

/**
 * PortfolioSummary (UI-6 visual rebuild)
 *
 * Single composed summary surface for the connected Portfolio page.
 *
 * Structure:
 *   · Compact row 1 — eyebrow · wallet/network status (right)
 *   · Net equity headline
 *   · 6-metric bar with dividers (Supplied · Borrowed · Collateral
 *     · Est. yield · W. APY · Positions)
 *   · Empty-state variant keeps the 6-cell grid but drops the
 *     headline + Browse-yield CTA into a single subtle prompt.
 *
 * UI-6 scope: presentation only. No new calculations, no new
 * metrics, no estimation. The values shown are read directly from
 * the existing locked `PortfolioSnapshot`:
 *   - totalSuppliedUsd / totalBorrowedUsd / totalCollateralUsd
 *   - netValueUsd / positionCount / weightedSupplyApy
 *
 * Source pills collapsed into a single subtle meta line (was 3
 * pills in v4 — repeated the global chain context). Live status
 * uses the existing `.zeks-chip` system instead of bespoke styling.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"

interface PortfolioSummaryProps {
  dataUnavailable: boolean
  snapshot?: PortfolioSnapshot | null
  loading?: boolean
}

export default function PortfolioSummary({
  dataUnavailable,
  snapshot,
  loading,
}: PortfolioSummaryProps) {
  if (snapshot) {
    const totalSupplied = snapshot.totalSuppliedUsd
    const totalBorrowed = snapshot.totalBorrowedUsd
    const totalCollateral = snapshot.totalCollateralUsd
    const netValue = snapshot.netValueUsd
    const positionCount = snapshot.positionCount
    const hasPositions = positionCount > 0
    const apy = snapshot.weightedSupplyApy
    const estYieldDaily =
      totalSupplied != null && apy != null
        ? (totalSupplied * (apy / 100)) / 365
        : null

    // Compact zero-position variant: keep the metric row, drop the
    // oversized hero padding and headline to avoid the tall-empty-panel
    // feel. Intentionally minimal — this is an empty account.
    if (!hasPositions) {
      return (
        <section
          aria-label="Account summary"
          data-testid="portfolio-summary"
          className="zeks-surface-padded"
          style={{ paddingTop: "14px", paddingBottom: "14px" }}
        >
          <header
            className="flex items-baseline justify-between gap-2 flex-wrap"
            data-portfolio-summary-head
          >
            <span className="zeks-label">Account Summary</span>
            <span className="zeks-meta">Robinhood Chain · Morpho</span>
          </header>
          <div
            className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-3"
            data-portfolio-summary-metrics
          >
            <Mini label="Supplied" value={totalSupplied != null ? formatPrice(totalSupplied) : "—"} tone="up" />
            <Mini label="Borrowed" value={totalBorrowed != null ? formatPrice(totalBorrowed) : "—"} tone="down" />
            <Mini label="Collateral" value={totalCollateral != null ? formatPrice(totalCollateral) : "—"} />
            <Mini label="Est. yield" value="—" tone="up" />
            <Mini label="W. APY" value="—" tone="up" />
            <Mini label="Positions" value="0" />
          </div>
          <Link href="/terminal/earn" className="zeks-btn-primary mt-4">
            Browse yield
            <ArrowRight className="w-3 h-3" />
          </Link>
        </section>
      )
    }

    return (
      <section
        aria-label="Account summary"
        data-testid="portfolio-summary"
        className="zeks-surface-padded"
      >
        <header
          className="flex items-baseline justify-between gap-2 flex-wrap"
          data-portfolio-summary-head
        >
          <span className="zeks-label">Account Summary</span>
          <span className="zeks-meta">
            Robinhood Chain · Morpho · Chainlink
          </span>
        </header>

        <div className="mt-3">
          <div
            className={
              "zeks-num-xl " +
              (netValue == null
                ? "text-foreground/40"
                : netValue >= 0
                  ? "text-foreground"
                  : "text-down")
            }
            data-testid="portfolio-equity"
          >
            {netValue != null ? formatPrice(netValue) : "—"}
          </div>
          <p className="mt-2 zeks-meta">
            {loading
              ? "Refreshing…"
              : hasPositions
                ? "Live"
                : "No active positions"}
          </p>
        </div>

        <div
          className="mt-5 pt-4 border-t border-border grid grid-cols-3 md:grid-cols-6 gap-3"
          data-portfolio-summary-metrics
        >
          <Mini
            label="Supplied"
            value={totalSupplied != null ? formatPrice(totalSupplied) : "—"}
            tone="up"
          />
          <Mini
            label="Borrowed"
            value={totalBorrowed != null ? formatPrice(totalBorrowed) : "—"}
            tone="down"
          />
          <Mini
            label="Collateral"
            value={totalCollateral != null ? formatPrice(totalCollateral) : "—"}
          />
          <Mini
            label="Est. yield"
            value={
              estYieldDaily != null ? `${formatPrice(estYieldDaily)}/day` : "—"
            }
            tone="up"
          />
          <Mini
            label="W. APY"
            value={apy != null ? formatApy(apy * 100) : "—"}
            tone="up"
          />
          <Mini
            label="Positions"
            value={positionCount > 0 ? String(positionCount) : "—"}
          />
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="Account summary"
      data-testid="portfolio-summary"
      className="zeks-surface-padded"
    >
      <header
        className="flex items-baseline justify-between gap-2 flex-wrap"
        data-portfolio-summary-head
      >
        <span className="zeks-label">Account Summary</span>
        <span className="zeks-meta">Robinhood Chain · Morpho · Chainlink</span>
      </header>

      <div className="mt-3 zeks-num-xl text-foreground/40">—</div>
      <p className="mt-2 zeks-meta">
        {dataUnavailable
          ? "Connect your wallet to view your portfolio."
          : "Loading…"}
      </p>
    </section>
  )
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  const color =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : "text-foreground"
  return (
    <div className="border-l border-border pl-3" data-portfolio-summary-cell>
      <div className="zeks-metric-label">{label}</div>
      <div className={`tabular-nums font-sans font-semibold text-[14px] md:text-[16px] mt-1 ${color}`}>
        {value}
      </div>
    </div>
  )
}
