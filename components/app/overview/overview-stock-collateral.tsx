"use client"

/**
 * StockOpportunities — curated 8-ticker grid.
 *
 *   Spec list: AAPL · TSLA · NVDA · MSFT · META · GOOGL · AMZN · SPCX
 *
 *   Each card exposes 6 fields (when live):
 *     1. oracle price
 *     2. collateral ratio / LLTV
 *     3. borrow APY
 *     4. liquidity
 *     5. yield spread      (best venue APY − borrow APY, hidden if
 *         no live venue APY)
 *     6. risk / status
 *
 *   CTA: Explore → /terminal/markets/[symbol]
 *
 * Read-only. No transactions.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatCompact,
} from "@/lib/markets/format"
import { assessLoopRisk, type LoopRiskStatus } from "@/lib/markets/loop/types"
import type { LendingMarket } from "@/lib/markets/lending"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface StockOpportunitiesProps {
  markets: LendingMarket[]
  yieldVenues: YieldVenue[]
  fetchedAt: string | null
  errorMessage: string | null
}

const PRIORITY: readonly string[] = [
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
  "META",
  "GOOGL",
  "AMZN",
  "SPCX",
]

const PRIORITY_INDEX = new Map<string, number>(
  PRIORITY.map((s, i) => [s, i] as const),
)

export default function StockOpportunities({
  markets,
  yieldVenues,
  fetchedAt,
  errorMessage,
}: StockOpportunitiesProps) {
  // Hard-locked to the 8-ticker curated spec list.
  const priority = React.useMemo(() => {
    const bySymbol = new Map<string, LendingMarket>()
    for (const m of markets) bySymbol.set(m.symbol.toUpperCase(), m)
    return PRIORITY.map((sym) =>
      bySymbol.get(sym),
    )
      .filter((m): m is LendingMarket => Boolean(m))
      .sort(
        (a, b) =>
          (PRIORITY_INDEX.get(a.symbol.toUpperCase()) ?? 0) -
          (PRIORITY_INDEX.get(b.symbol.toUpperCase()) ?? 0),
      )
  }, [markets])

  const bestVenueApy = React.useMemo(() => {
    const live = yieldVenues
      .filter((v) => v.status === "live" && v.apy != null)
      .slice()
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))[0]
    return live?.apy ?? null
  }, [yieldVenues])

  return (
    <section
      aria-label="Stock opportunities"
      data-testid="overview-stock-opportunities"
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <header className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
            STOCK OPPORTUNITIES
          </span>
          <span className="text-[11px] text-muted-foreground">
            8 curated tickers · deposit to borrow on Morpho
          </span>
        </div>
        <Link
          href="/terminal/markets"
          className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
        >
          All markets ({markets.length}) →
        </Link>
      </header>

      {errorMessage && priority.length === 0 ? (
        <p className="px-4 py-6 font-mono text-[11px] tracking-wider text-down">
          Live data unavailable — showing cached or mock values.
        </p>
      ) : priority.length === 0 ? (
        <p className="px-4 py-6 font-mono text-[11px] tracking-wider text-muted-foreground/70">
          None of the 8 curated tickers are currently live.
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border border-t border-border">
          {priority.map((m) => (
            <li key={m.marketId ?? m.symbol} className="bg-card">
              <OpportunityCard
                market={m}
                bestVenueApy={bestVenueApy}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="px-4 py-1.5 border-t border-border font-mono text-[10px] tracking-wider text-muted-foreground/60 flex items-center justify-between gap-2 flex-wrap">
        <span>{priority.length} / 8 live</span>
        <span>Updated {relative(fetchedAt)}</span>
      </footer>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Stock card — 6 fields (price · LLTV · borrow APY · liquidity
 *   · yield spread · status)
 * ═══════════════════════════════════════════════════════════════════ */

