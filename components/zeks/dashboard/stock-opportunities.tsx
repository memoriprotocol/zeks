"use client"

/**
 * StockOpportunities — curated 8-ticker grid with search + filter.
 *
 *   Spec list: AAPL · SPCX · TSLA · NVDA · GOOGL · AMZN · MSFT · META
 *
 *   Toolbar: search (flex-1) · one status select
 *   Grid:    3 columns on desktop
 *   Card:    logo (34) · symbol (17 serif) · company (11) ·
 *            price (28 serif) · LLTV · Borrow APY · Liquidity ·
 *            compact "Explore" CTA
 *
 *   Per spec: no extra badges. Fields without data are hidden.
 *   Read-only.
 *
 *   CTA: subtle lime outline/fill · compact (not full-width).
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

interface StockOpportunitiesProps {
  markets: LendingMarket[]
}

const PRIORITY: readonly string[] = [
  "AAPL",
  "SPCX",
  "TSLA",
  "NVDA",
  "GOOGL",
  "AMZN",
  "MSFT",
  "META",
]

const PRIORITY_INDEX = new Map<string, number>(
  PRIORITY.map((s, i) => [s, i] as const),
)

type StatusFilter = "all" | "live" | "borrowable"

export function StockOpportunities({
  markets,
}: StockOpportunitiesProps) {
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<StatusFilter>("all")

  const priority = React.useMemo<LendingMarket[]>(() => {
    const bySymbol = new Map<string, LendingMarket>()
    for (const m of markets) bySymbol.set(m.symbol.toUpperCase(), m)
    return PRIORITY.map((sym) => bySymbol.get(sym))
      .filter((m): m is LendingMarket => Boolean(m))
      .sort(
        (a, b) =>
          (PRIORITY_INDEX.get(a.symbol.toUpperCase()) ?? 0) -
          (PRIORITY_INDEX.get(b.symbol.toUpperCase()) ?? 0),
      )
  }, [markets])

  const filtered = React.useMemo<LendingMarket[]>(() => {
    const q = query.trim().toLowerCase()
    return priority.filter((m) => {
      if (filter === "live" && m.sourceMode !== "real-morpho") return false
      if (
        filter === "borrowable" &&
        (m.borrowApy == null || !(m.borrowApy > 0))
      )
        return false
      if (!q) return true
      const hay = `${m.symbol} ${m.name ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [priority, query, filter])

  return (
    <div data-testid="section-stock-opportunities" className="flex flex-col gap-3">
      {/* Toolbar — search takes most width, filter on right */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <label className="relative flex-1 min-w-[240px]">
          <span className="sr-only">Search stocks</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search AAPL, TSLA, …"
            className="w-full h-9 rounded-[10px] border border-border bg-transparent pl-9 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40 transition-colors"
          />
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-[12px]"
          >
            ⌕
          </span>
        </label>

        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.currentTarget.value as StatusFilter)
          }
          aria-label="Filter by status"
          className="h-9 rounded-[10px] border border-border bg-transparent px-3 text-[12px] text-foreground outline-none focus:border-foreground/40 transition-colors"
        >
          <option value="all">All</option>
          <option value="live">Live</option>
          <option value="borrowable">Borrowable</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          hasAny={priority.length > 0}
          filtered={filtered.length}
          total={priority.length}
        />
      ) : (
        <ul
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          style={{ gap: "var(--dash-card-gap)" }}
        >
          {filtered.map((m) => (
            <li key={m.marketId ?? m.symbol}>
              <OpportunityCard market={m} />
            </li>
          ))}
        </ul>
      )}

      {/* Footnote · match count */}
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground/60 px-0.5">
        {filtered.length} / {priority.length} curated tickers ·{" "}
        {priority.length} / {PRIORITY.length} live
      </p>
    </div>
  )
}

/* ── Single card ─────────────────────────────────────────────── */

