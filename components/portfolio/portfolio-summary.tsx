"use client"

/**
 * PortfolioSummary (v3 — Loopr-density)
 *
 *   - Single column on mobile, hero-sized on desktop.
 *   - Strong serif net-value headline.
 *   - 3-column key metrics inline (Supplied / Borrowed / Supply APY).
 *   - Subtle source pills (Morpho / Chainlink / Robinhood Chain).
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
    const netValue = snapshot.netValueUsd
    const positionCount =
      snapshot.supplied.length +
      snapshot.borrowed.length +
      snapshot.collateral.length
    const hasPositions = positionCount > 0
    const apy = snapshot.weightedSupplyApy

    return (
      <section
        aria-label="Account summary"
        data-testid="portfolio-summary"
        className="rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            NET VALUE
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourcePill label="Morpho" />
            <SourcePill label="Chainlink" />
            <SourcePill label="Robinhood Chain" />
          </div>
        </div>

        <div className="mt-3">
          <div
            className={
              "font-serif leading-none tabular-nums tracking-tight text-[44px] md:text-[56px] " +
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

          <p className="mt-2 text-[11px] font-mono tracking-wider text-muted-foreground/70">
            {loading
              ? "Refreshing…"
              : hasPositions
                ? "Live"
                : "No active positions"}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3">
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
            label="Supply APY"
            value={apy != null ? formatApy(apy * 100) : "—"}
            tone={apy != null ? "up" : undefined}
          />
        </div>

        {!hasPositions ? (
          <Link
            href="/terminal/earn"
            className="group mt-5 inline-flex items-center gap-1 h-8 px-3 rounded-md bg-ink text-ink-foreground text-[12px] font-medium"
          >
            Browse yield
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </section>
    )
  }

  return (
    <section
      aria-label="Account summary"
      data-testid="portfolio-summary"
      className="rounded-2xl border border-border bg-card p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          NET VALUE
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourcePill label="Morpho" />
          <SourcePill label="Chainlink" />
          <SourcePill label="Robinhood Chain" />
        </div>
      </div>

      <div className="mt-3 font-serif leading-none tabular-nums tracking-tight text-[44px] md:text-[56px] text-foreground/40">
        —
      </div>
      <p className="mt-2 text-[11px] font-mono tracking-wider text-muted-foreground/70">
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
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={`font-mono tabular-nums text-[16px] md:text-[18px] mt-1 ${color}`}
      >
        {value}
      </div>
    </div>
  )
}

function SourcePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 h-6 rounded-md bg-secondary/70 text-[10px] font-mono tracking-wider text-muted-foreground">
      {label}
    </span>
  )
}
