"use client"

/**
 * BorrowLive (v4 — shared lending markets, full read-only view)
 *
 * UI shell preserved. Data layer is the shared `useLendingMarkets`
 * hook (5 s poll, shared with /terminal/earn → no duplicate
 * network traffic). Added: search, 3 sort modes, LLTV, oracle
 * availability, and market status filter.
 *
 * Read-only. No transactions, no approvals, no signing.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  formatPrice,
  formatApy,
  formatUtilization,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import { useLendingMarkets } from "@/components/earn/use-lending-markets"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

const PAGE_STEP = 12
const INITIAL_VISIBLE = 12

type BorrowFilter = "all" | "active" | "borrowable"
type BorrowSort = "borrow-apy-desc" | "liquidity-desc" | "utilization-asc"

const FILTER_LABELS: Record<BorrowFilter, string> = {
  all: "All",
  active: "Active",
  borrowable: "Borrowable",
}

const SORT_LABELS: Record<BorrowSort, string> = {
  "borrow-apy-desc": "Highest Borrow APY",
  "liquidity-desc": "Highest Liquidity",
  "utilization-asc": "Lowest Utilization",
}

interface BorrowLiveProps {
  initialMarkets: LendingMarket[]
  initialFetchedAt: string
  initialError: string | null
}

export default function BorrowLive({
  initialMarkets: _initialMarkets,
  initialFetchedAt: _initialFetchedAt,
  initialError: _initialError,
}: BorrowLiveProps) {
  const {
    markets: allMarkets,
    loading,
    errorMessage,
    fetchedAt,
    refresh,
  } = useLendingMarkets(_initialMarkets, _initialError)
  const [filter, setFilter] = React.useState<BorrowFilter>("borrowable")
  const [sort, setSort] = React.useState<BorrowSort>("borrow-apy-desc")
  const [query, setQuery] = React.useState("")
  const [visible, setVisible] = React.useState(INITIAL_VISIBLE)

  const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
  const protocolReady =
    contracts.morphoBlueAddress != null &&
    contracts.morphoBlueAddress !== "0x"

  const borrowable = allMarkets.filter((m) => m.borrowApy != null)
  const rows = React.useMemo(() => {
    let list = borrowable
    // filter
    if (filter === "active") {
      list = list.filter((m) => m.status === "active")
    } else if (filter === "borrowable") {
      list = list.filter((m) => m.borrowApy != null)
    }
    // search
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (m) =>
          m.symbol.toLowerCase().includes(q) ||
          (m.collateralAssetSymbol ?? "").toLowerCase().includes(q) ||
          (m.loanAssetSymbol ?? "").toLowerCase().includes(q),
      )
    }
    // sort (stable copy)
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "borrow-apy-desc":
          return (b.borrowApy ?? Number.NEGATIVE_INFINITY) - (a.borrowApy ?? Number.NEGATIVE_INFINITY)
        case "liquidity-desc":
          return (b.availableLiquidity ?? Number.NEGATIVE_INFINITY) - (a.availableLiquidity ?? Number.NEGATIVE_INFINITY)
        case "utilization-asc":
          return (a.utilization ?? Number.POSITIVE_INFINITY) - (b.utilization ?? Number.POSITIVE_INFINITY)
      }
    })
    return list
  }, [borrowable, filter, query, sort])

  // Reset visible when filter / search / sort changes.
  React.useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [filter, query, sort])

  const totalLiquidity = rows.reduce(
    (s, m) => s + (m.availableLiquidity ?? 0),
    0,
  )
  const avgApy = average(rows.map((m) => m.borrowApy))

  const shown = rows.slice(0, visible)
  const canLoadMore = rows.length > visible

  return (
    <div className="zeks-page" data-borrow-live>
      <header className="zeks-page-title-row" style={{ alignItems: "flex-start" }}>
        <div className="zeks-block" style={{ gap: "6px" }}>
          <span className="zeks-label">Borrow</span>
          <h1 className="zeks-display">
            Borrow against tokenized collateral
          </h1>
          <p
            style={{
              fontSize: "var(--font-body)",
              color: "var(--muted-foreground)",
              maxWidth: "52ch",
              marginTop: "2px",
              lineHeight: 1.5,
            }}
          >
            Live Morpho borrow markets on Robinhood Chain. Borrow against
            tokenized assets with variable APY.
          </p>
        </div>
        <span
          className={`zeks-chip ${protocolReady ? "" : "zeks-status-muted"}`}
        >
          <span
            aria-hidden="true"
            className="zeks-chip-dot"
            style={{ backgroundColor: protocolReady ? "var(--up)" : "var(--muted-foreground)" }}
          />
          Borrow {protocolReady ? "available" : "coming soon"}
        </span>
      </header>

      {/* Stat strip */}
      {rows.length > 0 ? (
        <div className="zeks-kpi-strip">
          <div>
            <span className="zeks-kpi-label">Markets</span>
            <span className="zeks-kpi-value">{rows.length}</span>
          </div>
          <div>
            <span className="zeks-kpi-label">Total Liquidity</span>
            <span className="zeks-kpi-value">{formatPrice(totalLiquidity)}</span>
          </div>
          <div>
            <span className="zeks-kpi-label">Avg Borrow APY</span>
            <span
              className="zeks-kpi-value"
              style={{ color: avgApy != null ? "var(--down)" : undefined }}
            >
              {formatApy(avgApy)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Filter / search / sort row */}
      <div className="zeks-toolbar mt-1">
        <div className="zeks-segment" role="group" aria-label="Filter borrow markets">
          {(Object.keys(FILTER_LABELS) as BorrowFilter[]).map((key) => {
            const active = key === filter
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                data-borrow-filter={key}
              >
                {FILTER_LABELS[key]}
              </button>
            )
          })}
        </div>
        <select
          aria-label="Sort borrow markets"
          value={sort}
          onChange={(e) => setSort(e.target.value as BorrowSort)}
          className="zeks-select"
        >
          {(Object.keys(SORT_LABELS) as BorrowSort[]).map((key) => (
            <option key={key} value={key}>
              Sort · {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <label className="zeks-search zeks-toolbar-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5 shrink-0"
            aria-hidden="true"
          >
            <circle cx={11} cy={11} r={7} />
            <line x1={20} y1={20} x2={16.65} y2={16.65} />
          </svg>
          <input
            type="text"
            placeholder="Search markets"
            aria-label="Search borrow markets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {errorMessage && rows.length === 0 ? (
        <div className="mt-4 text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable
        </div>
      ) : null}
      {errorMessage && rows.length > 0 ? (
        <div className="mt-4 text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable · showing last known state
        </div>
      ) : null}

      {/* Borrow list */}
      <section className="zeks-surface overflow-hidden" data-borrow-table>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] px-4 py-2 zeks-meta border-b border-border">
          <span>Market</span>
          <span className="text-right">Borrow APY</span>
          <span className="text-right hidden md:inline">Liquidity</span>
          <span className="text-right hidden md:inline">LLTV</span>
          <span className="text-right hidden md:inline">Status</span>
        </div>
        {loading && rows.length === 0 ? (
          <p className="px-5 py-6 text-[12px] font-mono text-muted-foreground">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-[12px] font-mono text-muted-foreground">
            No borrow markets match.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shown.map((m) => (
                <BorrowRow key={m.marketId} market={m} />
              ))}
            </ul>
            {canLoadMore ? (
              <div className="flex items-center justify-center px-4 py-3 border-t border-border bg-secondary/30">
                <button
                  type="button"
                  onClick={() =>
                    setVisible((n) => Math.min(rows.length, n + PAGE_STEP))
                  }
                  className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="borrow-load-more"
                >
                  Load more ↓
                </button>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60 ml-3">
                  {rows.length - visible} more
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>

      <div className="zeks-footer-nav">
        <span>Morpho · Robinhood Chain · {rows.length} markets</span>
        <span aria-hidden="true">·</span>
        <span>{loading ? "Refreshing…" : "Live"}</span>
        {fetchedAt ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{new Date(fetchedAt).toLocaleTimeString()}</span>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  )
}

function BorrowRow({ market }: { market: LendingMarket }) {
  const oracleLive =
    market.oracleSource === "chainlink" || market.oracleSource === "robinhood-rpc"
  const oracle =
    market.oracleSource === "unknown" || market.oracleSource == null
      ? "—"
      : market.oracleSource
  const statusLabel = market.status ?? "unknown"
  const statusTone =
    market.status === "active"
      ? "up"
      : market.status === "paused" || market.status === "delisted"
        ? "down"
        : "muted"
  return (
    <li>
      <Link
        href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-5 h-11 hover:bg-secondary/30 transition-colors"
      >
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-foreground truncate">
            {market.symbol}
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 truncate">
            {market.collateralAssetSymbol} → {market.loanAssetSymbol}
          </div>
        </div>
        <span className="zeks-num-cell text-down text-right">
          {market.borrowApy != null ? formatApy(market.borrowApy) : "—"}
        </span>
        <span className="hidden md:inline zeks-num-cell text-foreground text-right">
          {formatPrice(market.availableLiquidity)}
        </span>
        <span className="hidden md:inline zeks-num-cell text-foreground text-right">
          {lltvLabel(market)}
        </span>
        <span className="hidden md:flex items-center justify-end gap-1.5 text-[11px] font-mono">
          <MarketStatusBadge status={statusLabel} tone={statusTone} />
          {!oracleLive && oracle !== "—" ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
              oracle · {oracle}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function MarketStatusBadge({
  status,
  tone,
}: {
  status: string
  tone: "up" | "down" | "muted"
}) {
  const cls =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : "text-muted-foreground"
  return (
    <span className={cls} title={`status: ${status}`}>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className={
            "w-1.5 h-1.5 rounded-full " +
            (tone === "up"
              ? "bg-up"
              : tone === "down"
                ? "bg-down"
                : "bg-muted-foreground")
          }
        />
        {status}
      </span>
    </span>
  )
}

function lltvLabel(market: LendingMarket): string {
  const lltv = (market as unknown as { lltv?: number | null }).lltv
  if (lltv == null) return "—"
  return `${(lltv * 100).toFixed(1)}%`
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (finite.length === 0) return null
  return finite.reduce((s, v) => s + v, 0) / finite.length
}
