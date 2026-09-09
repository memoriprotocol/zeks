"use client"

/**
 * MarketList — dense 8-column market table.
 *
 *   Columns: Asset · Oracle Price · LLTV · Supply APY · Borrow APY ·
 *            Liquidity · Utilization · Status
 *
 *   · Single beige surface, no row borders (thin dividers between rows)
 *   · 16px radius · 20px card padding
 *   · Row click navigates to /terminal/markets/[symbol]
 *   · Each cell hides cleanly when its source field is missing
 *
 * No admin chrome. Read-only.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatCompact,
  formatPct,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import type { StatusFilter } from "@/components/zeks/markets/markets-toolbar"

interface MarketListProps {
  markets: LendingMarket[]
  query: string
  status: StatusFilter
}

/** 8-col grid template, used by both header and rows. */
const COL_TEMPLATE =
  "minmax(0,1.7fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.7fr)"

export function MarketList({ markets, query, status }: MarketListProps) {
  const router = useRouter()

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

  const goTo = React.useCallback(
    (symbol: string) => {
      router.push(`/terminal/markets/${encodeURIComponent(symbol)}`)
    },
    [router],
  )

  return (
    <div data-testid="market-list">
      <div
        className="border overflow-hidden"
        style={{
          backgroundColor: "var(--card-soft)",
          borderColor: "var(--border)",
          borderRadius: "var(--dash-card-radius)",
        }}
      >
        {/* Column header */}
        <div
          className="hidden md:grid items-center border-b"
          style={{
            gridTemplateColumns: COL_TEMPLATE,
            columnGap: "16px",
            padding: "12px 20px",
            borderColor: "var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span>Asset</span>
          <span style={{ textAlign: "right" }}>Oracle Price</span>
          <span style={{ textAlign: "right" }}>LLTV</span>
          <span style={{ textAlign: "right" }}>Supply APY</span>
          <span style={{ textAlign: "right" }}>Borrow APY</span>
          <span style={{ textAlign: "right" }}>Liquidity</span>
          <span style={{ textAlign: "right" }}>Utilization</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>

        {filtered.length === 0 ? (
          <p
            className="font-mono"
            style={{
              padding: "24px 20px",
              fontSize: "11px",
              color: "var(--muted-foreground)",
              letterSpacing: "0.04em",
            }}
          >
            No markets match the current search or filter.
          </p>
        ) : (
          <ul>
            {filtered.map((m, idx) => (
              <li
                key={m.marketId ?? m.symbol}
                style={
                  idx === 0
                    ? undefined
                    : { borderTop: "1px solid var(--border)" }
                }
              >
                <Row market={m} onClick={() => goTo(m.symbol)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          marginTop: "12px",
          paddingLeft: "4px",
          letterSpacing: "0.02em",
        }}
      >
        {filtered.length} / {markets.length} markets
      </p>
    </div>
  )
}

/* ── Single dense row ─────────────────────────────────────────── */

function Row({
  market: m,
  onClick,
}: {
  market: LendingMarket
  onClick: () => void
}) {
  const liquidity = m.availableLiquidity ?? m.totalSupply ?? null
  const utilizationPct = React.useMemo(() => {
    if (m.utilization == null || !Number.isFinite(m.utilization)) return null
    // Morpho Blue expresses utilization in basis points × 1e9; our
    // normalized type stores a 0..1 ratio. To be safe, also accept
    // percentages directly (values > 1).
    const v =
      m.utilization > 1 ? m.utilization / 100 : m.utilization
    return v * 100
  }, [m.utilization])

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="market-list-row"
      className="w-full text-left transition-colors cursor-pointer focus:outline-none focus-visible:bg-secondary/60"
      style={{
        background: "transparent",
        border: "none",
        padding: "var(--dash-card-pad)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--secondary)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
      }}
    >
      {/* Desktop: 8-col grid */}
      <div
        className="hidden md:grid items-center"
        style={{
          gridTemplateColumns: COL_TEMPLATE,
          columnGap: "16px",
        }}
      >
        <AssetCell m={m} />
        <PriceCell value={m.oraclePrice} />
        <LltvCell value={m.lltv} />
        <ApyCell value={m.supplyApy} tone="up" />
        <ApyCell value={m.borrowApy} tone="down" />
        <LiquidityCell value={liquidity} />
        <UtilizationCell value={utilizationPct} />
        <StatusCell mode={m.sourceMode} live={m.status === "active"} />
      </div>

      {/* Mobile: stacked summary (still navigable) */}
      <div className="md:hidden flex items-center gap-3">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={28}
        />
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--font-card-symbol)",
              color: "var(--foreground)",
              lineHeight: 1.1,
            }}
          >
            {m.symbol}
          </div>
          <div
            className="font-mono truncate"
            style={{
              fontSize: "var(--font-card-company)",
              color: "var(--muted-foreground)",
              marginTop: "4px",
            }}
          >
            {m.name ?? m.symbol}
          </div>
        </div>
        <StatusCell
          mode={m.sourceMode}
          live={m.status === "active"}
          compact
        />
      </div>
    </button>
  )
}

/* ── Cells ─────────────────────────────────────────────────────── */

function AssetCell({ m }: { m: LendingMarket }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <AssetLogo
        symbol={m.symbol}
        name={m.name ?? m.symbol}
        src={m.logoUrl ?? undefined}
        size={28}
      />
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--font-card-symbol)",
            color: "var(--foreground)",
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
          }}
          className="truncate"
        >
          {m.symbol}
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
    </div>
  )
}

