"use client"

/**
 * Markets page (ZEKS visual system · P2A polish)
 *
 *   1. Page heading (eyebrow · serif title · subtitle · status chip)
 *   2. Compact 4-cell market summary strip (matches P1A Stat rhythm)
 *   3. Toolbar (segmented status filter + search — 34px terminal height)
 *   4. Dense 8-column market list (P1A column header rhythm)
 *   5. Footer (terminal-meta row · markets count · source chips · chain)
 *
 * P2A scope: presentation-only. All data flow, ordering, filtering,
 * routing, and lifecycle derivation are unchanged from the previous
 * version. Reuses locked tokens: --content-max · --card-soft ·
 * --dash-card-radius · --dash-card-pad · MarketSummary ·
 * MarketsToolbar · MarketList.
 *
 * Lifecycle banner: when the loaded markets include any row whose
 * existing F12 `lifecycle` field is not "active", a single amber
 * banner is rendered above the toolbar. This reads the existing
 * `m.lifecycle` field only — no new lifecycle derivation is
 * performed here.
 */

import * as React from "react"
import { MarketSummary } from "@/components/zeks/markets/market-summary"
import {
  MarketsToolbar,
  type StatusFilter,
} from "@/components/zeks/markets/markets-toolbar"
import { MarketList } from "@/components/zeks/markets/market-list"
import { CURATED_STOCKS } from "@/lib/markets/loop/constants"
import type { LendingMarket } from "@/lib/markets/lending"

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

/**
 * Curated universe — 8 ZEKS stock tokens that the product surface
 * presents to users. The Markets page is a presentation layer over the
 * real Morpho dataset, so it filters its visible rows to this set
 * WITHOUT modifying the underlying API, backend data, lifecycle, or
 * discovery logic. Any symbol not in this set is silently dropped from
 * the page's view but is still fetched/persisted internally.
 *
 * Single source of truth for the curated 8 — shared with the Loop /
 * Earn / Borrow products via lib/markets/loop/constants.ts.
 */
