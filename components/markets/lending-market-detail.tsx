"use client"

/**
 * LendingMarketDetail (v4 — LIVE MARKET DETAIL)
 *
 * Premium live read-only detail view for one onchain Morpho market.
 *
 *   - 1: strong serif "market hero" with oracle price + APY hierarchy
 *   - 2: market metrics grid (Supply APY, Borrow APY, TVL, Total Borrow,
 *         Available Liquidity, Utilization, LLTV, Listed)
 *   - 3: market structure (collateral / loan / oracle / market id /
 *         protocol / network) — null fields hidden gracefully
 *   - 4: per-market user section (wallet balance, supplied, borrowed,
 *         collateral, position value) + empty state when no position
 *   - 5: market activity feed — only when wallet connected; never
 *         invents action types
 *
 * Writes remain disabled. Supply is gated via `SupplyActionPanel`.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import AssetLogo from "@/components/asset-logo"
import SourceChips from "@/components/markets/source-chips"
import UserPositionPanel from "@/components/markets/user-position-panel"
import SupplyActionPanel from "@/components/markets/supply-action-panel"
import MarketUserSection from "./market-user-section"
import MarketActivitySection from "./market-activity-section"
import {
  formatPrice,
  formatApy,
  formatCompact,
  formatUtilization,
} from "@/lib/markets/format"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/client"
import type { LendingMarket } from "@/lib/markets/lending"
import { LENDING_SOURCE } from "@/lib/markets/lending"

interface LendingMarketDetailProps {
  market: LendingMarket
}

export default function LendingMarketDetail({
  market,
}: LendingMarketDetailProps) {
  return (
    <div className="w-full max-w-[1080px] mx-auto" data-market-detail>
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-muted-foreground mb-4"
      >
        <Link
          href="/terminal/markets"
          className="hover:text-foreground transition-colors"
        >
          ← Markets
        </Link>
        <span aria-hidden="true" className="text-border">/</span>
        <span className="text-foreground">{market.symbol}</span>
      </nav>

      {/* ── 1. HEADER + HERO ──────────────────────────────────────── */}
      <section
        aria-label="Market header"
        className="rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        <div className="flex items-start gap-4 flex-wrap">
          <AssetLogo
            symbol={market.symbol}
            name={market.name}
            src={market.logoUrl ?? undefined}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-[34px] md:text-[40px] leading-none tracking-tight text-foreground">
                {market.symbol}
              </h1>
              <StatusBadge status={market.status} />
              <SourceModeBadge mode={market.sourceMode} />
            </div>
            <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
              {market.name}
              {market.collateralAssetSymbol ? (
                <span className="text-muted-foreground/70">
                  {" · Collateral "}
                  {market.collateralAssetSymbol}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SourceChips
              oracle={market.oracleSource}
              protocol={market.protocolSource}
              asset={
                market.rhContractAddress !== null
                  ? "robinhood-asset-registry"
                  : market.sourceMode === "mock"
                    ? "mock"
                    : "unknown"
              }
              network={LENDING_SOURCE.network}
              sourceMode={
                market.sourceMode === "live" ||
                market.sourceMode === "real-morpho"
                  ? "live"
                  : "stale"
              }
            />
            {market.contractAddress ? (
              <Link
                href={`https://explorer.robinhood.com/address/${market.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                View on Explorer
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : null}
          </div>
        </div>

        {/* Oracle price + APY hierarchy */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 items-end">
          <div>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              ORACLE PRICE
            </span>
            <div
              className={
                "font-serif leading-none tabular-nums tracking-tight mt-1.5 " +
                "text-[40px] md:text-[52px] " +
                (market.oraclePrice == null ? "text-foreground/40" : "text-foreground")
              }
              data-field="oracle-price"
            >
              {market.oraclePrice != null ? formatPrice(market.oraclePrice) : "—"}
            </div>
            <div className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground/70">
              {oracleLabel(market.oracleSource)} feed
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HeroApy
              label="SUPPLY APY"
              value={market.supplyApy}
              tone="up"
            />
            <HeroApy
              label="BORROW APY"
              value={market.borrowApy}
              tone="down"
            />
          </div>
        </div>
      </section>

      {/* ── 2. METRICS GRID ──────────────────────────────────────────── */}
      <section
        aria-label="Market metrics"
        className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-border border border-border rounded-2xl overflow-hidden"
      >
        <MetricCell label="TVL" value={formatCompact(market.tvl ?? market.totalSupply)} />
        <MetricCell label="Total Supply" value={formatCompact(market.totalSupply)} />
        <MetricCell label="Total Borrow" value={formatCompact(market.totalBorrow)} />
        <MetricCell
          label="Liquidity"
          value={formatCompact(market.availableLiquidity)}
        />
        <MetricCell
          label="Utilization"
          value={formatUtilization(market.utilization)}
        />
        <MetricCell
          label="LLTV"
          value={lltvLabel(market.lltv)}
        />
        <MetricCell
          label="Listed"
          value={listedLabel(market.listed, market.sourceMode)}
        />
      </section>

      {/* ── 3. SUPPLY ACTION + STRUCTURE ─────────────────────────── */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
        <SupplyActionPanel market={market} />
        <MarketStructureCard market={market} />
      </div>

      {/* ── 4. USER POSITION (live, per-market) ───────────────────── */}
      <section className="mt-3" aria-label="Your position in this market">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            YOUR POSITION
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
            Morpho
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <MarketUserSection market={market} />
          <UserPositionPanel market={market} />
        </div>
      </section>

      {/* ── 5. ACTIVITY (compact feed) ─────────────────────────────── */}
      <section className="mt-3" aria-label="Market activity">
        <MarketActivitySection market={market} />
      </section>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Subcomponents
 * ──────────────────────────────────────────────────────────────────── */

function HeroApy({
  label,
  value,
  tone,
}: {
  label: string
  value: number | null
  tone: "up" | "down"
}) {
  const toneClass = value != null
    ? tone === "up"
      ? "text-up"
      : "text-down"
    : "text-foreground/40"
  return (
    <div className="flex flex-col items-start md:items-end md:text-right">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
        {label}
      </span>
      <span
        className={
          "font-serif leading-none tabular-nums tracking-tight mt-1.5 " +
          "text-[40px] md:text-[52px] " +
          toneClass
        }
      >
        {value != null ? formatApy(value) : "—"}
      </span>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3.5">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="font-mono tabular-nums text-[16px] mt-1 text-foreground">
        {value}
      </div>
    </div>
  )
}

function MarketStructureCard({ market }: { market: LendingMarket }) {
  // Only render the card when at least one technical detail is available;
  // for mock markets it would otherwise show lots of "—".
  const hasAny =
    market.collateralAssetSymbol ||
    market.loanAssetSymbol ||
    market.marketId ||
    market.oracleAddress ||
    market.lltv !== null
  if (!hasAny) return null

  return (
    <section
      aria-label="Market structure"
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <header className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          STRUCTURE
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
          Robinhood Chain · Morpho
        </span>
      </header>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 px-5 py-4 text-[11px]">
        {market.collateralAssetSymbol ? (
          <Row label="Collateral">
            <span className="font-mono text-foreground font-medium">
              {market.collateralAssetSymbol}
            </span>
          </Row>
        ) : null}
        {market.loanAssetSymbol ? (
          <Row label="Loan">
            <span className="font-mono text-foreground font-medium">
              {market.loanAssetSymbol}
            </span>
          </Row>
        ) : null}
        <Row label="Oracle">
          <span className="font-mono text-foreground">
            {oracleLabel(market.oracleSource)}
            {market.oracleAddress ? (
              <span className="ml-1 text-muted-foreground/70 font-mono">
                {shortenAddr(market.oracleAddress)}
              </span>
            ) : null}
          </span>
        </Row>
        <Row label="Protocol">
          <span className="font-mono text-foreground">
            {protocolLabel(market.protocolSource)}
          </span>
        </Row>
        <Row label="Network">
          <span className="font-mono text-foreground">
            Robinhood Chain <span className="text-muted-foreground/70">{ROBINHOOD_CHAIN_ID}</span>
          </span>
        </Row>
        {market.marketId ? (
          <Row label="Market ID">
            <span className="font-mono tabular-nums text-foreground">
              {shortenAddr(market.marketId, 10, 6)}
            </span>
          </Row>
        ) : null}
        {market.lltv != null ? (
          <Row label="LLTV">
            <span className="font-mono tabular-nums text-foreground">
              {(market.lltv * 100).toFixed(2)}%
            </span>
          </Row>
        ) : null}
      </dl>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: LendingMarket["status"] }) {
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-destructive/10 border border-destructive/30 text-[10px] font-mono tracking-wider text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        PAUSED
      </span>
    )
  }
  if (status === "delisted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-secondary border border-border text-[10px] font-mono tracking-wider text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        DELISTED
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-up/10 border border-up/30 text-[10px] font-mono tracking-wider text-up">
      <span className="w-1.5 h-1.5 rounded-full bg-up" />
      ACTIVE
    </span>
  )
}

function SourceModeBadge({ mode }: { mode: LendingMarket["sourceMode"] }) {
  if (mode === "mock") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-destructive/10 border border-destructive/30 text-[10px] font-mono tracking-wider text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        MOCK DATA
      </span>
    )
  }
  if (mode === "real-morpho-unlisted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono tracking-wider text-amber-700 dark:text-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        UNLISTED
      </span>
    )
  }
  if (mode === "real-morpho" || mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-primary/15 border border-primary/30 text-[10px] font-mono tracking-wider text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        LIVE
      </span>
    )
  }
  return null
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

function oracleLabel(s: LendingMarket["oracleSource"]): string {
  switch (s) {
    case "chainlink":
      return "Chainlink"
    case "robinhood-rpc":
      return "Robinhood RPC"
    case "mock":
      return "Mock"
    default:
      return "—"
  }
}

function protocolLabel(p: LendingMarket["protocolSource"]): string {
  switch (p) {
    case "morpho":
      return "Morpho"
    case "aave":
      return "Aave"
    case "robinhood-rpc":
      return "Robinhood RPC"
    case "mock":
      return "Mock"
    default:
      return "—"
  }
}

function lltvLabel(lltv: number | null): string {
  if (lltv == null) return "—"
  return `${(lltv * 100).toFixed(1)}%`
}

function listedLabel(
  listed: boolean | null,
  mode: LendingMarket["sourceMode"],
): string {
  if (mode === "mock") return "—"
  if (listed === null) return "—"
  return listed ? "Yes" : "No"
}

function shortenAddr(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
