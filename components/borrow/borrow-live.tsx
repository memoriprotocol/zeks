"use client"

/**
 * BorrowLive (v3 — Loopr-density)
 *
 * Compact borrowing surface. Single dense header card + 2-stat strip
 * + dense borrow row list.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  formatPrice,
  formatApy,
  formatUtilization,
} from "@/lib/markets/format"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import type { LendingMarket } from "@/lib/markets/lending"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

const POLL_INTERVAL_MS = 60_000

export default function BorrowLive() {
  const [markets, setMarkets] = React.useState<LendingMarket[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchLendingMarkets(undefined, { debug: false })
      if (r.kind === "error") {
        setError(r.message)
        setMarkets([])
      } else {
        setMarkets(r.payload.markets)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const borrowable = markets.filter((m) => m.borrowApy != null)
  const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
  const protocolReady =
    contracts.morphoBlueAddress != null &&
    contracts.morphoBlueAddress !== "0x"

  const avgApy = average(borrowable.map((m) => m.borrowApy))
  const totalLiquidity = borrowable.reduce(
    (s, m) => s + (m.availableLiquidity ?? 0),
    0,
  )

  return (
    <div className="w-full max-w-[1080px] mx-auto" data-borrow-live>
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            BORROW
          </span>
          <h1 className="font-serif text-3xl md:text-[34px] leading-[1.1] tracking-tight text-foreground mt-1.5">
            Borrow against tokenized collateral
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Live Morpho borrow markets on Robinhood Chain. Borrow against
            tokenized assets with variable APY.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium ${
            protocolReady
              ? "bg-primary/15 text-foreground"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={
              "w-1.5 h-1.5 rounded-full " +
              (protocolReady ? "bg-primary" : "bg-amber-500")
            }
          />
          Borrow {protocolReady ? "available" : "coming soon"}
        </span>
      </div>

      {error ? (
        <div className="text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable
        </div>
      ) : null}

      {/* Stat strip */}
      {borrowable.length > 0 ? (
        <div className="grid grid-cols-3 gap-px bg-border border border-border rounded-xl overflow-hidden">
          <Stat label="Markets" value={String(borrowable.length)} />
          <Stat label="Total Liquidity" value={formatPrice(totalLiquidity)} />
          <Stat label="Avg Borrow APY" value={formatApy(avgApy)} tone="down" />
        </div>
      ) : null}

      {/* Borrow list */}
      <section className="mt-4 rounded-2xl border border-border bg-card overflow-hidden" data-borrow-table>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] px-5 py-2 text-[10px] font-mono tracking-wider text-muted-foreground/70 border-b border-border">
          <span>Market</span>
          <span className="text-right">Borrow APY</span>
          <span className="text-right hidden md:inline">Liquidity</span>
          <span className="text-right hidden md:inline">Util</span>
        </div>
        {loading && borrowable.length === 0 ? (
          <p className="px-5 py-6 text-[12px] font-mono text-muted-foreground">
            Loading…
          </p>
        ) : borrowable.length === 0 ? (
          <p className="px-5 py-6 text-[12px] font-mono text-muted-foreground">
            No borrow markets available.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {borrowable.map((m) => (
              <BorrowRow key={m.marketId} market={m} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-[10px] font-mono tracking-wider text-muted-foreground/60">
        Morpho · Robinhood Chain · {borrowable.length} markets
      </p>
    </div>
  )
}

function BorrowRow({ market }: { market: LendingMarket }) {
  return (
    <li>
      <Link
        href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-5 h-11 hover:bg-secondary/30 transition-colors"
      >
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-foreground truncate">
            {market.symbol}
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 truncate">
            {market.collateralAssetSymbol} → {market.loanAssetSymbol}
          </div>
        </div>
        <span className="font-mono tabular-nums text-down text-right text-[14px]">
          {market.borrowApy != null ? formatApy(market.borrowApy) : "—"}
        </span>
        <span className="hidden md:inline font-mono tabular-nums text-foreground text-right text-[12px]">
          {formatPrice(market.availableLiquidity)}
        </span>
        <span className="hidden md:inline font-mono tabular-nums text-muted-foreground text-right text-[12px]">
          {formatUtilization(market.utilization)}
        </span>
      </Link>
    </li>
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
    <div className="bg-card p-3.5">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[18px] mt-1 " +
          (tone === "down" ? "text-down" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (finite.length === 0) return null
  return finite.reduce((s, v) => s + v, 0) / finite.length
}
