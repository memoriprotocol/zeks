"use client"

/**
 * MarketCapacity — 3-stat block (TOTAL LIQUIDITY · ACTIVE MARKETS
 * · AVG BORROW COST).
 *
 * Read-only. Numbers come from the existing live markets payload.
 */

import * as React from "react"
import {
  formatCompact,
  formatApy,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface MarketCapacityProps {
  markets: LendingMarket[]
  fetchedAt: string | null
}

export default function MarketCapacity({
  markets,
  fetchedAt,
}: MarketCapacityProps) {
  const live = React.useMemo(
    () =>
      markets.filter(
        (m) =>
          (m.sourceMode === "real-morpho" ||
            m.sourceMode === "real-morpho-unlisted") &&
          (m.borrowApy ?? 0) > 0,
      ),
    [markets],
  )

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

  const avgBorrowApy = React.useMemo(() => {
    if (live.length === 0) return null
    let sum = 0
    let count = 0
    for (const m of live) {
      if (m.borrowApy != null && Number.isFinite(m.borrowApy)) {
        sum += m.borrowApy
        count += 1
      }
    }
    return count > 0 ? sum / count : null
  }, [live])

  return (
    <section
      aria-label="Market capacity"
      data-testid="overview-market-capacity"
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <header className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
            MARKET CAPACITY
          </span>
          <span className="text-[11px] text-muted-foreground">
            Live totals from Morpho
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
          {relative(fetchedAt)}
        </span>
      </header>

      <ul className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border-t border-border">
        <CapacityStat
          label="TOTAL LIQUIDITY"
          value={
            totalLiquidityUsd != null
              ? formatCompact(totalLiquidityUsd)
              : "—"
          }
          sub="USD · all Morpho markets"
          tone="up"
        />
        <CapacityStat
          label="ACTIVE MARKETS"
          value={live.length > 0 ? String(live.length) : "—"}
          sub={
            live.length > 0
              ? `of ${markets.length} markets live`
              : "no live markets"
          }
        />
        <CapacityStat
          label="AVG BORROW COST"
          value={avgBorrowApy != null ? formatApy(avgBorrowApy) : "—"}
          sub="mean borrow APY, live markets"
          tone="down"
        />
      </ul>
    </section>
  )
}

function CapacityStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "up" | "down"
}) {
  return (
    <li className="bg-card px-4 py-4">
      <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-serif tabular-nums leading-none tracking-tight mt-2 text-[34px] md:text-[40px] " +
          (tone === "up"
            ? "text-up"
            : tone === "down"
              ? "text-down"
              : "text-foreground")
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60 mt-2">
          {sub}
        </div>
      ) : null}
    </li>
  )
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
