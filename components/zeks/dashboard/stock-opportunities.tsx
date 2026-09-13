"use client"

/**
 * StockOpportunities — measured reference card system.
 *
 *   Grid: 3 columns on desktop · gap 16px
 *   Card:  unified geometry, always 4 sections:
 *
 *     1. Header    — logo + symbol + company + status
 *     2. Price     — large serif price with source-accurate label
 *                    ("ORACLE PRICE" → "REFERENCE PRICE" → "PRICE —")
 *     3. Stats     — LLTV · Borrow APY · Liquidity
 *     4. Footer    — strategy spread + Explore CTA (baseline pinned)
 *
 *   Curated symbols missing from Morpho (e.g. SPCX) are synthesized
 *   from the shared Robinhood quote map so they still appear with
 *   REFERENCE PRICE — not labeled "Oracle Price", never fabricated.
 *
 *   No big black blocks, no giant lime buttons, equal heights.
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
import type { MarketQuote } from "@/lib/markets/client"
import { resolveAsset } from "@/lib/assets/registry"

interface StockOpportunitiesProps {
  markets: LendingMarket[]
  /** Default venue APY for strategy spread. Null when no live venue. */
  venueApy: number | null
  /** Real Robinhood quotes keyed by symbol (curated 8). */
  curatedQuotes: Record<string, MarketQuote>
  /** Canonical curated symbols in display order. */
  curatedSymbols: readonly string[]
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

/** Build a stub LendingMarket for a curated symbol that has no Morpho
 *  data. The stub preserves the unified card geometry (header, price,
 *  stats, footer) and never fabricates oracle / Morpho values — every
 *  field except the curated reference price is null. */
function buildReferenceStub(
  symbol: string,
  quote: MarketQuote,
): LendingMarket {
  const upper = symbol.toUpperCase()
  const registry = resolveAsset(upper)
  return {
    marketId: null,
    symbol: upper,
    name: registry?.name ?? upper,
    logoUrl: null,
    oraclePrice: null,
    oracleSource: "none",
    supplyApy: null,
    borrowApy: null,
    totalSupply: null,
    totalBorrow: null,
    availableLiquidity: null,
    utilization: null,
    tvl: null,
    status: "unknown",
    protocolSource: "none",
    sourceMode: "curated-reference",
    listed: null,
    contractAddress: null,
    collateralAssetSymbol: upper,
    loanAssetSymbol: null,
    lltv: null,
    oracleAddress: null,
    irmAddress: null,
    loanTokenAddress: null,
    collateralTokenAddress: null,
    loanTokenDecimals: null,
    rhContractAddress: null,
    rhMultiplier: null,
    rhTokenDecimals: null,
    rhLogoUrl: null,
    referenceBid: quote.bid,
    referenceAsk: quote.ask,
    referencePrice: quote.referencePrice,
    referenceGeneratedAt: quote.generatedAt,
    referenceIsHalt: quote.isTradingHalt,
    chainId: 4663,
    fetchedAt: quote.generatedAt ?? new Date().toISOString(),
  }
}

function buildMissingStub(symbol: string): LendingMarket {
  const upper = symbol.toUpperCase()
  const registry = resolveAsset(upper)
  return {
    marketId: null,
    symbol: upper,
    name: registry?.name ?? upper,
    logoUrl: null,
    oraclePrice: null,
    oracleSource: "none",
    supplyApy: null,
    borrowApy: null,
    totalSupply: null,
    totalBorrow: null,
    availableLiquidity: null,
    utilization: null,
    tvl: null,
    status: "unknown",
    protocolSource: "none",
    sourceMode: "curated-reference",
    listed: null,
    contractAddress: null,
    collateralAssetSymbol: upper,
    loanAssetSymbol: null,
    lltv: null,
    oracleAddress: null,
    irmAddress: null,
    loanTokenAddress: null,
    collateralTokenAddress: null,
    loanTokenDecimals: null,
    rhContractAddress: null,
    rhMultiplier: null,
    rhTokenDecimals: null,
    rhLogoUrl: null,
    referenceBid: null,
    referenceAsk: null,
    referencePrice: null,
    referenceGeneratedAt: null,
    referenceIsHalt: false,
    chainId: 4663,
    fetchedAt: new Date().toISOString(),
  }
}

