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
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
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
      className="flex flex-col h-full"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: "var(--dash-card-min-h)",
      }}
      data-testid="venue-card"
    >
      {/* Header */}
      <header
        className="flex items-start justify-between gap-2"
        style={{ paddingBottom: "12px" }}
      >
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--font-card-symbol)",
              color: "var(--foreground)",
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            {v.name}
          </div>
          {v.asset && (
            <div
              className="font-mono truncate"
              style={{
                fontSize: "var(--font-card-company)",
                color: "var(--muted-foreground)",
                marginTop: "4px",
                letterSpacing: "0.02em",
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
          paddingTop: "12px",
          paddingBottom: "12px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="zeks-label" style={{ marginBottom: "2px" }}>
          APY
        </div>
        <div
          className="zeks-num-lg"
          style={{
            color: v.apy != null ? "var(--up)" : "var(--muted-foreground)",
            opacity: v.apy != null ? 1 : 0.5,
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
          paddingTop: "12px",
          paddingBottom: "12px",
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
        <span className="zeks-label">
          {sourceLabel(v.source)}
        </span>
        {v.marketId && (
          <span
            className="font-mono font-variant-numeric: tabular-nums"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              opacity: 0.7,
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

function StatField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="zeks-label-inline">{label}</dt>
      <dd
        className="zeks-num-md"
        style={{
          color: "var(--foreground)",
          marginTop: "3px",
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
      className="font-mono"
      style={{
        fontSize: "12px",
        color: "var(--muted-foreground)",
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