const CURATED_SET: ReadonlySet<string> = new Set(CURATED_STOCKS)

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

  // ── Curated filter ────────────────────────────────────────────
  // Restrict the visible page universe to the 8 ZEKS-curated stock
  // tokens. Markets not in the curated set still exist in `markets`
  // (the page still polls them, preserves their lifecycle, and could
  // expose them later) but are not rendered here.
  const curatedMarkets = React.useMemo<LendingMarket[]>(
    () => markets.filter((m) => CURATED_SET.has(m.symbol)),
    [markets],
  )

  // P2A — read the existing F12 lifecycle field. No new derivation.
  // Compute counts for the small "active / non-active" banner.
  // Counts operate on the *curated* visible universe, not on the full
  // backend payload, so the lifecycle banner matches what users see.
  const lifecycleCounts = React.useMemo(() => {
    let active = 0
    let nonActive = 0
    for (const m of curatedMarkets) {
      if (m.lifecycle === "active") active += 1
      else nonActive += 1
    }
    return { active, nonActive }
  }, [curatedMarkets])

  const showLifecycleBanner =
    curatedMarkets.length > 0 && lifecycleCounts.nonActive > 0

  return (
    <div
      className="zeks-page"
      data-testid="markets-root"
      data-markets-list
      style={
        {
          // P2A — widen the Markets subtree to roughly full rail width
          // on desktop, matching the P1A Earn subtree layout. The
          // global --content-max token is untouched; this only widens
          // the Markets subtree.
          ["--content-max"]: "1600px",
          // P2A — vertical rhythm: section-to-section gap tightened to
          // 16px so the table fills the viewport without empty space.
          gap: "16px",
          // P2A — modest horizontal breathing room inside the rail so
          // the wider card does not visually kiss the edge.
          paddingInline: "16px",
        } as React.CSSProperties
      }
    >
      {/* 1 · Compact page heading (UI-2) — Markets · subtitle line ·
          tiny network pill aligned right. No large hero, no Live badge.
      */}
      <header
        className="zeks-page-title-row"
        style={{
          alignItems: "center",
          gap: "16px",
          rowGap: "10px",
          minHeight: 0,
        }}
        data-markets-header
      >
        <div
          className="zeks-block"
          style={{ gap: "4px", minWidth: 0, flex: "1 1 auto" }}
        >
          <span
            className="zeks-label"
            style={{
              color: "var(--muted-foreground)",
              letterSpacing: 0,
              fontWeight: 500,
            }}
          >
            Markets
          </span>
          <p
            style={{
              fontSize: "13.5px",
              color: "var(--muted-foreground)",
              lineHeight: 1.45,
              letterSpacing: 0,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
            }}
          >
            Tokenized equity lending markets on Robinhood Chain
          </p>
        </div>
        <span
          aria-label={
            errorMessage
              ? "Live data unavailable"
              : stale
                ? "Live data stale"
                : "Live data available"
          }
          data-markets-status={
            errorMessage ? "unavailable" : stale ? "stale" : "live"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "5px 11px",
            borderRadius: "999px",
            backgroundColor: errorMessage || stale
              ? "var(--background)"
              : "var(--up-soft)",
            color: errorMessage || stale
              ? "var(--muted-foreground)"
              : "var(--up-strong)",
            fontSize: "11.5px",
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
            lineHeight: 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "999px",
              backgroundColor: errorMessage || stale
                ? "var(--muted-foreground)"
                : "var(--up-strong)",
            }}
          />
          {errorMessage
            ? "Data unavailable"
            : stale
              ? "Stale"
              : "Live · chain 4663"}
        </span>
      </header>

      {/* 2 · Market summary — single composed sage container */}
      <MarketSummary markets={curatedMarkets} />

      {/* Lifecycle status — compact neutral notice (UI-2). No orange
          warning bar; lifecycle truth is preserved verbatim. */}
      {showLifecycleBanner ? (
        <LifecycleNotice
          active={lifecycleCounts.active}
          nonActive={lifecycleCounts.nonActive}
        />
      ) : curatedMarkets.length > 0 ? (
        <p
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "0 4px",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-sans)",
          }}
          data-markets-lifecycle-banner
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "999px",
              backgroundColor: "var(--up-strong)",
            }}
          />
          {lifecycleCounts.active === curatedMarkets.length
            ? `All ${lifecycleCounts.active} markets active`
            : `${lifecycleCounts.active} of ${curatedMarkets.length} active`}
        </p>
      ) : null}

      {/* 3 · Search + status filter */}
      <MarketsToolbar
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
        placeholder="Search AAPL, TSLA, NVDA…"
        testId="markets-list-toolbar"
      />

      {/* 4 · Market table — composed sage container */}
      {errorMessage && curatedMarkets.length === 0 ? (
        <ServiceUnavailable onRetry={() => void refresh()} />
      ) : (
        <MarketList markets={curatedMarkets} query={query} status={status} />
      )}

      {/* 5 · Footer — compact, no repeated technical metadata. */}
      <footer
        className="zeks-meta"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          padding: "4px 4px 0",
        }}
        data-markets-footer
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          Updated {relative(fetchedAt)}
          {stale ? " · stale" : ""}
        </span>
      </footer>
    </div>
  )
}

function LifecycleNotice({
  active,
  nonActive,
}: {
  active: number
  nonActive: number
}) {
  return (
    <p
      data-markets-lifecycle-banner
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "0 4px",
        fontSize: "12px",
        color: "var(--muted-foreground)",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        letterSpacing: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "999px",
          backgroundColor: "var(--muted-foreground)",
        }}
      />
      {nonActive} of {nonActive + active} unavailable ·{" "}
      {active} active
    </p>
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
        className="zeks-eyebrow"
        style={{
          color: "var(--muted-foreground)",
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
          fontSize: "12.5px",
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
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
