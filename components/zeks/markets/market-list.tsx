"use client"

/**
 * MarketList — dense list of all markets.
 *
 *   · Single beige surface, no row borders
 *   · Divider only between rows (1px border-border)
 *   · Logo · symbol · company · price · LLTV · borrow · liquidity · status
 *   · Each cell hides individually when its source field is missing
 *
 *   No admin chrome. Read-only.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatCompact,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import type { StatusFilter } from "@/components/zeks/markets/markets-toolbar"

interface MarketListProps {
  markets: LendingMarket[]
  query: string
  status: StatusFilter
}

export function MarketList({ markets, query, status }: MarketListProps) {
  const filtered = React.useMemo<LendingMarket[]>(() => {
    const q = query.trim().toLowerCase()
    return markets.filter((m) => {
      if (status === "live" && m.sourceMode !== "real-morpho") return false
      if (
        status === "borrowable" &&
        (m.borrowApy == null || !(m.borrowApy > 0))
      )
        return false
      if (!q) return true
      const hay = `${m.symbol} ${m.name ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [markets, query, status])

  return (
    <div data-testid="market-list">
      <div
        className="rounded-[14px] border border-border overflow-hidden"
        style={{ backgroundColor: "var(--card-soft)" }}
      >
        {/* Column header */}
        <div
          className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] gap-3 px-4 py-2 border-b border-border font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase"
        >
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="text-right">LLTV</span>
          <span className="text-right">Borrow</span>
          <span className="text-right">Liquidity</span>
          <span className="text-right">Status</span>
          <span className="w-[80px]"></span>
        </div>

        {filtered.length === 0 ? (
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground/70 px-4 py-6">
            No markets match the current search or filter.
          </p>
        ) : (
          <ul>
            {filtered.map((m, idx) => (
              <li
                key={m.marketId ?? m.symbol}
                className={
                  idx === 0
                    ? ""
                    : "border-t border-border"
                }
              >
                <Row market={m} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="font-mono text-[10px] tracking-wide text-muted-foreground/60 px-0.5 mt-3">
        {filtered.length} / {markets.length} markets
      </p>
    </div>
  )
}

/* ── Single dense row ─────────────────────────────────────────── */

function Row({ market: m }: { market: LendingMarket }) {
  const hasPrice = m.oraclePrice != null
  const hasLltv = m.lltv != null
  const hasBorrow = m.borrowApy != null
  const liquidity = m.availableLiquidity ?? m.totalSupply ?? null
  const hasLiq = liquidity != null

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] gap-x-3 gap-y-1 items-center px-4 py-2.5"
      style={{ lineHeight: 1.4 }}
    >
      {/* Asset */}
      <Link
        href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
        className="flex items-center gap-2.5 min-w-0 hover:opacity-90"
      >
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={26}
        />
        <div className="min-w-0 flex-1">
          <div
            className="font-serif text-foreground truncate"
            style={{ fontSize: "15px", lineHeight: 1.1 }}
          >
            {m.symbol}
          </div>
          <div
            className="font-mono text-muted-foreground/70 truncate"
            style={{ fontSize: "10.5px", marginTop: "2px" }}
          >
            {m.name ?? m.symbol}
          </div>
        </div>
      </Link>

      {/* Price */}
      <div className="md:text-right">
        <span className="md:hidden font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase mr-2">
          Price
        </span>
        <span
          className="font-mono tabular-nums text-foreground"
          style={{ fontSize: "13px" }}
        >
          {hasPrice ? formatPrice(m.oraclePrice as number) : "—"}
        </span>
      </div>

      {/* LLTV */}
      <div className="md:text-right">
        <span className="md:hidden font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase mr-2">
          LLTV
        </span>
        <span
          className="font-mono tabular-nums text-foreground"
          style={{ fontSize: "13px" }}
        >
          {hasLltv
            ? `${((m.lltv as number) * 100).toFixed(1)}%`
            : "—"}
        </span>
      </div>

      {/* Borrow */}
      <div className="md:text-right">
        <span className="md:hidden font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase mr-2">
          Borrow
        </span>
        <span
          className={[
            "font-mono tabular-nums",
            hasBorrow ? "text-down" : "text-foreground",
          ].join(" ")}
          style={{ fontSize: "13px" }}
        >
          {hasBorrow ? formatApy(m.borrowApy as number) : "—"}
        </span>
      </div>

      {/* Liquidity */}
      <div className="md:text-right">
        <span className="md:hidden font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase mr-2">
          Liquidity
        </span>
        <span
          className="font-mono tabular-nums text-foreground"
          style={{ fontSize: "13px" }}
        >
          {hasLiq ? formatCompact(liquidity as number) : "—"}
        </span>
      </div>

      {/* Status — only meaningful markers */}
      <div className="md:text-right">
        <span className="md:hidden font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase mr-2">
          Status
        </span>
        <StatusBadge mode={m.sourceMode} live={m.status === "active"} />
      </div>

      {/* CTA — compact, no admin button */}
      <div className="md:w-[80px] md:text-right">
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          className="inline-flex items-center justify-center rounded-[8px] border border-border text-foreground h-7 px-2.5 text-[11px] hover:bg-secondary/60 transition-colors"
        >
          Open
        </Link>
      </div>
    </div>
  )
}

/* ── Status badge — only meaningful markers ──────────────────── */

function StatusBadge({
  mode,
  live,
}: {
  mode: LendingMarket["sourceMode"]
  live: boolean
}) {
  if (mode === "real-morpho" && live) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md font-mono text-[10px] tracking-wide border border-up/40 bg-up/10 text-up">
        <span className="w-1 h-1 rounded-full bg-up" />
        Live
      </span>
    )
  }
  if (mode === "real-morpho-unlisted") {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md font-mono text-[10px] tracking-wide border border-border bg-transparent text-muted-foreground">
        Unlisted
      </span>
    )
  }
  if (mode === "mock") {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md font-mono text-[10px] tracking-wide border border-border bg-transparent text-muted-foreground">
        Mock
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md font-mono text-[10px] tracking-wide border border-border bg-transparent text-muted-foreground">
      —
    </span>
  )
}
