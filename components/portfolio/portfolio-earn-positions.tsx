"use client"

/**
 * PortfolioEarnPositions (v3)
 *
 * Compact earn-side card on the Portfolio page.
 *
 *   - Live → 3 inline KPIs (Deposited / W. Supply APY / Est. / day)
 *     + a compact row list of supplied positions.
 *   - Empty → compact 1-line hint, no giant card.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"
import { formatRawAmount } from "@/lib/markets/format-display"

interface PortfolioEarnPositionsProps {
  dataUnavailable: boolean
  snapshot?: PortfolioSnapshot | null
  loading?: boolean
}

export default function PortfolioEarnPositions({
  dataUnavailable,
  snapshot,
}: PortfolioEarnPositionsProps) {
  if (snapshot) {
    const supplied = snapshot.supplied
    const deposited = sumUsd(supplied)
    const apy = snapshot.weightedSupplyApy
    const earned =
      deposited != null && apy != null
        ? (deposited * (apy / 100)) / 365
        : null

    if (supplied.length === 0) {
      return (
        <Card title="EARN" subtitle="Morpho supply">
          <p className="text-[12px] font-mono text-muted-foreground">
            No supplied positions yet.{" "}
            <Link
              href="/terminal/earn"
              className="group inline-flex items-center gap-0.5 font-medium text-foreground hover:text-foreground/80"
            >
              Browse yield
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </p>
        </Card>
      )
    }

    return (
      <Card title="EARN" subtitle="Morpho supply">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="Deposited" value={formatPrice(deposited)} />
          <Stat
            label="W. APY"
            value={apy != null ? formatApy(apy * 100) : "—"}
            tone="up"
          />
          <Stat label="Est. / day" value={formatPrice(earned)} />
        </div>

        <ul className="rounded-md border border-border overflow-hidden divide-y divide-border">
          {supplied.map((s) => (
            <li
              key={s.marketId ?? s.symbol}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,90px)] items-center gap-3 px-3 h-10 text-[12px] font-mono"
            >
              <span className="text-foreground font-medium truncate">
                {s.symbol}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatRawAmount(s.balanceRaw, 18)}
              </span>
              <span className="text-up tabular-nums text-right">
                {s.supplyApy != null ? formatApy(s.supplyApy) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  return (
    <Card title="EARN" subtitle="Morpho supply">
      <p className="text-[12px] font-mono text-muted-foreground">
        {dataUnavailable
          ? "Connect your wallet to view earn positions."
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
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          {title}
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
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
  tone?: "up"
}) {
  return (
    <div className="border-l border-border pl-3">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[16px] mt-1 " +
          (tone === "up" ? "text-up" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}

function sumUsd(legs: { balanceUsd: number | null }[]): number | null {
  let sum = 0
  let any = false
  for (const l of legs) {
    if (l.balanceUsd != null) {
      sum += l.balanceUsd
      any = true
    }
  }
  return any ? sum : null
}
