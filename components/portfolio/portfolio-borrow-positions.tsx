"use client"

/**
 * PortfolioBorrowPositions (v3)
 *
 * Compact borrow-side card on the Portfolio page.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"
import { formatRawAmount } from "@/lib/markets/format-display"
import { PortfolioPositionLink } from "./portfolio-position-link"

interface PortfolioBorrowPositionsProps {
  dataUnavailable: boolean
  snapshot?: PortfolioSnapshot | null
  loading?: boolean
}

export default function PortfolioBorrowPositions({
  dataUnavailable,
  snapshot,
}: PortfolioBorrowPositionsProps) {
  if (snapshot) {
    const borrowed = snapshot.borrowed
    const collateral = snapshot.collateral
    const totalCollateral = snapshot.totalCollateralUsd
    const totalDebt = snapshot.totalBorrowedUsd
    const weighted = snapshot.weightedBorrowApy

    if (borrowed.length === 0 && collateral.length === 0) {
      return (
        <Card title="Borrow" subtitle="Morpho debt">
          <p className="zeks-secondary">
            No borrow positions.{" "}
            <Link
              href="/terminal/borrow"
              className="group inline-flex items-center gap-0.5 font-medium text-foreground hover:text-foreground/80"
            >
              Browse markets
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </p>
        </Card>
      )
    }

    return (
      <Card title="Borrow" subtitle="Morpho debt">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="Collateral" value={formatPrice(totalCollateral)} />
          <Stat label="Debt" value={formatPrice(totalDebt)} tone="down" />
          <Stat
            label="W. Borrow APY"
            value={weighted != null ? formatApy(weighted * 100) : "—"}
            tone="down"
          />
        </div>

        <ul className="rounded-md border border-border overflow-hidden divide-y divide-border">
          {collateral.map((c) => (
            <li
              key={`c-${c.marketId ?? c.symbol}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,80px)_minmax(0,90px)_minmax(0,auto)] items-center gap-3 px-3 h-10 text-[12px] font-sans"
            >
              <span className="text-foreground font-semibold truncate">
                {c.symbol}
              </span>
              <span className="zeks-eyebrow text-muted-foreground">collateral</span>
              <span className="text-foreground tabular-nums text-right">
                {c.balanceUsd != null ? formatPrice(c.balanceUsd) : formatRawAmount(c.balanceRaw, 18)}
              </span>
              <span className="text-right whitespace-nowrap">
                <PortfolioPositionLink kind="collateral" symbol={c.symbol} marketSymbol={c.collateralSymbol} short />
              </span>
            </li>
          ))}
          {borrowed.map((d) => (
            <li
              key={`d-${d.marketId ?? d.symbol}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,80px)_minmax(0,90px)_minmax(0,auto)] items-center gap-3 px-3 h-10 text-[12px] font-sans"
            >
              <span className="text-foreground font-semibold truncate">
                {d.symbol}
              </span>
              <span className="zeks-eyebrow text-down">debt</span>
              <span className="text-foreground tabular-nums text-right">
                {d.balanceUsd != null ? formatPrice(d.balanceUsd) : formatRawAmount(d.balanceRaw, 18)}
              </span>
              <span className="text-right whitespace-nowrap">
                <PortfolioPositionLink kind="borrowed" symbol={d.symbol} marketSymbol={d.collateralSymbol} short />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  return (
    <Card title="Borrow" subtitle="Morpho debt">
      <p className="zeks-secondary">
        {dataUnavailable
          ? "Connect your wallet to view borrow positions."
          : "Loading…"}
      </p>
    </Card>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      data-testid={`portfolio-${title.toLowerCase()}`}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <header className="px-5 md:px-6 py-3 border-b border-border flex items-baseline justify-between gap-2">
        <span className="zeks-eyebrow text-muted-foreground/80">
          {title}
        </span>
        <span className="zeks-eyebrow text-muted-foreground/70">
          {subtitle}
        </span>
      </header>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "down"
}) {
  return (
    <div className="border-l border-border pl-3">
      <div className="zeks-eyebrow text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "tabular-nums font-sans font-semibold text-[16px] mt-1 " +
          (tone === "down" ? "text-down" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}
