"use client"

/**
 * MarketList — composed soft-sage container with 8-column market table
 * (UI-2 visual pass).
 *
 *   Columns: Asset · Price · LLTV · Supply APY · Borrow APY ·
 *            Liquidity · Utilization · Status
 *
 * UI-2 visual pass:
 *   · One composed container — soft `--card-soft` surface, ~18px radius,
 *     subtle border. No internal gap-px / grid lines.
 *   · Column headers: small muted sans labels — no uppercase / letter
 *     spacing nightmare.
 *   · Rows: ~64px, subtle bottom separator, clickable, subtle hover lift.
 *   · Asset column: 32-36px logo + prominent symbol + muted company name.
 *   · Financial numbers rendered in clean sans-serif (Inter/DM Sans).
 *     Mono reserved for hashes/addresses (not used here).
 *   · Status pills: small soft pill — restrained green / neutral grey,
 *     no orange or red unless semantically critical.
 *
 * Behavior (unchanged):
 *   · 8-col grid template used by both header and rows.
 *   · Row click navigates to /terminal/markets/[symbol].
 *   · Filter + search logic preserved.
 *   · Each cell renders "—" when its source field is missing.
 *
 * No admin chrome. Read-only. No new fetches.
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

/** 8-col grid template, used by both header and rows.
 *  Asset is wider; price columns share a tight rhythm. */
const COL_TEMPLATE =
  "minmax(0,2fr) minmax(0,1.05fr) minmax(0,0.7fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.9fr)"

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
    <div data-testid="market-list" data-markets-table>
      <section
        style={{
          backgroundColor: "var(--card-soft)",
          borderRadius: "18px",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Column header row — small muted sans labels. */}
        <div
          className="hidden md:grid items-center"
          style={{
            gridTemplateColumns: COL_TEMPLATE,
            columnGap: "16px",
            padding: "0 22px",
            height: "40px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--card-soft-hi)",
          }}
          data-markets-cols
        >
          <ColumnLabel align="right">Asset</ColumnLabel>
          <ColumnLabel align="right">Price</ColumnLabel>
          <ColumnLabel align="right">LLTV</ColumnLabel>
          <ColumnLabel align="right">Supply APY</ColumnLabel>
          <ColumnLabel align="right">Borrow APY</ColumnLabel>
          <ColumnLabel align="right">Liquidity</ColumnLabel>
          <ColumnLabel align="right">Utilization</ColumnLabel>
          <ColumnLabel align="right">Status</ColumnLabel>
        </div>

        {filtered.length === 0 ? (
          <p
            style={{
              padding: "32px 24px",
              fontSize: "13px",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-sans)",
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
      </section>

      <p
        style={{
          fontSize: "12px",
          color: "var(--muted-foreground)",
          marginTop: "14px",
          paddingLeft: "4px",
          letterSpacing: 0,
          fontFamily: "var(--font-sans)",
        }}
        data-markets-count
      >
        {filtered.length} of {markets.length} shown
      </p>
    </div>
  )
}

function ColumnLabel({
  align,
  children,
}: {
  align: "left" | "right"
  children: React.ReactNode
}) {
  return (
    <Cell align={align}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        {children}
      </span>
    </Cell>
  )
}

/* ── Single composed row ─────────────────────────────────────────── */

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
    const v =
      m.utilization > 1 ? m.utilization / 100 : m.utilization
    return v * 100
  }, [m.utilization])

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="market-list-row"
      className="w-full text-left transition-colors cursor-pointer focus:outline-none"
      style={{
        background: "transparent",
        border: "none",
        padding: "0",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor =
          "var(--card-soft-hi)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
      }}
    >
      {/* Desktop: 8-col grid, ~64px row height */}
      <div
        className="hidden md:grid items-center"
        style={{
          gridTemplateColumns: COL_TEMPLATE,
          columnGap: "16px",
          padding: "0 22px",
          height: "64px",
        }}
      >
        <AssetCell m={m} />
        <FinanceCell value={m.oraclePrice} format={(v) => formatPrice(v)} />
        <FinanceCell
          value={m.lltv}
          format={(v) => `${(v * 100).toFixed(1)}%`}
        />
        <FinanceCell
          value={m.supplyApy}
          format={(v) => formatApy(v)}
          tone="up"
        />
        <FinanceCell
          value={m.borrowApy}
          format={(v) => formatApy(v)}
        />
        <FinanceCell
          value={liquidity}
          format={(v) => formatCompact(v)}
        />
        <FinanceCell
          value={utilizationPct}
          format={(v) => formatPct(v)}
        />
        <StatusCell mode={m.sourceMode} live={m.status === "active"} />
      </div>

      {/* Mobile: stacked summary (still navigable) */}
      <div
        className="md:hidden flex items-center gap-3"
        style={{ padding: "16px 22px" }}
      >
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          rhLogoUrl={m.rhLogoUrl ?? undefined}
          contractAddress={m.contractAddress ?? m.rhContractAddress ?? undefined}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "15px",
              fontWeight: 500,
              color: "var(--foreground)",
              lineHeight: 1.1,
            }}
          >
            {m.symbol}
          </div>
          <div
            className="truncate"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
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
        />
      </div>
    </button>
  )
}

