"use client"

/**
 * MarketsPageClient (v3 — Loopr-density)
 *
 * Tightened composition: heading + 5-stat strip on top, dense
 * markets table below. Stats strip uses a single accent StripeCard
 * divider for visual unity. Featured grid is dropped — the table
 * already surfaces priority markets — keeping the page dense and
 * without an "admin" feel.
 */

import * as React from "react"
import MarketsTable from "@/components/markets/markets-table"
import type { LendingMarket, LendingServiceResult } from "@/lib/markets/lending"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import {
  formatApy,
  formatCompact,
  formatUtilization,
} from "@/lib/markets/format"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

interface MarketsPageClientProps {
  initialResult: LendingServiceResult
  initialNowMs: number
}

const REFRESH_INTERVAL_MS = 30_000

type RowSourceMode =
  | "live"
  | "real-morpho"
  | "real-morpho-unlisted"
  | "mock"
  | "partial"
  | "empty"

function rowSourceMode(markets: LendingMarket[]): RowSourceMode {
  if (markets.length === 0) return "empty"
  const allReal = markets.every(
    (m) => m.sourceMode === "live" || m.sourceMode === "real-morpho",
  )
  if (allReal) return "real-morpho"
  return "real-morpho-unlisted"
}

export default function MarketsPageClient({
  initialResult,
  initialNowMs,
}: MarketsPageClientProps) {
  const initialMarkets = React.useMemo<LendingMarket[]>(() => {
    if (initialResult.kind === "error") return []
    return initialResult.payload.markets
  }, [initialResult])
  const initialFetchedAt = React.useMemo(
    () =>
      initialResult.kind === "error"
        ? new Date().toISOString()
        : initialResult.payload.fetchedAt,
    [initialResult],
  )
  const initialFailed = React.useMemo<string[]>(
    () => (initialResult.kind === "error" ? [] : initialResult.payload.failedSymbols),
    [initialResult],
  )
  const initialReason = React.useMemo<string | null>(
    () =>
      initialResult.kind === "partial" || initialResult.kind === "empty"
        ? initialResult.reason
        : null,
    [initialResult],
  )
  const initialStateKind = initialResult.kind

  const [markets, setMarkets] = React.useState<LendingMarket[]>(initialMarkets)
  const [fetchedAt, setFetchedAt] = React.useState<string>(initialFetchedAt)
  const [failedSymbols, setFailedSymbols] =
    React.useState<string[]>(initialFailed)
  const [partialReason, setPartialReason] =
    React.useState<string | null>(initialReason)
  const [stale, setStale] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    initialStateKind === "error" ? initialResult.message : null,
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
      setFailedSymbols(result.payload.failedSymbols)
      setPartialReason(
        result.kind === "partial" || result.kind === "empty"
          ? result.reason
          : null,
      )
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

  const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
  const protocolReady =
    contracts.morphoBlueAddress != null &&
    contracts.morphoBlueAddress !== "0x"

  const stats = React.useMemo(() => {
    const total = markets.length
    const totalSupply = markets.reduce((s, m) => s + (m.totalSupply ?? 0), 0)
    const totalBorrow = markets.reduce((s, m) => s + (m.totalBorrow ?? 0), 0)
    const totalLiquidity = markets.reduce(
      (s, m) => s + (m.availableLiquidity ?? 0),
      0,
    )
    const avgSupplyApy = average(markets.map((m) => m.supplyApy))
    const avgUtilization = average(markets.map((m) => m.utilization))
    return {
      total,
      totalSupply,
      totalBorrow,
      totalLiquidity,
      avgSupplyApy,
      avgUtilization,
    }
  }, [markets])

  return (
    <div className="w-full max-w-[1080px] mx-auto" data-markets-page>
      {/* Page heading */}
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            MARKETS
          </span>
          <h1 className="font-serif text-3xl md:text-[34px] leading-[1.1] tracking-tight text-foreground mt-1.5">
            Lending markets
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Onchain lending opportunities on Robinhood Chain.
          </p>
        </div>
        <StatusPill
          stale={stale}
          error={errorMessage}
          protocolReady={protocolReady}
        />
      </div>

      {/* Aggregate stat strip — 1-border unified */}
      {markets.length > 0 ? (
        <div
          className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border rounded-xl overflow-hidden"
          aria-label="Market aggregates"
        >
          <StatCell label="Markets" value={String(stats.total)} />
          <StatCell label="Total TVL" value={formatCompact(stats.totalSupply)} />
          <StatCell
            label="Liquidity"
            value={formatCompact(stats.totalLiquidity)}
          />
          <StatCell
            label="Avg Supply APY"
            value={formatApy(stats.avgSupplyApy)}
            accent
          />
          <StatCell
            label="Avg Util"
            value={formatUtilization(stats.avgUtilization)}
          />
        </div>
      ) : null}

      {/* Markets table */}
      <div className="mt-4">
        {errorMessage ? (
          <ServiceUnavailable onRetry={() => void refresh()} />
        ) : markets.length === 0 ? (
          <EmptyUniverse onRetry={() => void refresh()} />
        ) : (
          <MarketsTable
            markets={markets}
            failedSymbols={failedSymbols}
            loading={false}
            errorReason={null}
            stale={stale}
            onRetry={() => void refresh()}
          />
        )}
      </div>

      <p className="mt-3 text-[10px] font-mono tracking-wider text-muted-foreground/60">
        {partialReason ? "Some data may be unavailable · " : ""}
        Morpho · Robinhood Chain
      </p>
    </div>
  )
}

function StatusPill({
  stale,
  error,
  protocolReady,
}: {
  stale: boolean
  error: string | null
  protocolReady: boolean
}) {
  const tone = stale || error ? "warn" : protocolReady ? "ok" : "warn"
  const label = stale
    ? "Stale"
    : error
      ? "Data unavailable"
      : protocolReady
        ? "Live · Supply available"
        : "Live · Supply coming soon"
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium " +
        (tone === "ok"
          ? "bg-up/10 text-up"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
      }
      data-status={tone}
    >
      <span
        aria-hidden="true"
        className={
          "w-1.5 h-1.5 rounded-full " +
          (tone === "ok" ? "bg-up" : "bg-amber-500")
        }
      />
      {label}
    </span>
  )
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-card p-3.5">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[18px] mt-1 " +
          (accent ? "text-up" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  )
}

function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-6"
      role="alert"
      data-state="api-unavailable"
    >
      <p className="font-mono text-[10px] tracking-wider text-amber-700 dark:text-amber-300">
        DATA UNAVAILABLE
      </p>
      <p className="text-[14px] font-sans text-foreground mt-1.5">
        Live data unavailable
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center h-8 px-3 rounded-md bg-foreground text-background text-[11px] font-medium hover:opacity-90 transition-opacity"
      >
        Retry
      </button>
    </section>
  )
}

function EmptyUniverse({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="rounded-xl border border-dashed border-border bg-secondary/30 px-5 py-6"
      role="status"
      data-state="empty"
    >
      <p className="text-[14px] font-sans text-foreground">
        No lending markets available right now.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center h-8 px-3 rounded-md border border-border bg-card text-[11px] font-medium text-foreground hover:bg-secondary/60"
      >
        Refresh
      </button>
    </section>
  )
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  )
  if (finite.length === 0) return null
  const sum = finite.reduce((s, v) => s + v, 0)
  return sum / finite.length
}