function OpportunityCard({
  market: m,
  bestVenueApy,
}: {
  market: LendingMarket
  bestVenueApy: number | null
}) {
  const hasSpread =
    m.borrowApy != null && bestVenueApy != null
  const spread = hasSpread ? (bestVenueApy ?? 0) - (m.borrowApy ?? 0) : null

  // Risk model: assume target utilization = 50% of LLTV. UI updates
  // when an explicit LTV is supplied. Fields unknown → show muted.
  const risk: LoopRiskStatus =
    m.lltv != null ? assessLoopRisk(m.lltv * 0.5, m.lltv) : "unknown"

  return (
    <article
      className="h-full px-3.5 py-3 hover:bg-secondary/30 transition-colors"
      data-testid="overview-opportunity-card"
    >
      {/* row 1 — logo · symbol · company */}
      <div className="flex items-center gap-2.5">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={26}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[16px] leading-none text-foreground">
              {m.symbol}
            </span>
            <SourcePip mode={m.sourceMode} />
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 truncate">
            {m.name ?? m.symbol}
          </div>
        </div>
      </div>

      {/* row 2 — oracle price (full width) */}
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
          PRICE
        </span>
        <span className="font-mono tabular-nums text-[15px] text-foreground leading-none">
          {m.oraclePrice != null ? formatPrice(m.oraclePrice) : "—"}
        </span>
      </div>

      {/* row 3 — LLTV / borrow APY / liquidity */}
      <div className="mt-2 grid grid-cols-3 gap-px bg-border rounded-md overflow-hidden border border-border">
        <Cell
          label="LLTV"
          value={m.lltv != null ? `${(m.lltv * 100).toFixed(1)}%` : "—"}
        />
        <Cell
          label="BORROW"
          value={m.borrowApy != null ? formatApy(m.borrowApy) : "—"}
          tone={m.borrowApy != null ? "down" : "muted"}
        />
        <Cell
          label="LIQUIDITY"
          value={
            m.availableLiquidity != null
              ? formatCompact(m.availableLiquidity)
              : m.totalSupply != null
                ? formatCompact(m.totalSupply)
                : "—"
          }
        />
      </div>

      {/* row 4 — spread + risk */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            STRATEGY SPREAD
          </div>
          <div
            className={
              "font-mono tabular-nums text-[13px] mt-0.5 " +
              (spread == null
                ? "text-muted-foreground"
                : spread >= 0
                  ? "text-up"
                  : "text-down")
            }
          >
            {spread != null ? formatApy(spread) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            STATUS
          </div>
          <div className="font-mono text-[12px] text-foreground mt-0.5">
            <RiskStatus mode={m.sourceMode} risk={risk} />
          </div>
        </div>
      </div>

      {/* row 5 — CTA */}
      <Link
        href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
        className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-ink text-ink-foreground px-3 py-1.5 font-mono text-[11px] tracking-wider hover:bg-ink/90 transition-colors"
      >
        Explore →
      </Link>
    </article>
  )
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down" | "muted"
}) {
  return (
    <div className="bg-card px-2.5 py-1.5">
      <div className="font-mono text-[9px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[12px] mt-0.5 " +
          (tone === "up"
            ? "text-up"
            : tone === "down"
              ? "text-down"
              : tone === "muted"
                ? "text-muted-foreground"
                : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}

function SourcePip({ mode }: { mode: LendingMarket["sourceMode"] }) {
  if (mode === "real-morpho")
    return (
      <span
        className="w-1.5 h-1.5 rounded-full bg-up"
        title="live"
      />
    )
  if (mode === "real-morpho-unlisted")
    return (
      <span
        className="w-1.5 h-1.5 rounded-full bg-amber-500"
        title="unlisted"
      />
    )
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
      title="mock"
    />
  )
}

function RiskStatus({
  mode,
  risk,
}: {
  mode: LendingMarket["sourceMode"]
  risk: LoopRiskStatus
}) {
  const sourceLabel =
    mode === "real-morpho"
      ? "Live"
      : mode === "real-morpho-unlisted"
        ? "Unlisted"
        : "Mock"

  const riskLabel =
    risk === "safe"
      ? "Safe"
      : risk === "warning"
        ? "Caution"
        : risk === "danger"
          ? "Danger"
          : "—"

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{sourceLabel}</span>
      <span className="text-muted-foreground/40">·</span>
      <span
        className={
          risk === "safe"
            ? "text-up"
            : risk === "warning"
              ? "text-amber-700 dark:text-amber-300"
              : risk === "danger"
                ? "text-down"
                : "text-muted-foreground"
        }
      >
        {riskLabel}
      </span>
    </span>
  )
}

function relative(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
