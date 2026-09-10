"use client"

/**
 * Markets page (ZEKS visual system · locked composition)
 *
 *   1. Page title + short description
 *   2. Compact market summary row
 *   3. Search + filters (toolbar)
 *   4. Dense market list / table (8 columns)
 *
 * Reuses locked tokens: --content-max · --card-soft · --dash-card-radius ·
 * --dash-card-pad · PageTitle · SectionTitle · MarketSummary · MarketsToolbar.
 * No admin chrome. Read-only. No backend changes.
 */

import * as React from "react"
import {
  PageTitle,
} from "@/components/zeks/page-title"
import { MarketSummary } from "@/components/zeks/markets/market-summary"
import {
  MarketsToolbar,
  type StatusFilter,
} from "@/components/zeks/markets/markets-toolbar"
import { MarketList } from "@/components/zeks/markets/market-list"
import type {
  LendingMarket,
} from "@/lib/markets/lending"

interface ApiResponse {
  ok: boolean
  markets: LendingMarket[]
  failedSymbols: string[]
  fetchedAt: string
  message?: string
}

interface MarketsPageClientProps {
  initialResult: {
    kind: "ok" | "partial" | "empty"
    payload: { markets: LendingMarket[]; failedSymbols: string[]; fetchedAt: string }
    message?: string
  } | {
    kind: "error"
    message: string
  }
  initialNowMs: number
}

const REFRESH_INTERVAL_MS = 30_000

export default function MarketsPageClient({
  initialResult,
  initialNowMs,
}: MarketsPageClientProps) {
  const initialMarkets = React.useMemo<LendingMarket[]>(() => {
    if (initialResult.kind === "error") return []
    return initialResult.payload.markets
  }, [initialResult])

  const initialFetchedAt = React.useMemo<string>(
    () =>
      initialResult.kind === "error"
        ? new Date(initialNowMs).toISOString()
        : initialResult.payload.fetchedAt,
    [initialResult, initialNowMs],
  )

  const [markets, setMarkets] = React.useState<LendingMarket[]>(initialMarkets)
  const [fetchedAt, setFetchedAt] =
    React.useState<string>(initialFetchedAt)
  const [stale, setStale] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    initialResult.kind === "error" ? initialResult.message : null,
  )

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/markets/lending")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ApiResponse = await res.json()
      if (!data.ok) throw new Error(data.message ?? "Unknown error")
      setMarkets(data.markets)
      setFetchedAt(data.fetchedAt)
      setStale(false)
      setErrorMessage(null)
    } catch {
      setStale(true)
    }
  }, [])

  React.useEffect(() => {
    const id = window.setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<StatusFilter>("all")

  return (
    <div
      className="zeks-page"
      data-testid="markets-root"
    >
      {/* 1 · Page title + short description */}
      <header className="zeks-block" style={{ gap: "var(--page-title-gap)" }}>
        <div className="zeks-page-title-row">
          <PageTitle>Markets</PageTitle>
          <span
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              letterSpacing: "0.04em",
            }}
          >
            {errorMessage
              ? "Live data unavailable"
              : `Updated ${relative(fetchedAt)}${stale ? " · stale" : ""}`}
          </span>
        </div>
        <p
          style={{
            fontSize: "var(--font-body)",
            lineHeight: 1.5,
            color: "var(--foreground)",
            opacity: 0.72,
            maxWidth: "62ch",
            marginTop: "-2px",
          }}
        >
          Every Morpho Blue market on Robinhood Chain where a curated
          tokenized equity is accepted as collateral. Click any row to
          inspect the onchain market.
        </p>
      </header>

      {/* 2 · Compact market summary */}
      <MarketSummary markets={markets} />

      {/* 3 · Search + filters */}
      <MarketsToolbar
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
        placeholder="Search markets (AAPL, TSLA, …)"
        testId="markets-list-toolbar"
      />

      {/* 4 · Dense market list / table */}
      {errorMessage && markets.length === 0 ? (
        <ServiceUnavailable onRetry={() => void refresh()} />
      ) : (
        <MarketList markets={markets} query={query} status={status} />
      )}
    </div>
  )
}

function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="markets-unavailable"
      className="border"
      role="alert"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        Data Unavailable
      </div>
      <p
        style={{
          fontSize: "var(--font-body)",
          lineHeight: 1.45,
          color: "var(--foreground)",
          marginTop: "8px",
        }}
      >
        We could not reach Morpho for the live market universe.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center transition-colors"
        style={{
          marginTop: "16px",
          padding: "6px 12px",
          fontSize: "12px",
          fontFamily: "var(--font-mono)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderRadius: "5px",
          background: "transparent",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--secondary)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
      >
        Retry
      </button>
    </div>
  )
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