export function StockOpportunities({
  markets,
  venueApy,
  curatedQuotes,
  curatedSymbols,
}: StockOpportunitiesProps) {
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<StatusFilter>("all")

  const priority = React.useMemo<LendingMarket[]>(() => {
    const bySymbol = new Map<string, LendingMarket>()
    for (const m of markets) bySymbol.set(m.symbol.toUpperCase(), m)

    const out: LendingMarket[] = []
    const order = (curatedSymbols.length > 0
      ? Array.from(new Set(curatedSymbols)).map((s) => s.toUpperCase())
      : Array.from(PRIORITY)) as string[]
    const seen = new Set<string>()

    for (const sym of order) {
      const m = bySymbol.get(sym)
      if (m) {
        out.push(m)
      } else {
        const quote = curatedQuotes[sym]
        if (quote && quote.referencePrice != null) {
          out.push(buildReferenceStub(sym, quote))
        } else {
          out.push(buildMissingStub(sym))
        }
      }
      seen.add(sym)
    }
    // Sort back to PRIORITY (in case curatedSymbols order differs).
    return out
      .slice()
      .sort(
        (a, b) =>
          (PRIORITY_INDEX.get(a.symbol.toUpperCase()) ?? 0) -
          (PRIORITY_INDEX.get(b.symbol.toUpperCase()) ?? 0),
      )
  }, [markets, curatedQuotes, curatedSymbols])

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
      return `${m.symbol} ${m.name ?? ""}`.toLowerCase().includes(q)
    })
  }, [priority, query, filter])

  return (
    <div
      data-testid="section-stock-opportunities"
      className="flex flex-col"
      style={{ gap: "var(--dash-heading-gap)" }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <label className="relative flex-1 min-w-[220px]">
          <span className="sr-only">Search stocks</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search AAPL, TSLA, …"
            className="w-full rounded-md border outline-none"
            style={{
              padding: "10px 12px 10px 32px",
              fontSize: "var(--font-body)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              background: "var(--background)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--foreground)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <span
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              fontSize: "13px",
              color: "var(--muted-foreground)",
            }}
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
          className="rounded-md border outline-none cursor-pointer font-mono uppercase"
          style={{
            padding: "8px 12px",
            fontSize: "12px",
            letterSpacing: "0.04em",
            borderColor: "var(--border)",
            color: "var(--foreground)",
            background: "var(--background)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--foreground)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <option value="all">All</option>
          <option value="live">Live</option>
          <option value="borrowable">Borrowable</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState hasAny={priority.length > 0} />
      ) : (
        <ul
          className="grid"
          style={{
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--dash-card-gap)",
          }}
          data-testid="stock-grid"
        >
          {filtered.map((m) => (
            <li
              key={`${m.symbol}-${m.marketId ?? "stub"}`}
              className="h-full"
            >
              <OpportunityCard market={m} venueApy={venueApy} />
            </li>
          ))}
        </ul>
      )}

      {/* Footnote */}
      <p
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          paddingTop: "4px",
        }}
      >
        {filtered.length} / {priority.length} curated tickers
        {priority.length < PRIORITY.length
          ? ` · ${priority.length} of ${PRIORITY.length} live`
          : ""}
      </p>
    </div>
  )
}

/* ── Single card ─────────────────────────────────────── */

/**
 * Resolve the price-block presentation:
 *   1. Valid Chainlink oracle   → "ORACLE PRICE"
 *   2. Real Robinhood reference → "REFERENCE PRICE"  (NOT relabelled)
 *   3. Otherwise                → "PRICE" + "—"
 */
function resolvePriceBlock(m: LendingMarket): {
  label: string
  value: string
  source: string
} {
  if (m.oraclePrice != null && Number.isFinite(m.oraclePrice)) {
    return {
      label: "ORACLE PRICE",
      value: formatPrice(m.oraclePrice),
      source:
        m.oracleSource === "chainlink"
          ? "Chainlink oracle"
          : m.oracleSource === "robinhood-rpc"
            ? "Onchain oracle"
            : m.oracleSource === "mock"
              ? "Internal mock"
              : "Verified oracle",
    }
  }
  if (m.referencePrice != null && Number.isFinite(m.referencePrice)) {
    return {
      label: "REFERENCE PRICE",
      value: formatPrice(m.referencePrice),
      source: "Robinhood quote · No Chainlink oracle",
    }
  }
  return {
    label: "PRICE",
    value: "—",
    source: "No verified price source",
  }
}

