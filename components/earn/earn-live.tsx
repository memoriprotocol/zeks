"use client"

/**
 * EarnLive — UI-5 visual rebuild.
 *
 *   • Compact Earn header (eyebrow · title · subtitle · supply status pill)
 *   • Featured market hero (highest APY by sort) — clean two-row layout
 *   • 4-cell aggregate stats strip (Markets · Total TVL · Liquidity · Avg APY)
 *   • Filter chips + search toolbar (terminal 34px)
 *   • Dense opportunity list — 4 columns aligned with header
 *   • Honest empty / unavailable / stale banners (existing state machine)
 *
 * Architecture and data flow are LOCKED. Only the visual presentation
 * was tuned in this pass:
 *   – removed redundant "Highest APY" tag (the hero IS the highest APY)
 *   – removed redundant chain metadata in the section header
 *   – removed redundant footer summary line
 *   – tightened hero row 1 padding and stat label sizing
 *
 * F12 / F14 / F15 / lifecycle / readiness / real-only / curated /
 * supported-asset-registry: untouched.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatUtilization,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import {
  filterToSupportedEarnMarkets,
} from "@/lib/markets/lending/supported"
import { useEarnLendingMarkets } from "./use-lending-markets"
import { LifecycleChip, lifecycleOf } from "./lifecycle-chip"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

type EarnFilter = "all" | "highest-apy" | "highest-liquidity" | "lowest-utilization"

const FILTER_LABELS: Record<EarnFilter, string> = {
  all: "All",
  "highest-apy": "Highest APY",
  "highest-liquidity": "Highest Liquidity",
  "lowest-utilization": "Lowest Utilization",
}

type EarnSort = "apy-desc" | "liquidity-desc" | "utilization-asc"

interface EarnLiveProps {
  initialMarkets: LendingMarket[]
  initialFetchedAt: string
  initialError: string | null
  initialAmznUnavailableReason: string | null
}

export default function EarnLive({
  initialMarkets: _initialMarkets,
  initialFetchedAt: _initialFetchedAt,
  initialError: _initialError,
  initialAmznUnavailableReason: _initialAmznUnavailableReason,
}: EarnLiveProps) {
  const {
    markets: allMarkets,
    loading,
    errorMessage,
    fetchedAt,
    amznUnavailableReason,
    refresh,
  } = useEarnLendingMarkets(
    _initialMarkets,
    _initialAmznUnavailableReason,
    _initialError,
  )
  const [filter, setFilter] = React.useState<EarnFilter>("all")
  const [query, setQuery] = React.useState("")
  // Defer locale-dependent time formatting until after hydration so the
  // server-rendered string (UTC) and the client-rendered string
  // (browser locale) cannot disagree. SSR renders a deterministic
  // placeholder; the real time is rendered on the client.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Filter once to the supported 8 Robinhood Stock Token tickers.
  // Comparison is normalized (trim + upper) — never consults logoUrl.
  const supportedRows = React.useMemo(
    () => filterToSupportedEarnMarkets(allMarkets),
    [allMarkets],
  )

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
    <div
      className="zeks-page"
      data-earn-live
      style={
        {
          ["--content-max"]: "1600px",
          gap: "16px",
        } as React.CSSProperties
      }
    >
      {/* Page heading — eyebrow · title · subtitle · supply status */}
      <header
        className="zeks-page-title-row"
        style={{ alignItems: "flex-end", gap: "16px", rowGap: "10px" }}
      >
        <div
          className="zeks-block"
          style={{ gap: "6px", minWidth: 0, flex: "1 1 auto" }}
        >
          <span
            className="zeks-label"
            style={{ color: "var(--muted-foreground)" }}
          >
            Earn
          </span>
          <h1
            className="zeks-display"
            style={{
              fontSize: "26px",
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            Earn yield
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted-foreground)",
              maxWidth: "60ch",
              lineHeight: 1.5,
              letterSpacing: "-0.005em",
            }}
          >
            Supply tokenized assets to Morpho markets on Robinhood Chain
            and earn variable APY.
          </p>
        </div>
        <span
          className="zeks-eyebrow uppercase inline-flex items-center shrink-0"
          aria-label={
            protocolReady ? "Supply available" : "Supply unavailable"
          }
          data-earn-supply-status={protocolReady ? "available" : "unavailable"}
          style={{
            gap: "6px",
            fontSize: "10px",
            letterSpacing: "0.08em",
            padding: "4px 9px",
            border: `1px solid ${
              protocolReady ? "var(--up)" : "var(--border-strong)"
            }`,
            borderRadius: "3px",
            color: protocolReady ? "var(--up)" : "var(--muted-foreground)",
            backgroundColor: "transparent",
            lineHeight: 1.3,
            marginBottom: "4px",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: protocolReady
                ? "var(--up)"
                : "var(--muted-foreground)",
            }}
          />
          Supply {protocolReady ? "available" : "unavailable"}
        </span>
      </header>

      {/* Hero: featured opportunity */}
      {featured ? <EarnHero market={featured} /> : null}

      {/* Aggregate stats — equal columns, tabular numerals, no card chrome. */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-px border border-border rounded-[8px] overflow-hidden"
        style={{ backgroundColor: "var(--border)" }}
        data-earn-stats
      >
        <Stat label="Markets" value={String(rows.length)} />
        <Stat label="Total TVL" value={formatPrice(totalTvl)} />
        <Stat label="Total Liquidity" value={formatPrice(totalLiquidity)} />
        <Stat
          label="Avg Supply APY"
          value={formatApy(avgApy)}
          tone="up"
        />
      </div>

      {/* Filter / search toolbar — segmented control + search, terminal 34px */}
      <div
        className="zeks-toolbar"
        style={{ gap: "10px", alignItems: "stretch" }}
        data-earn-toolbar
      >
        <div
          className="zeks-segment"
          role="group"
          aria-label="Filter opportunities"
          style={{
            height: "34px",
            borderRadius: "6px",
          }}
        >
          {(Object.keys(FILTER_LABELS) as EarnFilter[]).map((key) => {
            const active = key === filter
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                data-earn-filter={key}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "12px",
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                  padding: "0 13px",
                  height: "100%",
                }}
              >
                {FILTER_LABELS[key]}
              </button>
            )
          })}
        </div>
        <label
          className="zeks-search zeks-toolbar-search"
          style={{ height: "34px" }}
        >
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
            style={{ fontSize: "12.5px" }}
          />
        </label>
      </div>

      {errorMessage && rows.length > 0 ? (
        <div
          className="font-medium px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          style={{ fontSize: "11.5px" }}
        >
          Live data unavailable · showing last known state
        </div>
      ) : null}
      {errorMessage && rows.length === 0 ? (
        <div
          className="font-medium px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          style={{ fontSize: "11.5px" }}
        >
          Live data unavailable
        </div>
      ) : null}
      {amznUnavailableReason && !errorMessage ? (
        <div
          className="font-medium px-3 py-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 text-amber-700/90 dark:text-amber-300/90"
          style={{ fontSize: "11.5px" }}
          data-earn-amzn-banner
        >
          AMZN market is temporarily unavailable for Earn. Other
          opportunities below are unaffected.
        </div>
      ) : null}

      <section
        className="rounded-[10px] border border-border overflow-hidden bg-card-soft"
        data-earn-grid
      >
        {/* Section header — Opportunities label + live count. No duplicate
           chain metadata here (it already lives in the global ticker). */}
        <div
          className="zeks-section-header"
          style={{
            padding: "8px 14px",
            borderBottomWidth: 1,
            backgroundColor: "var(--card-soft)",
            minHeight: "32px",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="zeks-eyebrow uppercase"
              style={{
                fontSize: "10px",
                letterSpacing: "0.1em",
                color: "var(--foreground)",
                fontWeight: 500,
              }}
            >
              Opportunities
            </span>
            <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>·</span>
            <span
              className="tabular-nums font-sans"
              style={{
                fontSize: "10.5px",
                letterSpacing: "0.04em",
                color: "var(--muted-foreground)",
                fontWeight: 400,
              }}
            >
              {rows.length} live
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="zeks-eyebrow uppercase inline-flex items-center shrink-0 transition-colors"
              aria-label="Refresh earn opportunities"
              data-earn-refresh
              style={{
                gap: "6px",
                fontSize: "10px",
                letterSpacing: "0.08em",
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: "3px",
                color: "var(--muted-foreground)",
                backgroundColor: "transparent",
                lineHeight: 1.3,
                fontWeight: 500,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">↻</span>
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Column header row — terminal caps, dense, aligned numeric columns */}
        <div
          className="grid items-center border-b border-border"
          style={{
            gridTemplateColumns:
              "minmax(0,2fr) minmax(0,0.85fr) minmax(0,0.95fr) minmax(0,0.6fr)",
            padding: "0 14px",
            height: "30px",
            columnGap: "16px",
            backgroundColor: "var(--background)",
          }}
          data-earn-cols
        >
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.12em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Market
          </span>
          <span
            className="zeks-eyebrow uppercase text-right tabular-nums"
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.12em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Supply APY
          </span>
          <span
            className="zeks-eyebrow uppercase text-right hidden md:inline tabular-nums"
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.12em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Liquidity
          </span>
          <span
            className="zeks-eyebrow uppercase text-right hidden md:inline tabular-nums"
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.12em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Util
          </span>
        </div>
        {rest.length === 0 ? (
          <p
            className="px-5 py-6 font-sans text-muted-foreground"
            style={{ fontSize: "12px" }}
          >
            {rows.length === 0
              ? "No opportunities match."
              : "Showing the top opportunity above."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rest.map((m) => (
              <OpportunityRow key={m.marketId} market={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function EarnHero({ market }: { market: LendingMarket }) {
  return (
    <article
      className="flex flex-col"
      style={{
        padding: "14px 16px 14px",
        borderRadius: "10px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
      }}
      data-earn-hero
    >
      {/* Row 1 · Identity — logo · ticker · lifecycle · company name */}
      <div
        className="flex items-center min-w-0"
        style={{ gap: "12px" }}
      >
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
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center min-w-0"
            style={{ gap: "10px" }}
          >
            <div
              className="truncate zeks-symbol"
              style={{
                fontSize: "18px",
                color: "var(--foreground)",
                lineHeight: 1.05,
              }}
            >
              {market.symbol}
            </div>
            {market.sourceMode !== "mock" ? (
              <LifecycleChip lifecycle={lifecycleOf(market)} compact />
            ) : null}
            <span
              className="truncate min-w-0 zeks-company"
              title={market.name ?? market.symbol}
            >
              {market.name ?? market.symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2 · Metrics — APY is primary, all others are tabular peers */}
      <div
        className="flex items-center justify-between flex-wrap"
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid var(--border)",
          columnGap: "26px",
          rowGap: "10px",
        }}
      >
        <div
          className="flex items-center flex-wrap"
          style={{ gap: "26px", minWidth: 0, flex: "1 1 auto" }}
        >
          <HeroStat
            label="Supply APY"
            value={formatApy(market.supplyApy)}
            tone="up"
            large
          />
          <span
            aria-hidden="true"
            style={{ width: 1, height: 28, background: "var(--border)" }}
          />
          <HeroStat label="TVL" value={formatPrice(market.totalSupply)} />
          <HeroStat label="Liquidity" value={formatPrice(market.availableLiquidity)} />
          <HeroStat label="Util" value={formatUtilization(market.utilization)} />
          <HeroStat label="LLTV" value={lltvLabel(market)} />
        </div>
        <div className="flex items-center" style={{ gap: "12px" }}>
          <Link
            href={`/terminal/earn/${encodeURIComponent(market.symbol)}`}
            className="font-medium transition-colors inline-flex items-center justify-center"
            data-earn-hero-explore
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "10.5px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              height: "28px",
              padding: "0 12px",
              borderRadius: "4px",
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              textDecoration: "none",
              lineHeight: 1,
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            Explore&nbsp;→
          </Link>
        </div>
      </div>
    </article>
  )
}

function HeroStat({
  label,
  value,
  tone,
  large,
}: {
  label: string
  value: string
  tone?: "up"
  large?: boolean
}) {
  return (
    <div
      className="min-w-0"
      data-earn-hero-stat={large ? "primary" : "secondary"}
    >
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "9.5px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          lineHeight: 1.2,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="truncate tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: large ? "24px" : "14px",
          lineHeight: 1.1,
          letterSpacing: large ? "-0.025em" : "-0.015em",
          color: tone === "up" ? "var(--up)" : "var(--foreground)",
          marginTop: large ? "3px" : "4px",
          fontWeight: large ? 500 : 450,
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function OpportunityRow({ market }: { market: LendingMarket }) {
  return (
    <li>
      <Link
        href={`/terminal/earn/${encodeURIComponent(market.symbol)}`}
        className="zeks-row-hover grid items-center"
        style={{
          gridTemplateColumns:
            "minmax(0,2fr) minmax(0,0.85fr) minmax(0,0.95fr) minmax(0,0.6fr)",
          padding: "0 14px",
          height: "48px",
          columnGap: "16px",
        }}
        data-earn-row
      >
        <div
          className="flex items-center min-w-0"
          style={{ gap: "11px" }}
        >
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
          <div className="min-w-0 flex-1">
            <div
              className="truncate flex items-center zeks-symbol"
              style={{
                fontSize: "16px",
                color: "var(--foreground)",
                lineHeight: 1.1,
                gap: "8px",
              }}
            >
              <span className="truncate">{market.symbol}</span>
              {market.sourceMode !== "mock" ? (
                <LifecycleChip
                  lifecycle={lifecycleOf(market)}
                  compact
                />
              ) : null}
            </div>
            <div
              className="truncate zeks-company"
              style={{
                marginTop: "3px",
                maxWidth: "38ch",
              }}
              title={market.name ?? market.symbol}
            >
              {market.name ?? market.symbol}
            </div>
          </div>
        </div>
        <span
          className="text-right tabular-nums truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "15px",
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: "var(--up)",
            fontWeight: 500,
          }}
        >
          {formatApy(market.supplyApy)}
        </span>
        <span
          className="hidden md:inline text-right tabular-nums truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
            color: "var(--foreground)",
            fontWeight: 450,
          }}
        >
          {formatPrice(market.availableLiquidity)}
        </span>
        <span
          className="hidden md:inline text-right tabular-nums truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
            color: "var(--muted-foreground)",
            fontWeight: 450,
          }}
        >
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
    <div
      className="tabular-nums"
      style={{
        backgroundColor: "var(--background)",
        padding: "8px 14px 10px",
      }}
      data-earn-stat
    >
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "9.5px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "17px",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          marginTop: "4px",
          color: tone === "up" ? "var(--up)" : "var(--foreground)",
          fontWeight: 500,
        }}
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
