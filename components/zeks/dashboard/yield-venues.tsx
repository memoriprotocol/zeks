"use client"

/**
 * YieldVenues — measured reference card system (matches stock cards).
 *
 *   · 3-column desktop grid · 16px gap · equal visual height
 *   · Card: p-5 · rounded-2xl · warm beige surface · thin border
 *   · Hierarchical sections separated by thin dividers
 *
 *   Each card:
 *     1. Header     — name (15px serif) + status chip
 *     2. Hero APY   — large serif number (up-color when live)
 *     3. Divider
 *     4. Stat strip — TVL · Liquidity
 *     5. Footer     — subtle source meta (truncated market id)
 *
 *   No fabricated values · honest "—" for unknown fields.
 */

import * as React from "react"
import { formatApy, formatCompact } from "@/lib/markets/format"
import type { YieldVenue } from "@/lib/markets/loop/types"

export interface YieldVenuesProps {
  venues: YieldVenue[]
  fetchedAt: string | null
}

export function YieldVenues({ venues, fetchedAt }: YieldVenuesProps) {
  return (
    <div
      data-testid="section-yield-venues"
      className="flex flex-col"
      style={{ gap: "var(--dash-heading-gap)" }}
    >
      {venues.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid"
          style={{
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--dash-card-gap)",
          }}
          data-testid="venue-grid"
        >
          {venues.map((v) => (
            <li key={v.id} className="h-full">
              <VenueCard venue={v} />
            </li>
          ))}
        </ul>
      )}

      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        {venues.length} venue{venues.length === 1 ? "" : "s"}
        {fetchedAt ? ` · updated ${relative(fetchedAt)}` : ""}
      </p>
    </div>
  )
}

/* ── Single venue card ──────────────────────────────── */

function VenueCard({ venue: v }: { venue: YieldVenue }) {
  return (
    <article
      className="flex flex-col h-full transition-colors duration-200"
      style={{
        padding: "22px",
        borderRadius: "18px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: "var(--dash-card-min-h)",
      }}
      data-testid="venue-card"
    >
      {/* Header */}
      <header
        className="flex items-start justify-between gap-2"
        style={{ paddingBottom: "14px" }}
      >
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-card-symbol)",
              color: "var(--foreground)",
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              fontWeight: 600,
            }}
          >
            {v.name}
          </div>
          {v.asset && (
            <div
              className="truncate"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--font-card-company)",
                color: "var(--muted-foreground)",
                marginTop: "4px",
                letterSpacing: 0,
                fontWeight: 500,
              }}
            >
              {v.asset} · {riskLabel(v.risk)}
            </div>
          )}
        </div>
        <StatusChip status={v.status} />
      </header>

      {/* APY hero */}
      <div
        style={{
          paddingTop: "20px",
          paddingBottom: "18px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            letterSpacing: 0,
            color: "var(--muted-foreground)",
            fontWeight: 500,
            marginBottom: "6px",
          }}
        >
          APY
        </div>
        <div
          className="zeks-num-lg"
          style={{
            color: v.apy != null ? "var(--up)" : "var(--muted-foreground)",
            opacity: v.apy != null ? 1 : 0.5,
            fontSize: "26px",
            letterSpacing: "-0.018em",
            fontWeight: 500,
            lineHeight: 1.1,
          }}
        >
          {v.apy != null ? formatApy(v.apy) : "—"}
        </div>
      </div>

      {/* Stat strip */}
      <dl
        className="grid grid-cols-2"
        style={{
          columnGap: "12px",
          paddingTop: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <StatField
          label="TVL"
          value={v.tvl != null ? formatCompact(v.tvl) : "—"}
        />
        <StatField
          label="Liquidity"
          value={v.liquidity != null ? formatCompact(v.liquidity) : "—"}
        />
      </dl>

      {/* Footer */}
      <div
        className="flex items-center justify-between"
        style={{ marginTop: "auto", paddingTop: "12px" }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          {sourceLabel(v.source)}
        </span>
        {v.marketId && (
          <span
            style={{
              fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "var(--muted-foreground)",
              fontWeight: 500,
              opacity: 0.7,
              fontVariantNumeric: "tabular-nums",
            }}
            title={v.marketId}
          >
            {shortMarketId(v.marketId)}
          </span>
        )}
      </div>
    </article>
  )
}

/* ── Atoms ───────────────────────────────────────────── */

function StatusChip({ status }: { status: YieldVenue["status"] }) {
  const label = statusText(status)
  const color = statusTone(status)
  const isLive = status === "live"
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "11px",
        color,
        letterSpacing: 0,
        fontWeight: 600,
        padding: "2px 8px",
        background: isLive
          ? "color-mix(in srgb, var(--up) 12%, transparent)"
          : "var(--secondary)",
        borderRadius: "999px",
        lineHeight: 1.2,
      }}
    >
      {isLive && (
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{ width: "5px", height: "5px", backgroundColor: color }}
        />
      )}
      {label}
    </span>
  )
}

function StatField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="zeks-label-inline">{label}</dt>
      <dd
        style={{
          color: "var(--foreground)",
          marginTop: "6px",
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </dd>
    </div>
  )
}

function EmptyState() {
  return (
    <p
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "12.5px",
        color: "var(--muted-foreground)",
        fontWeight: 500,
      }}
    >
      Yield venues are unavailable right now.
    </p>
  )
}

/* ── Helpers ────────────────────────────────────────── */

function statusText(s: YieldVenue["status"]): string {
  switch (s) {
    case "live":        return "LIVE"
    case "candidate":   return "CANDIDATE"
    case "inactive":    return "INACTIVE"
    case "stale":       return "STALE"
    case "unlisted":    return "UNLISTED"
    case "unavailable": return "UNAVAILABLE"
    case "mock":        return "MOCK"
  }
}

function statusTone(s: YieldVenue["status"]): string {
  switch (s) {
    case "live":        return "var(--up)"
    case "candidate":   return "var(--muted-foreground)"
    case "inactive":    return "var(--down)"
    case "stale":       return "var(--muted-foreground)"
    case "unlisted":    return "var(--muted-foreground)"
    case "unavailable": return "var(--down)"
    case "mock":        return "var(--down)"
  }
}

function riskLabel(r: YieldVenue["risk"]): string {
  switch (r) {
    case "low":    return "low risk"
    case "medium": return "med risk"
    case "high":   return "high risk"
  }
}

function sourceLabel(s: YieldVenue["source"]): string {
  switch (s) {
    case "morpho-supply":     return "Morpho · live"
    case "verified-onchain":  return "Verified · onchain"
    case "mock":              return "Mock"
  }
}

function shortMarketId(id: string): string {
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function relative(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