function OpportunityCard({
  market: m,
  venueApy,
}: {
  market: LendingMarket
  venueApy: number | null
}) {
  const liquidity = m.availableLiquidity ?? m.totalSupply ?? null
  const spread =
    venueApy != null && m.borrowApy != null ? venueApy - m.borrowApy : null
  const price = resolvePriceBlock(m)
  const isCuratedOnly = m.sourceMode === "curated-reference"

  return (
    <article
      className="flex flex-col h-full transition-all duration-200"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: "var(--dash-card-min-h)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow =
          "0 4px 20px rgba(26,24,20,0.06)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ""
        e.currentTarget.style.boxShadow = ""
      }}
      data-testid="opportunity-card"
    >
      {/* 1 · Header — logo · symbol · company · status */}
      <header className="flex items-center gap-3">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          rhLogoUrl={m.rhLogoUrl ?? undefined}
          contractAddress={m.contractAddress ?? m.rhContractAddress ?? undefined}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "var(--font-card-symbol)",
                color: "var(--foreground)",
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
              }}
            >
              {m.symbol}
            </div>
            <StatusChip m={m} />
          </div>
          <div
            className="font-mono truncate"
            style={{
              fontSize: "var(--font-card-company)",
              color: "var(--muted-foreground)",
              marginTop: "4px",
              letterSpacing: "0.02em",
            }}
          >
            {m.name ?? m.symbol}
          </div>
        </div>
      </header>

      {/* 2 · Price block — always rendered so card geometry is identical */}
      <div
        style={{
          paddingTop: "14px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
          minHeight: "var(--dash-price-block-h, 64px)",
        }}
      >
        <div className="zeks-label" style={{ marginBottom: "2px" }}>
          {price.label}
        </div>
        <div
          className="zeks-num-lg"
          style={{
            color: "var(--foreground)",
          }}
        >
          {price.value}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: "10.5px",
            color: "var(--muted-foreground)",
            marginTop: "2px",
            letterSpacing: "0.02em",
            minHeight: "14px",
            lineHeight: 1.2,
          }}
        >
          {price.source}
        </div>
      </div>

      {/* 3 · Stat strip — same height across all cards */}
      <dl
        className="grid grid-cols-3"
        style={{
          columnGap: "8px",
          paddingTop: "12px",
          paddingBottom: spread != null || isCuratedOnly ? "12px" : "12px",
          borderBottom: "1px solid var(--border)",
          minHeight: "var(--dash-stats-block-h, 56px)",
        }}
      >
        <StatField
          label="LLTV"
          value={m.lltv != null ? `${(m.lltv * 100).toFixed(1)}%` : "—"}
        />
        <StatField
          label="Borrow APY"
          value={m.borrowApy != null ? formatApy(m.borrowApy) : "—"}
          tone="down"
        />
        <StatField
          label="Liquidity"
          value={liquidity != null ? formatCompact(liquidity) : "—"}
        />
      </dl>

      {/* 4 · Footer — strategy spread + CTA (baseline pinned) */}
      <div
        className="flex items-center justify-between"
        style={{
          marginTop: "auto",
          paddingTop: "14px",
          minHeight: "28px",
        }}
      >
        {spread != null ? (
          <span
            className="font-mono uppercase inline-flex items-baseline gap-1.5"
            style={{
              fontSize: "var(--font-micro)",
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              lineHeight: 1,
            }}
          >
            Spread
            <span
              className="tabular-nums"
              style={{
                color: spread >= 0 ? "var(--up)" : "var(--down)",
                fontSize: "12px",
                letterSpacing: "0",
              }}
            >
              {spread >= 0 ? "+" : ""}
              {spread.toFixed(2)}%
            </span>
          </span>
        ) : (
          <span
            className="font-mono uppercase inline-flex items-baseline gap-1.5"
            style={{
              fontSize: "var(--font-micro)",
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              lineHeight: 1,
            }}
          >
            <span>Spread</span>
            <span
              style={{
                color: "var(--muted-foreground)",
                fontSize: "12px",
                letterSpacing: "0",
                opacity: 0.6,
              }}
            >
              —
            </span>
          </span>
        )}
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          className="font-medium transition-colors inline-flex items-center justify-center"
          style={{
            fontSize: "12px",
            height: "24px",
            padding: "0 10px",
            borderRadius: "5px",
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
            textDecoration: "none",
            lineHeight: 1,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "rgba(183,243,74,0.85)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--primary)")
          }
        >
          Explore →
        </Link>
      </div>
    </article>
  )
}

/* ── Source chip ────────────────────────────────────── */

function StatusChip({ m }: { m: LendingMarket }) {
  const isLive = m.sourceMode === "real-morpho" || m.sourceMode === "live"
  const isUnlisted = m.sourceMode === "real-morpho-unlisted"
  const isCuratedOnly = m.sourceMode === "curated-reference"
  const label = isLive ? "LIVE" : isUnlisted ? "UNLISTED" : isCuratedOnly ? "QUOTE" : "MOCK"
  const color = isLive
    ? "var(--up)"
    : isUnlisted
      ? "var(--muted-foreground)"
      : isCuratedOnly
        ? "var(--muted-foreground)"
        : "var(--down)"
  return (
    <span
      className="font-mono uppercase inline-flex items-center gap-1 shrink-0"
      style={{
        fontSize: "9px",
        color,
        letterSpacing: "0.08em",
        opacity: 0.85,
        padding: "2px 5px",
        border: `1px solid ${color}`,
        borderRadius: "4px",
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={{ width: "4px", height: "4px", backgroundColor: color }}
      />
      {label}
    </span>
  )
}

/* ── Stat field ─────────────────────────────────────── */

function StatField({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  const color =
    tone === "up"
      ? "var(--up)"
      : tone === "down"
        ? "var(--down)"
        : "var(--foreground)"
  return (
    <div>
      <dt className="zeks-label-inline">{label}</dt>
      <dd
        className="zeks-num-md"
        style={{ color, marginTop: "3px" }}
      >
        {value}
      </dd>
    </div>
  )
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <p
      className="font-mono"
      style={{
        fontSize: "12px",
        color: "var(--muted-foreground)",
      }}
    >
      {hasAny
        ? "No tickers match the current filter."
        : "None of the 8 curated tickers are currently live."}
    </p>
  )
}
