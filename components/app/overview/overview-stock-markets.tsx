"use client"

/**
 * StrategySignals — top opportunities ranked by composite signal:
 *
 *   1. positive yield spread   (best venue APY − borrow APY), desc
 *   2. borrow cost              asc   (cheaper borrow first)
 *   3. liquidity                desc  (deeper markets first)
 *
 * Rows missing any required field are hidden — fields are never
 * fabricated. The "best venue" label is the venue name that drove
 * the spread for that row.
 *
 * Read-only. No transactions.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import {
  formatApy,
  formatCompact,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface StrategySignalsProps {
  markets: LendingMarket[]
  yieldVenues: YieldVenue[]
}

const SIGNALS_LIMIT = 5

export default function StrategySignals({
  markets,
  yieldVenues,
}: StrategySignalsProps) {
  // Best venue APY across live venues — the venue a borrower would
  // route into for the spread calculation.
  const bestVenue = React.useMemo(() => {
    const live = yieldVenues
      .filter((v) => v.status === "live" && v.apy != null)
      .slice()
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))[0]
    return live ?? null
  }, [yieldVenues])

  const signals = React.useMemo(() => {
    if (!bestVenue) return []
    type Row = {
      market: LendingMarket
      spread: number
      venueName: string
      venueApy: number
      lltv: number
      liquidity: number
      status: LendingMarket["sourceMode"]
    }
    const rows: Row[] = []
    for (const m of markets) {
      if (m.borrowApy == null) continue
      const liq = m.availableLiquidity ?? m.totalSupply ?? null
      if (liq == null) continue
      if (m.lltv == null) continue
      rows.push({
        market: m,
        spread: (bestVenue.apy ?? 0) - m.borrowApy,
        venueName: bestVenue.name,
        venueApy: bestVenue.apy ?? 0,
        lltv: m.lltv,
        liquidity: liq,
        status: m.sourceMode,
      })
    }
    return rows
      .sort((a, b) => {
        // 1. higher spread first
        if (b.spread !== a.spread) return b.spread - a.spread
        // 2. lower borrow cost first
        const ab = a.market.borrowApy ?? Infinity
        const bb = b.market.borrowApy ?? Infinity
        if (ab !== bb) return ab - bb
        // 3. deeper liquidity first
        return b.liquidity - a.liquidity
      })
      .slice(0, SIGNALS_LIMIT)
  }, [markets, bestVenue])

  return (
    <section
      aria-label="Strategy signals"
      data-testid="overview-strategy-signals"
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <header className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
            STRATEGY SIGNALS
          </span>
          <span className="text-[11px] text-muted-foreground">
            Ranked by yield spread · borrow cost · liquidity
          </span>
        </div>
        {bestVenue ? (
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
            best venue{" "}
            <span className="text-foreground/80">{bestVenue.name}</span>{" "}
            {formatApy(bestVenue.apy)}
          </span>
        ) : null}
      </header>

      {signals.length === 0 ? (
        <p className="px-4 py-5 font-mono text-[11px] tracking-wider text-muted-foreground/70">
          No complete market snapshots — spread unavailable.
        </p>
      ) : (
        <ol>
          {signals.map((row, i) => (
            <li
              key={row.market.marketId ?? row.market.symbol}
              data-signal-row={i}
              className={
                "px-4 py-2.5 flex items-center gap-3 border-t border-border first:border-t-0 " +
                (i === 0 ? "bg-accent/30" : "")
              }
            >
              <span className="font-mono tabular-nums text-[10px] tracking-wider text-muted-foreground/60 w-4 text-right shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <AssetLogo
                symbol={row.market.symbol}
                name={row.market.name ?? row.market.symbol}
                src={row.market.logoUrl ?? undefined}
                size={22}
              />
              <Link
                href={`/terminal/markets/${encodeURIComponent(row.market.symbol)}`}
                className="font-serif text-[15px] leading-none text-foreground hover:text-foreground/80"
              >
                {row.market.symbol}
              </Link>

              <span className="ml-auto flex items-baseline gap-4 flex-wrap">
                <Signal
                  label="SPREAD"
                  value={formatApy(row.spread)}
                  tone={row.spread >= 0 ? "up" : "down"}
                />
                <Signal
                  label="BORROW"
                  value={formatApy(row.market.borrowApy)}
                  tone="down"
                />
                <Signal
                  label="LIQUIDITY"
                  value={formatCompact(row.liquidity)}
                  sub={row.status === "real-morpho" ? "live" : row.status === "real-morpho-unlisted" ? "unlisted" : "mock"}
                />
                <Signal
                  label="LLTV"
                  value={`${(row.lltv * 100).toFixed(1)}%`}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Signal({
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
    <span className="text-right">
      <span className="block font-mono text-[9px] tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <span
        className={
          "block font-mono tabular-nums text-[13px] " +
          (tone === "up"
            ? "text-up"
            : tone === "down"
              ? "text-down"
              : "text-foreground")
        }
      >
        {value}
      </span>
      {sub ? (
        <span className="block font-mono text-[9px] tracking-wider text-muted-foreground/50">
          {sub}
        </span>
      ) : null}
    </span>
  )
}
