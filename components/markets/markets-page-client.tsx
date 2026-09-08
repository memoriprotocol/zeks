"use client"

/**
 * Markets page (ZEKS visual system · locked composition)
 *
 *   · PageTitle "Markets"
 *   · MarketSummary card                 (104px · 3 metrics)
 *   · SectionTitle "Curated"
 *   · FeaturedMarkets grid               (4-col desktop · 8 tickers)
 *   · SectionTitle "All markets"
 *   · MarketsToolbar (search + filter)
 *   · MarketList (dense table)
 *
 * Reuses: --content-max · --card-soft · --card-radius ·
 *         --dash-* tokens · PageTitle · SectionTitle · Section primitive.
 * No admin chrome. Read-only.
 */

import * as React from "react"
import { PageTitle, SectionTitle } from "@/components/zeks/page-title"
import { MarketSummary } from "@/components/zeks/markets/market-summary"
import {
  MarketsToolbar,
  type StatusFilter,
} from "@/components/zeks/markets/markets-toolbar"
import { FeaturedMarkets } from "@/components/zeks/markets/featured-markets"
import { MarketList } from "@/components/zeks/markets/market-list"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import type {
  LendingMarket,
  LendingServiceResult,
} from "@/lib/markets/lending"

interface MarketsPageClientProps {
  initialResult: LendingServiceResult
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
      const result = await fetchLendingMarkets(undefined, { debug: false })
      if (result.kind === "error") {
        setStale(true)
        return
      }
      setMarkets(result.payload.markets)
      setFetchedAt(result.payload.fetchedAt)
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

  // Featured toolbar state — independent of the full-list filter.
  // (Featured is curated so it doesn't honor status filter.)
  // Full-list toolbar state.
  const [listQuery, setListQuery] = React.useState("")
  const [listStatus, setListStatus] = React.useState<StatusFilter>("all")

  return (
    <div
      className="w-full mx-auto"
      style={{ maxWidth: "var(--content-max)" }}
      data-testid="markets-root"
    >
      <div
        className="px-5 md:px-6 pb-12"
        style={{
          paddingTop: "var(--dash-top-pad)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--dash-section-gap)",
        }}
      >
        {/* 1 · Page title */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <PageTitle>Markets</PageTitle>
          <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground/60">
            {errorMessage
              ? "Live data unavailable"
              : `Updated ${relative(fetchedAt)}${stale ? " · stale" : ""}`}
          </span>
        </div>

        {/* 2 · Compact summary */}
        <MarketSummary markets={markets} />

        {/* 3 · Curated tickers */}
        <section className="flex flex-col gap-3">
          <SectionTitle
            trailing={
              markets.length === 0
                ? null
                : "8 curated · priority order"
            }
          >
            Curated
          </SectionTitle>
          <FeaturedMarkets markets={markets} />
        </section>

        {/* 4 · All markets */}
        <section className="flex flex-col gap-3">
          <SectionTitle>All Markets</SectionTitle>
          {errorMessage && markets.length === 0 ? (
            <ServiceUnavailable onRetry={() => void refresh()} />
          ) : (
            <>
              <MarketsToolbar
                query={listQuery}
                onQueryChange={setListQuery}
                status={listStatus}
                onStatusChange={setListStatus}
                placeholder="Search markets (AAPL, TSLA, …)"
                testId="markets-list-toolbar"
              />
              <MarketList
                markets={markets}
                query={listQuery}
                status={listStatus}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="markets-unavailable"
      className="rounded-[14px] border border-border px-5 py-5"
      style={{ backgroundColor: "var(--card-soft)" }}
      role="alert"
    >
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase">
        Data Unavailable
      </div>
      <p className="text-[14px] text-foreground mt-2" style={{ lineHeight: 1.45 }}>
        We could not reach Morpho for the live market universe.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center justify-center rounded-[8px] border border-primary/40 bg-primary/15 text-foreground h-8 px-3 text-[12px] font-medium hover:bg-primary/25 transition-colors"
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