function PriceCell({ value }: { value: number | null | undefined }) {
  const has = value != null && Number.isFinite(value)
  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        {has ? formatPrice(value as number) : "—"}
      </span>
    </Cell>
  )
}

function LltvCell({ value }: { value: number | null | undefined }) {
  const has = value != null && Number.isFinite(value)
  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        {has ? `${((value as number) * 100).toFixed(1)}%` : "—"}
      </span>
    </Cell>
  )
}

function ApyCell({
  value,
  tone,
}: {
  value: number | null | undefined
  tone: "up" | "down"
}) {
  const has = value != null && Number.isFinite(value)
  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: has ? (tone === "up" ? "var(--up)" : "var(--down)") : "var(--foreground)",
          opacity: has ? 1 : 0.5,
        }}
      >
        {has ? formatApy(value as number) : "—"}
      </span>
    </Cell>
  )
}

function LiquidityCell({ value }: { value: number | null }) {
  const has = value != null && Number.isFinite(value)
  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        {has ? formatCompact(value) : "—"}
      </span>
    </Cell>
  )
}

function UtilizationCell({ value }: { value: number | null }) {
  const has = value != null && Number.isFinite(value)
  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--foreground)",
          opacity: has ? 1 : 0.5,
        }}
      >
        {has ? `${formatPct(value)}` : "—"}
      </span>
    </Cell>
  )
}

function StatusCell({
  mode,
  live,
  compact,
}: {
  mode: LendingMarket["sourceMode"]
  live: boolean
  compact?: boolean
}) {
  return (
    <Cell align="right">
      <StatusBadge mode={mode} live={live} compact={compact} />
    </Cell>
  )
}

function Cell({
  align,
  children,
}: {
  align: "left" | "right"
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        textAlign: align,
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  )
}

/* ── Status badge — only meaningful markers ──────────────────── */

function StatusBadge({
  mode,
  live,
  compact,
}: {
  mode: LendingMarket["sourceMode"]
  live: boolean
  compact?: boolean
}) {
  if (mode === "real-morpho" && live) {
    return (
      <span
        className="font-mono uppercase inline-flex items-center gap-1 shrink-0"
        style={{
          fontSize: "9px",
          color: "var(--up)",
          letterSpacing: "0.08em",
          opacity: 0.95,
          padding: "2px 5px",
          border: "1px solid var(--up)",
          borderRadius: "4px",
        }}
      >
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{ width: "4px", height: "4px", backgroundColor: "var(--up)" }}
        />
        {compact ? "Live" : "LIVE"}
      </span>
    )
  }
  if (mode === "real-morpho-unlisted") {
    return (
      <span
        className="font-mono uppercase inline-flex items-center gap-1 shrink-0"
        style={{
          fontSize: "9px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.08em",
          opacity: 0.85,
          padding: "2px 5px",
          border: "1px solid var(--border)",
          borderRadius: "4px",
        }}
      >
        Unlisted
      </span>
    )
  }
  if (mode === "mock") {
    return (
      <span
        className="font-mono uppercase inline-flex items-center gap-1 shrink-0"
        style={{
          fontSize: "9px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.08em",
          opacity: 0.85,
          padding: "2px 5px",
          border: "1px solid var(--border)",
          borderRadius: "4px",
        }}
      >
        Mock
      </span>
    )
  }
  return (
    <span
      className="font-mono uppercase inline-flex items-center gap-1 shrink-0"
      style={{
        fontSize: "9px",
        color: "var(--muted-foreground)",
        letterSpacing: "0.08em",
        opacity: 0.7,
      }}
    >
      —
    </span>
  )
}
