"use client"

/**
 * EarnLive (v3 — Loopr-density)
 *
 *   - Strong APY hero card with the highest-yield opportunity,
 *     accompanied by inline KPIs (TVL, Liquidity, Util, LLTV).
 *   - Dense, finance-app row list below the hero for the rest of
 *     the opportunities. No admin table feel.
 *   - Filter chips + search inline.
 *   - Empty / unavailable copy stays user-friendly.
 *
 * No transaction buttons. Status chip reads "Supply coming soon".
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatUtilization,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import {
  SUPPORTED_EARN_SYMBOLS,
  filterToSupportedEarnMarkets,
} from "@/lib/markets/lending/supported"
import { useLendingMarkets } from "./use-lending-markets"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

const PAGE_STEP = 12
const INITIAL_VISIBLE = 6

type EarnFilter = "all" | "highest-apy" | "highest-liquidity" | "lowest-utilization"

const FILTER_LABELS: Record<EarnFilter, string> = {
  all: "All",
  "highest-apy": "Highest APY",
  "highest-liquidity": "Highest Liquidity",
  "lowest-utilization": "Lowest Utilization",
}

type EarnSort = "apy-desc" | "liquidity-desc" | "utilization-asc"

interface ApiResponse {
  ok: boolean
  markets: LendingMarket[]
  failedSymbols: string[]
  fetchedAt: string
  message?: string
}

interface EarnLiveProps {
  initialMarkets: LendingMarket[]
  initialFetchedAt: string
  initialError: string | null
}

export default function EarnLive({
  initialMarkets: _initialMarkets,
  initialFetchedAt: _initialFetchedAt,
  initialError: _initialError,
}: EarnLiveProps) {
  const {
    markets: allMarkets,
    loading,
    errorMessage,
    fetchedAt,
    refresh,
  } = useLendingMarkets(_initialMarkets, _initialError)
  const [filter, setFilter] = React.useState<EarnFilter>("all")
  const [query, setQuery] = React.useState("")
  const [visible, setVisible] = React.useState(INITIAL_VISIBLE)

  // Filter once to the supported 8 Robinhood Stock Token tickers.
  // Comparison is normalized (trim + upper) — never consults logoUrl.
  // This memo runs before sort/search/hero so every downstream step
  // sees only the supported universe.
  const supportedRows = React.useMemo(
    () => filterToSupportedEarnMarkets(allMarkets),
    [allMarkets],
  )

  // If the user has paged out and a new market arrives, snap back.
  const totalRows = React.useMemo(
    () =>
      supportedRows.filter((m) =>
        query ? m.symbol.toLowerCase().includes(query.toLowerCase()) : true,
      ).length,
    [supportedRows, query],
  )
  React.useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [totalRows])

  const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
  const protocolReady =
    contracts.morphoBlueAddress != null &&
    contracts.morphoBlueAddress !== "0x"

  const rows = React.useMemo(() => {
    const sort = sortFor(filter)
    let list = supportedRows.filter((m) =>
      query ? m.symbol.toLowerCase().includes(query.toLowerCase()) : true,
    )
    list = [...list].sort((a, b) => compareFor(a, b, sort))
    return list
  }, [supportedRows, filter, query])

  const featured = rows[0]
  const rest = rows.slice(1)

  const totalTvl = rows.reduce((s, m) => s + (m.totalSupply ?? 0), 0)
  const totalLiquidity = rows.reduce(
    (s, m) => s + (m.availableLiquidity ?? 0),
    0,
  )
  const avgApy = average(rows.map((m) => m.supplyApy))

  return (
    <div className="zeks-page" data-earn-live>
      {/* Page heading — strong serif, no admin chrome */}
      <header className="zeks-page-title-row" style={{ alignItems: "flex-start" }}>
        <div className="zeks-block" style={{ gap: "6px" }}>
          <span className="zeks-label">Earn</span>
          <h1 className="zeks-display">
            Earn yield
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
            Supply tokenized assets to Morpho markets on Robinhood Chain
            and earn variable APY.
          </p>
        </div>
        <span
          className={`zeks-chip ${
            protocolReady ? "" : "zeks-status-muted"
          }`}
        >
          <span
            aria-hidden="true"
            className="zeks-chip-dot"
            style={{ backgroundColor: protocolReady ? "var(--up)" : "var(--muted-foreground)" }}
          />
          Supply {protocolReady ? "available" : "coming soon"}
        </span>
      </header>

      {/* Hero: featured opportunity */}
      {featured ? <EarnHero market={featured} /> : null}

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border mt-3">
        <Stat label="Markets" value={String(rows.length)} />
        <Stat label="Total TVL" value={formatPrice(totalTvl)} />
        <Stat label="Total Liquidity" value={formatPrice(totalLiquidity)} />
        <Stat
          label="Avg Supply APY"
          value={formatApy(avgApy)}
          tone="up"
        />
      </div>

      {/* Filter / search row */}
      <div className="zeks-toolbar mt-1">
        <div className="zeks-segment" role="group" aria-label="Filter opportunities">
          {(Object.keys(FILTER_LABELS) as EarnFilter[]).map((key) => {
            const active = key === filter
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                data-earn-filter={key}
              >
                {FILTER_LABELS[key]}
              </button>
            )
          })}
        </div>
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
            placeholder="Search assets"
            aria-label="Search earn opportunities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {errorMessage && rows.length > 0 ? (
        <div className="mt-4 text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable · showing last known state
        </div>
      ) : null}
      {errorMessage && rows.length === 0 ? (
        <div className="mt-4 text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable
        </div>
      ) : null}
      <section className="zeks-surface overflow-hidden" data-earn-grid>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] px-4 py-2 zeks-meta border-b border-border">
          <span>Market</span>
          <span className="text-right">Supply APY</span>
          <span className="text-right hidden md:inline">Liquidity</span>
          <span className="text-right hidden md:inline">Util</span>
        </div>
        {rest.length === 0 ? (
          <p className="px-5 py-6 text-[12px] font-mono text-muted-foreground">
            {rows.length === 0
              ? "No opportunities match."
              : "Showing the top opportunity above."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {rest.slice(0, visible).map((m) => (
                <OpportunityRow key={m.marketId} market={m} />
              ))}
            </ul>
            {rest.length > visible ? (
              <div className="flex items-center justify-center px-4 py-3 border-t border-border bg-secondary/30">
                <button
                  type="button"
                  onClick={() =>
                    setVisible((n) => Math.min(rest.length, n + PAGE_STEP))
                  }
                  className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="earn-load-more"
                >
                  Load more ↓
                </button>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60 ml-3">
                  {rest.length - visible} more
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>

      <div className="zeks-footer-nav">
        <span>Filter · {FILTER_LABELS[filter]} · Morpho</span>
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

function EarnHero({ market }: { market: LendingMarket }) {
  return (
    <section
      className="relative rounded-2xl border border-border bg-card overflow-hidden"
      data-earn-hero
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-0">
        <div className="p-5 md:p-6 relative">
          <span
            aria-hidden="true"
            className="absolute left-0 top-5 bottom-5 w-1 bg-primary"
          />
          <div className="pl-3">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              HIGHEST SUPPLY APY
            </span>
            <div className="flex items-center gap-3 mt-2">
              <AssetLogo
                symbol={market.symbol}
                name={market.name}
                src={market.logoUrl ?? undefined}
                rhLogoUrl={market.rhLogoUrl ?? undefined}
                contractAddress={
                  market.contractAddress ??
                  market.rhContractAddress ??
                  market.collateralTokenAddress ??
                  undefined
                }
                size={32}
              />
              <span className="font-serif text-[28px] md:text-[32px] leading-none tracking-tight text-foreground">
                {market.symbol}
              </span>
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
                {market.collateralAssetSymbol} collateral
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-4">
              <span
                className="zeks-num-xl text-up"
                data-earn-hero-apy
              >
                {formatApy(market.supplyApy)}
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
                  7-DAY
                </span>
                <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
                  EST
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-ink-foreground text-[12px] font-medium opacity-60 cursor-not-allowed"
                title="Supply coming soon"
              >
                Supply
              </button>
              <Link
                href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
                className="group inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-secondary/60"
              >
                View market
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-border bg-secondary/30 p-5 md:p-6 grid grid-cols-2 gap-x-4 gap-y-4 content-center">
          <Kpi label="TVL" value={formatPrice(market.totalSupply)} />
          <Kpi label="Liquidity" value={formatPrice(market.availableLiquidity)} />
          <Kpi label="Utilization" value={formatUtilization(market.utilization)} />
          <Kpi label="LLTV" value={lltvLabel(market)} />
        </div>
      </div>
    </section>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="zeks-label">{label}</div>
      <div className="zeks-num-price text-foreground mt-1">
        {value}
      </div>
    </div>
  )
}

function OpportunityRow({ market }: { market: LendingMarket }) {
  return (
    <li>
      <Link
        href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-5 h-12 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AssetLogo
            symbol={market.symbol}
            name={market.name}
            src={market.logoUrl ?? undefined}
            rhLogoUrl={market.rhLogoUrl ?? undefined}
            contractAddress={
              market.contractAddress ??
              market.rhContractAddress ??
              market.collateralTokenAddress ??
              undefined
            }
            size={22}
          />
          <div className="min-w-0">
            <div className="zeks-display-sm truncate">
              {market.symbol}
            </div>
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 truncate">
            {market.collateralAssetSymbol} collateral
          </div>
          </div>
        </div>
        <span className="zeks-num-cell text-up text-right">
          {formatApy(market.supplyApy)}
        </span>
        <span className="hidden md:inline zeks-num-cell text-foreground text-right">
          {formatPrice(market.availableLiquidity)}
        </span>
        <span className="hidden md:inline zeks-num-cell text-muted-foreground text-right">
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
  tone?: "up"
}) {
  return (
    <div className="bg-card p-3.5">
      <div className="zeks-label">{label}</div>
      <div
        className={
          "zeks-num-md mt-1 " +
          (tone === "up" ? "text-up" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}

function compareFor(a: LendingMarket, b: LendingMarket, sort: EarnSort): number {
  switch (sort) {
    case "apy-desc":
      return (b.supplyApy ?? Number.NEGATIVE_INFINITY) - (a.supplyApy ?? Number.NEGATIVE_INFINITY)
    case "liquidity-desc":
      return (b.availableLiquidity ?? Number.NEGATIVE_INFINITY) - (a.availableLiquidity ?? Number.NEGATIVE_INFINITY)
    case "utilization-asc":
      return (a.utilization ?? Number.POSITIVE_INFINITY) - (b.utilization ?? Number.POSITIVE_INFINITY)
  }
}

function sortFor(filter: EarnFilter): EarnSort {
  switch (filter) {
    case "highest-apy":
      return "apy-desc"
    case "highest-liquidity":
      return "liquidity-desc"
    case "lowest-utilization":
      return "utilization-asc"
    case "all":
    default:
      return "apy-desc"
  }
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
