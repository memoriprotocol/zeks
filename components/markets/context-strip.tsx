"use client"

/**
 * ContextStrip (v3 — replaces MarketTickerStrip)
 *
 * Loopr-density context strip rendered under the header. Single 32px
 * row that surfaces only what matters for a lending app:
 *   - Robinhood Chain "feed" indicator
 *   - Quick links to key markets
 *   - Refresh / freshness stamp
 *
 * No per-asset prices (those belong in the Earn table).
 */

import * as React from "react"
import Link from "next/link"
import { resolveTickerSymbols, TICKER_MAX_VISIBLE } from "@/lib/markets/client"

interface ContextStripProps {
  assets: { symbol: string }[]
  fetchedAt: string
  loading?: boolean
  errorReason?: string | null
}

const REFRESH_INTERVAL_MS = 30_000

export default function ContextStrip({
  assets,
  fetchedAt,
  loading,
  errorReason,
}: ContextStripProps) {
  const [now, setNow] = React.useState(() => Date.now())

  const symbols = React.useMemo(() => {
    if (!assets || assets.length === 0) return []
    return resolveTickerSymbols(assets.map((a) => a.symbol))
  }, [assets])

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  React.useEffect(() => {
    return () => {
      // No long-lived async work — kept for symmetry.
      void REFRESH_INTERVAL_MS
    }
  }, [])

  if (!loading && symbols.length === 0) return null

  const visible = symbols.slice(0, TICKER_MAX_VISIBLE)

  return (
    <div className="h-8 border-b border-border bg-card/60 flex items-center px-4 md:px-6 text-[11px] text-muted-foreground shrink-0">
      <span className="inline-flex items-center gap-1.5 shrink-0 mr-4">
        <span
          aria-hidden="true"
          className="relative inline-flex w-1.5 h-1.5 shrink-0"
        >
          <span
            className={
              "absolute inset-0 rounded-full opacity-70 " +
              (errorReason ? "bg-amber-500" : "bg-primary animate-ping")
            }
          />
          <span
            className={
              "relative inline-block w-1.5 h-1.5 rounded-full " +
              (errorReason ? "bg-amber-500" : "bg-primary")
            }
          />
        </span>
        <span className="font-medium tracking-wider">
          {errorReason ? "Stale" : "Live"}
        </span>
        <span className="text-muted-foreground/70">·</span>
        <span>{loading ? "Loading…" : `${visible.length} priority markets`}</span>
      </span>

      {/* Slim scrollable market quick-links */}
      <div className="flex-1 min-w-0 hidden md:flex items-center gap-3 overflow-x-auto scrollbar-thin">
        {visible.slice(0, 6).map((sym) => (
          <Link
            key={sym}
            href={`/terminal/markets/${encodeURIComponent(sym)}`}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {sym}
          </Link>
        ))}
      </div>

      <span className="ml-auto hidden sm:inline-flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground/70">Updated</span>
        <span className="font-medium text-foreground/80">{timeAgo(fetchedAt, now)}</span>
      </span>
    </div>
  )
}

function timeAgo(iso: string, now: number): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, now - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}