function OpportunityCard({ market: m }: { market: LendingMarket }) {
  const hasPrice = m.oraclePrice != null
  const hasLltv = m.lltv != null
  const hasBorrow = m.borrowApy != null
  const liquidity = m.availableLiquidity ?? m.totalSupply ?? null
  const hasLiq = liquidity != null

  return (
    <article
      className="rounded-[14px] border border-border flex flex-col h-full"
      style={{
        minHeight: "var(--dash-card-min-h)",
        padding: "var(--dash-card-pad)",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="opportunity-card"
    >
      {/* Header — logo · symbol · company */}
      <header className="flex items-center gap-3">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={34}
        />
        <div className="min-w-0 flex-1">
          <div
            className="font-serif text-foreground"
            style={{ fontSize: "17px", lineHeight: 1.1 }}
          >
            {m.symbol}
          </div>
          <div
            className="font-mono text-muted-foreground/70 truncate"
            style={{ fontSize: "11px", marginTop: "3px" }}
          >
            {m.name ?? m.symbol}
          </div>
        </div>
      </header>

      {/* Oracle price — only when present */}
      {hasPrice ? (
        <div className="mt-4">
          <div
            className="font-mono tracking-wide text-muted-foreground/70 uppercase"
            style={{ fontSize: "9px" }}
          >
            Oracle Price
          </div>
          <div
            className="font-serif tabular-nums leading-none tracking-tight text-foreground"
            style={{ fontSize: "28px", marginTop: "4px" }}
          >
            {formatPrice(m.oraclePrice as number)}
          </div>
        </div>
      ) : null}

      {/* Field strip — LLTV · Borrow APY · Liquidity (hide each if missing) */}
      <dl
        className="mt-4 grid grid-cols-3"
        style={{ columnGap: "12px" }}
      >
        {hasLltv ? (
          <Field
            label="LLTV"
            value={`${((m.lltv as number) * 100).toFixed(1)}%`}
          />
        ) : (
          <Field label="LLTV" value="—" muted />
        )}
        {hasBorrow ? (
          <Field
            label="Borrow"
            value={formatApy(m.borrowApy as number)}
            tone="down"
          />
        ) : (
          <Field label="Borrow" value="—" muted />
        )}
        {hasLiq ? (
          <Field label="Liquidity" value={formatCompact(liquidity as number)} />
        ) : (
          <Field label="Liquidity" value="—" muted />
        )}
      </dl>

      {/* CTA — compact, subtle lime outline/fill */}
      <div className="mt-auto pt-4">
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          className="inline-flex items-center justify-center rounded-[8px] border border-primary/40 bg-primary/15 text-foreground h-8 px-3.5 text-[12px] font-medium hover:bg-primary/25 transition-colors"
        >
          Explore →
        </Link>
      </div>
    </article>
  )
}

function Field({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: string
  tone?: "up" | "down"
  muted?: boolean
}) {
  const cls =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : muted
          ? "text-muted-foreground"
          : "text-foreground"
  return (
    <div>
      <dt
        className="font-mono tracking-wide text-muted-foreground/70 uppercase"
        style={{ fontSize: "9px" }}
      >
        {label}
      </dt>
      <dd
        className={[
          "font-mono tabular-nums",
          cls,
        ].join(" ")}
        style={{ fontSize: "13px", marginTop: "3px" }}
      >
        {value}
      </dd>
    </div>
  )
}

function EmptyState({
  hasAny,
  filtered,
  total,
}: {
  hasAny: boolean
  filtered: number
  total: number
}) {
  if (!hasAny) {
    return (
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground/70 px-0.5">
        None of the 8 curated tickers are currently live.
      </p>
    )
  }
  if (filtered === 0) {
    return (
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground/70 px-0.5">
        No curated tickers match the current filter.
      </p>
    )
  }
  return (
    <p className="font-mono text-[11px] tracking-wide text-muted-foreground/70 px-0.5">
      {filtered} / {total} curated tickers
    </p>
  )
}
