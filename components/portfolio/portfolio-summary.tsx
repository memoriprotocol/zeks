"use client"

/**
 * PortfolioSummary (visual polish — shared ZEKS surface tokens)
 *
 *   - Single hero card using shared `.zeks-surface-padded`.
 *   - Row 1: label + source pills.
 *   - Row 2: net value headline.
 *   - Row 3: 6-metric bar with dividers instead of nested cards.
 *
 * Empty state: a single line, not a giant card.
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

    return (
      <section
        aria-label="Account summary"
        data-testid="portfolio-summary"
        className="zeks-surface-padded"
      >
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="zeks-label">Account Summary</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourcePill label="Morpho" />
            <SourcePill label="Chainlink" />
            <SourcePill label="Robinhood Chain" />
          </div>
        </div>

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

        <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 md:grid-cols-6 gap-3">
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

        {!hasPositions ? (
          <Link href="/terminal/earn" className="zeks-btn-primary mt-5">
            Browse yield
            <ArrowRight className="w-3 h-3" />
          </Link>
        ) : null}
      </section>
    )
  }

  return (
    <section
      aria-label="Account summary"
      data-testid="portfolio-summary"
      className="zeks-surface-padded"
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="zeks-label">Account Summary</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourcePill label="Morpho" />
          <SourcePill label="Chainlink" />
          <SourcePill label="Robinhood Chain" />
        </div>
      </div>

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
    <div className="border-l border-border pl-3">
      <div className="zeks-metric-label">{label}</div>
      <div
        className={`font-mono tabular-nums text-[14px] md:text-[16px] mt-1 ${color}`}
      >
        {value}
      </div>
    </div>
  )
}

function SourcePill({ label }: { label: string }) {
  return (
    <span className="zeks-pill">{label}</span>
  )
}