/* ── Cells ─────────────────────────────────────────────────────── */

function AssetCell({ m }: { m: LendingMarket }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <AssetLogo
        symbol={m.symbol}
        name={m.name ?? m.symbol}
        src={m.logoUrl ?? undefined}
        rhLogoUrl={m.rhLogoUrl ?? undefined}
        contractAddress={m.contractAddress ?? m.rhContractAddress ?? undefined}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--foreground)",
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
          }}
          className="truncate"
        >
          {m.symbol}
        </div>
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            marginTop: "4px",
            fontWeight: 400,
          }}
        >
          {m.name ?? m.symbol}
        </div>
      </div>
    </div>
  )
}

/**
 * FinanceCell — clean sans numerical cell with optional semantic tone.
 * No mono. No uppercase.
 */
function FinanceCell<T extends number | null>({
  value,
  format,
  tone,
}: {
  value: T
  format: (v: number) => string
  tone?: "up" | "down"
}) {
  const has = value != null && Number.isFinite(value)
  const color = !has
    ? "var(--muted-foreground)"
    : tone === "up"
      ? "var(--up-strong)"
      : tone === "down"
        ? "var(--down-strong)"
        : "var(--foreground)"

  return (
    <Cell align="right">
      <span
        className="tabular-nums"
        data-finance
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          fontWeight: 500,
          color,
          letterSpacing: "-0.012em",
          opacity: has ? 1 : 0.55,
        }}
      >
        {has ? format(value as number) : "—"}
      </span>
    </Cell>
  )
}

function StatusCell({
  mode,
  live,
}: {
  mode: LendingMarket["sourceMode"]
  live: boolean
}) {
  return (
    <Cell align="right">
      <StatusBadge mode={mode} live={live} />
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

/* ── Status pill — small, restrained ───────────────────────────── */

function StatusBadge({
  mode,
  live,
}: {
  mode: LendingMarket["sourceMode"]
  live: boolean
}) {
  // Live = real Morpho market whose lifecycle is active → soft green pill.
  if (mode === "real-morpho" && live) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 9px",
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          fontWeight: 500,
          color: "var(--up-strong)",
          backgroundColor: "var(--up-soft)",
          border: "1px solid transparent",
          borderRadius: "999px",
          lineHeight: 1,
          letterSpacing: 0,
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "999px",
            backgroundColor: "var(--up-strong)",
          }}
        />
        Live
      </span>
    )
  }
  // Unlisted = real Morpho but the lifecycle isn't active (AMZN-style
  // pre-listed state). Honest neutral pill — no orange, no red.
  if (mode === "real-morpho-unlisted") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 9px",
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          backgroundColor: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          lineHeight: 1,
          letterSpacing: 0,
          whiteSpace: "nowrap",
        }}
      >
        Unlisted
      </span>
    )
  }
  if (mode === "mock") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 9px",
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          backgroundColor: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          lineHeight: 1,
          letterSpacing: 0,
          whiteSpace: "nowrap",
        }}
      >
        Mock
      </span>
    )
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        fontFamily: "var(--font-sans)",
        fontSize: "11.5px",
        fontWeight: 500,
        color: "var(--muted-foreground)",
        border: "1px solid transparent",
        borderRadius: "999px",
        lineHeight: 1,
        opacity: 0.6,
      }}
    >
      —
    </span>
  )
}
