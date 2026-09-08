"use client"

/**
 * LoopComposition — ZEKS Loop main product page (v3)
 *
 * Loopr-style product flow:
 *
 *   1. STOCK COLLATERAL  — curated card grid (AAPL, SPCX, TSLA, NVDA,
 *                          GOOGL, AMZN, MSFT, META) with logo,
 *                          Chainlink price, LLTV, capital multiplier,
 *                          supply/borrow APY, liquidity, status.
 *                          Primary CTA: "Loop [SYMBOL]".
 *                          Secondary CTA: "View market".
 *   2. APPROVED YIELD VENUES — venue cards (name, APY, TVL, status,
 *                          source). Honest "unavailable" badge when
 *                          upstream data is missing.
 *   3. LOOP ECONOMICS PANEL — emerges on stock selection: collateral,
 *                          borrow APY, selected venue, venue APY,
 *                          estimated net carry, est. LTV, risk.
 *
 * Net carry: `venue APY − borrow APY − known costs`. When costs are
 * unknown we display "before fees — unavailable" instead of fake
 * precision.
 *
 * Read-only. No supply/borrow/loop transactions. No guessed contracts.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import { useLoopMarkets } from "@/components/loop/use-loop-markets"
import {
  CURATED_STOCKS,
  LOOP_ESTIMATED_FEES_PERCENT,
  STOCK_TOKEN_CAPITAL_LABEL,
} from "@/lib/markets/loop/constants"
import {
  computeNetCarry,
  assessLoopRisk,
  type NetCarry,
  type LoopRiskStatus,
  type LoopMarket,
  type YieldVenue,
} from "@/lib/markets/loop/types"
import {
  formatPrice,
  formatApy,
  formatCompact,
} from "@/lib/markets/format"

const STOCK_PRIORITY = new Map<string, number>(
  CURATED_STOCKS.map((s, i) => [s, i] as const),
)

export default function LoopComposition() {
  const { markets, yieldVenues, loading, error } = useLoopMarkets()

  const [selectedSymbol, setSelectedSymbol] = React.useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = React.useState<string | null>(
    null,
  )

  // Stock selection — pick first live (preferred) curated market
  React.useEffect(() => {
    if (selectedSymbol || markets.length === 0) return
    const live = markets.find((m) => m.sourceMode === "real-morpho")
    setSelectedSymbol(live?.symbol ?? markets[0].symbol)
  }, [markets, selectedSymbol])

  // Venue selection — prefer live > unlisted > first
  React.useEffect(() => {
    if (selectedVenueId || yieldVenues.length === 0) return
    const live =
      yieldVenues.find((v) => v.status === "live") ??
      yieldVenues.find((v) => v.status === "unlisted") ??
      yieldVenues[0]
    setSelectedVenueId(live.id)
  }, [yieldVenues, selectedVenueId])

  // Sort markets: curated priority first, then alphabetically
  const sortedMarkets = React.useMemo(() => {
    return markets.slice().sort((a, b) => {
      const sa = a.symbol.toUpperCase()
      const sb = b.symbol.toUpperCase()
      const ia = STOCK_PRIORITY.get(sa)
      const ib = STOCK_PRIORITY.get(sb)
      if (ia != null && ib != null) return ia - ib
      if (ia != null) return -1
      if (ib != null) return 1
      return sa.localeCompare(sb)
    })
  }, [markets])

  const selectedMarket =
    markets.find((m) => m.symbol === selectedSymbol) ?? null
  const selectedVenue =
    yieldVenues.find((v) => v.id === selectedVenueId) ?? null

  const position = React.useMemo(() => {
    if (!selectedMarket || !selectedVenue) return null
    return {
      market: selectedMarket,
      venue: selectedVenue,
      collateralAmount: null,
      loanAmount: null,
      estimatedLtv: null,
    }
  }, [selectedMarket, selectedVenue])

  const carry: NetCarry | null | undefined = position
    ? computeNetCarry(position, LOOP_ESTIMATED_FEES_PERCENT)
    : undefined

  const estimatedLtvFrac =
    selectedMarket?.lltv != null ? selectedMarket.lltv * 0.5 : null

  const risk: LoopRiskStatus =
    selectedMarket?.lltv != null
      ? assessLoopRisk(estimatedLtvFrac, selectedMarket.lltv)
      : "unknown"

  const liveVenueCount = yieldVenues.filter((v) => v.status === "live").length

  return (
    <div
      className="w-full max-w-[1200px] mx-auto space-y-4"
      data-loop-composition
    >
      {/* ── Section 1 — STOCK COLLATERAL ──────────────────────────── */}
      <section
        aria-label="Stock collateral grid"
        data-testid="loop-stock-grid"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <header className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              STOCK COLLATERAL
            </span>
            <span className="text-[11px] text-muted-foreground">
              Curated Robinhood Chain stock tokens · Morpho Blue
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            {markets.length} markets · {CURATED_STOCKS.length} curated
          </span>
        </header>

        {loading && markets.length === 0 ? (
          <EmptyState text="Loading markets…" tone="muted" />
        ) : error && markets.length === 0 ? (
          <EmptyState text={`Error: ${error}`} tone="error" />
        ) : sortedMarkets.length === 0 ? (
          <EmptyState text="No stock markets available." tone="muted" />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border border-t border-border">
            {sortedMarkets.map((m) => (
              <li
                key={m.marketId ?? m.symbol}
                className="bg-card"
              >
                <StockCard
                  market={m}
                  active={selectedSymbol === m.symbol}
                  onSelect={setSelectedSymbol}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Section 2 — APPROVED YIELD VENUES ─────────────────────── */}
      <section
        aria-label="Approved yield venues"
        data-testid="loop-yield-venues"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <header className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              APPROVED YIELD VENUES
            </span>
            <span className="text-[11px] text-muted-foreground">
              Where borrowed stablecoin is routed for yield
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            {liveVenueCount} live · {yieldVenues.length} total
          </span>
        </header>

        {yieldVenues.length === 0 ? (
          <EmptyState text="Loading venues…" tone="muted" />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border-t border-border">
            {yieldVenues.map((v) => (
              <li
                key={v.id}
                className="bg-card"
              >
                <VenueCard
                  venue={v}
                  active={selectedVenueId === v.id}
                  onSelect={setSelectedVenueId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Section 3 — LOOP ECONOMICS PANEL ──────────────────────── */}
      <section
        aria-label="Loop economics"
        data-testid="loop-economics"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <header className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              LOOP ECONOMICS
            </span>
            <span className="text-[11px] text-muted-foreground">
              Estimated carry for the selected pair
            </span>
          </div>
          {!selectedMarket || !selectedVenue ? (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
              Select a stock and venue above
            </span>
          ) : (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
              {selectedMarket.symbol} → {selectedVenue.asset ?? "stablecoin"} → {selectedVenue.name}
            </span>
          )}
        </header>

        {selectedMarket && selectedVenue ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-px bg-border border-t border-border">
            {/* left: carry hero */}
            <CarryHero
              market={selectedMarket}
              venue={selectedVenue}
              carry={carry ?? null}
              estimatedLtv={estimatedLtvFrac}
              risk={risk}
            />
            {/* right: detail tiles */}
            <DetailGrid
              market={selectedMarket}
              venue={selectedVenue}
              carry={carry ?? null}
              estimatedLtv={estimatedLtvFrac}
            />
          </div>
        ) : (
          <div className="p-6">
            <p className="font-serif text-[28px] text-foreground/40 leading-tight">
              Pick a stock collateral card and an approved yield venue.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Stock card
 * ═══════════════════════════════════════════════════════════════════ */

function StockCard({
  market: m,
  active,
  onSelect,
}: {
  market: LoopMarket
  active: boolean
  onSelect: (s: string) => void
}) {
  const statusLabel = marketStatus(m)
  return (
    <article
      aria-label={`${m.name ?? m.symbol} market`}
      data-testid="loop-stock-card"
      className={
        "relative h-full p-4 flex flex-col gap-3 transition-colors " +
        (active ? "bg-accent/40 ring-1 ring-primary/40" : "hover:bg-secondary/30")
      }
    >
      <button
        type="button"
        onClick={() => onSelect(m.symbol)}
        className="absolute inset-0 z-0 cursor-pointer"
        aria-label={`Select ${m.symbol} for loop economics`}
      />
      <div className="relative z-10 flex items-start gap-3">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-[20px] leading-none text-foreground">
              {m.symbol}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 truncate">
              {m.name ?? m.symbol}
            </span>
            <StatusPip mode={m.sourceMode} />
          </div>
          <div className="font-mono tabular-nums text-[18px] text-foreground mt-1.5">
            {m.oraclePrice != null ? formatPrice(m.oraclePrice) : "—"}
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mt-0.5">
            Chainlink oracle
          </div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
        <StockStat
          label="MAX LTV · LLTV"
          value={m.lltv != null ? `${(m.lltv * 100).toFixed(1)}%` : "—"}
        />
        <StockStat
          label={STOCK_TOKEN_CAPITAL_LABEL}
          value={
            m.rhMultiplier != null
              ? `×${m.rhMultiplier.toFixed(4)}`
              : "—"
          }
        />
        <StockStat
          label="SUPPLY APY"
          value={m.supplyApy != null ? formatApy(m.supplyApy) : "—"}
          tone={m.supplyApy != null ? "up" : "muted"}
        />
        <StockStat
          label="BORROW APY"
          value={m.borrowApy != null ? formatApy(m.borrowApy) : "—"}
          tone={m.borrowApy != null ? "down" : "muted"}
        />
      </div>

      <div className="relative z-10 flex items-baseline justify-between gap-2 pt-2 border-t border-border">
        <div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            LIQUIDITY
          </div>
          <div className="font-mono tabular-nums text-[14px] text-foreground">
            {m.availableLiquidityUsd != null
              ? formatCompact(m.availableLiquidityUsd)
              : m.totalSupplyUsd != null
                ? formatCompact(m.totalSupplyUsd)
                : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            STATUS
          </div>
          <div className="font-mono text-[12px] text-foreground">
            {statusLabel}
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(m.symbol)}
          data-testid="loop-stock-card-cta"
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-[12px] font-medium hover:bg-primary/90 transition-colors"
        >
          Loop {m.symbol}
        </button>
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          className="rounded-lg border border-border bg-secondary/30 text-foreground px-3 py-2 text-[12px] hover:bg-secondary/50 transition-colors"
        >
          View market
        </Link>
      </div>
    </article>
  )
}

function StockStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down" | "muted"
}) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="font-mono text-[9.5px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[13px] mt-1 " +
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

/* ════════════════════════════════════════════════════════════════════
 * Venue card
 * ═══════════════════════════════════════════════════════════════════ */

function VenueCard({
  venue: v,
  active,
  onSelect,
}: {
  venue: YieldVenue
  active: boolean
  onSelect: (id: string) => void
}) {
  const unavailable = v.status === "unavailable" || v.apy == null
  return (
    <article
      aria-label={`${v.name} yield venue`}
      data-testid="loop-venue-card"
      className={
        "relative h-full p-4 flex flex-col gap-3 transition-colors " +
        (active ? "bg-accent/40 ring-1 ring-primary/40" : "hover:bg-secondary/30")
      }
    >
      <button
        type="button"
        onClick={() => onSelect(v.id)}
        className="absolute inset-0 z-0 cursor-pointer"
        aria-label={`Select ${v.name}`}
      />
      <div className="relative z-10 flex items-baseline justify-between gap-2">
        <div>
          <span className="font-serif text-[18px] leading-none text-foreground">
            {v.name}
          </span>
          <span className="ml-2 font-mono text-[10px] tracking-wider text-muted-foreground/70">
            {v.asset ?? "stablecoin"}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
          <span
            className={
              "w-1.5 h-1.5 rounded-full " +
              (v.status === "live"
                ? "bg-up"
                : v.status === "unlisted"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40")
            }
          />
          {venueStatusLabel(v)}
        </span>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
        <div className="bg-card px-3 py-2.5">
          <div className="font-mono text-[9.5px] tracking-wider text-muted-foreground/70">
            APY
          </div>
          <div
            className={
              "font-mono tabular-nums text-[18px] mt-1 " +
              (unavailable ? "text-muted-foreground/60" : "text-up")
            }
          >
            {v.apy != null ? formatApy(v.apy) : "—"}
          </div>
        </div>
        <div className="bg-card px-3 py-2.5">
          <div className="font-mono text-[9.5px] tracking-wider text-muted-foreground/70">
            TVL
          </div>
          <div className="font-mono tabular-nums text-[18px] mt-1 text-foreground">
            {formatCompact(v.tvl)}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-baseline justify-between gap-2 text-[11px] font-mono tracking-wider text-muted-foreground/70">
        <span>{v.tagline}</span>
        <span>source · {v.source}</span>
      </div>

      {unavailable ? (
        <div className="relative z-10 mt-auto rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-amber-700 dark:text-amber-300">
          Venue data not live — no APY for this asset
        </div>
      ) : null}
    </article>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Economics
 * ═══════════════════════════════════════════════════════════════════ */

function CarryHero({
  market,
  venue,
  carry,
  estimatedLtv,
  risk,
}: {
  market: LoopMarket
  venue: YieldVenue
  carry: NetCarry | null
  estimatedLtv: number | null
  risk: LoopRiskStatus
}) {
  const net = carry?.net ?? null
  const gross = carry?.gross ?? null
  const showNet = net != null
  const showGross = !showNet && gross != null
  const showNone = !showNet && !showGross

  return (
    <div className="bg-card p-6 flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          {showNet ? "ESTIMATED NET CARRY" : "CARRY (BEFORE FEES)"}
        </div>

        {showNet ? (
          <>
            <div
              data-testid="loop-net-carry"
              className={
                "font-serif leading-none tabular-nums tracking-tight mt-2 " +
                "text-[64px] md:text-[88px] " +
                (carry?.profitable ? "text-up" : "text-down")
              }
            >
              {formatApy(net)}
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-wider text-muted-foreground/70">
              {market.symbol} → {venue.asset ?? "stablecoin"} → {venue.name}
            </div>
          </>
        ) : showGross ? (
          <>
            <div
              className={
                "font-serif leading-none tabular-nums tracking-tight mt-2 " +
                "text-[64px] md:text-[88px] " +
                ((gross ?? 0) > 0 ? "text-up" : "text-down")
              }
            >
              {formatApy(gross)}
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-wider text-amber-700 dark:text-amber-300">
              before fees — unavailable
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground/70">
              {market.symbol} → {venue.asset ?? "stablecoin"} → {venue.name}
            </div>
          </>
        ) : (
          <>
            <div className="font-serif leading-none tabular-nums tracking-tight mt-2 text-[64px] md:text-[88px] text-foreground/40">
              —
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-wider text-muted-foreground/70">
              Insufficient data to estimate carry
            </div>
          </>
        )}
      </div>

      <div className="pt-4 border-t border-border grid grid-cols-3 gap-4">
        <RiskBlock
          label="EST. LTV"
          value={
            estimatedLtv != null
              ? `${(estimatedLtv * 100).toFixed(1)}%`
              : "—"
          }
          sub="50% of LLTV"
        />
        <RiskBlock
          label="LLTV"
          value={
            market.lltv != null ? `${(market.lltv * 100).toFixed(1)}%` : "—"
          }
          sub="max borrow"
        />
        <RiskBlock
          label="RISK"
          value={<RiskBadge risk={risk} />}
          sub={riskSub(risk)}
        />
      </div>
    </div>
  )
}

function DetailGrid({
  market,
  venue,
  carry,
  estimatedLtv,
}: {
  market: LoopMarket
  venue: YieldVenue
  carry: NetCarry | null
  estimatedLtv: number | null
}) {
  return (
    <div className="bg-card p-6 flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          LOOP BREAKDOWN
        </div>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-md leading-relaxed">
          Loop {market.symbol} → borrow {venue.asset ?? "stablecoin"} → earn
          {" "}
          {venue.name} yield. Carry = venue − borrow − costs.
        </p>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        <DetailRow label="COLLATERAL" value={market.symbol} sub={market.name ?? market.symbol} />
        <DetailRow
          label="BORROW APY"
          value={carry?.borrowApy != null ? formatApy(carry.borrowApy) : "—"}
          tone="down"
          sub="Morpho · variable"
        />
        <DetailRow
          label="YIELD VENUE"
          value={venue.name}
          sub={venue.tagline}
        />
        <DetailRow
          label="VENUE APY"
          value={carry?.venueApy != null ? formatApy(carry.venueApy) : "—"}
          tone="up"
          sub={`source · ${venue.source}`}
        />
        <DetailRow
          label="EST. NET CARRY"
          value={carry?.net != null ? formatApy(carry.net) : "—"}
          tone={carry?.net != null ? (carry.profitable ? "up" : "down") : "muted"}
          sub={
            carry?.feesUnknown
              ? "before fees — fees unavailable"
              : carry?.net != null
                ? `${carry.fees?.toFixed(2) ?? "0"}% fee estimate`
                : "costs unknown"
          }
        />
        <DetailRow
          label="EST. LTV"
          value={
            estimatedLtv != null
              ? `${(estimatedLtv * 100).toFixed(1)}%`
              : "—"
          }
          sub="target utilization"
        />
      </ul>

      <div className="mt-auto rounded-full bg-secondary px-3 py-1.5 border border-border self-start">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          Supply / Borrow / Loop — coming soon
        </span>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Detail row / badge helpers
 * ═══════════════════════════════════════════════════════════════════ */

function DetailRow({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: "up" | "down" | "muted"
}) {
  return (
    <li className="px-3.5 py-2.5 bg-card flex items-baseline justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
          {label}
        </div>
        {sub ? (
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60 mt-0.5">
            {sub}
          </div>
        ) : null}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[14px] " +
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
    </li>
  )
}

function RiskBlock({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="font-mono tabular-nums text-[20px] text-foreground mt-1">
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mt-0.5">
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function RiskBadge({ risk }: { risk: LoopRiskStatus }) {
  if (risk === "unknown") {
    return <span className="text-muted-foreground/50">—</span>
  }
  const label =
    risk === "safe" ? "Safe" : risk === "warning" ? "Caution" : "Danger"
  const tone =
    risk === "safe"
      ? "text-up"
      : risk === "warning"
        ? "text-amber-500"
        : "text-down"
  return <span className={tone}>{label}</span>
}

function riskSub(risk: LoopRiskStatus): string {
  if (risk === "safe") return "≤50% of LLTV"
  if (risk === "warning") return "50–80% of LLTV"
  if (risk === "danger") return ">80% of LLTV"
  return "—"
}

/* ════════════════════════════════════════════════════════════════════
 * Status / pip / state helpers
 * ═══════════════════════════════════════════════════════════════════ */

function StatusPip({
  mode,
}: {
  mode: LoopMarket["sourceMode"]
}) {
  if (mode === "real-morpho")
    return (
      <span
        className="w-1.5 h-1.5 rounded-full bg-up"
        title="live Morpho"
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

function EmptyState({
  text,
  tone,
}: {
  text: string
  tone: "muted" | "error"
}) {
  return (
    <div
      className={
        "px-5 py-6 font-mono text-[11px] " +
        (tone === "error" ? "text-down" : "text-muted-foreground/70")
      }
    >
      {text}
    </div>
  )
}

function marketStatus(m: LoopMarket): string {
  return m.sourceMode === "real-morpho"
    ? "Live"
    : m.sourceMode === "real-morpho-unlisted"
      ? "Unlisted"
      : "Mock"
}

function venueStatusLabel(v: YieldVenue): string {
  switch (v.status) {
    case "live":
      return "Live"
    case "unlisted":
      return "Unlisted"
    case "stale":
      return "Stale"
    case "mock":
      return "Mock"
    default:
      return "Unavailable"
  }
}
