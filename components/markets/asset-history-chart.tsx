"use client"

/**
 * AssetHistoryChart
 *
 * Phase 2B — Asset Detail historical price chart (state machine).
 * Phase E — Renderer swapped from `recharts` to TradingView
 *           `lightweight-charts` (`LightweightLineChart`).
 * Final pass — Card chrome stripped. The previous wrapper
 *           `bg-card border border-border rounded-xl p-5 md:p-6`
 *           is gone: this component is now rendered *inside* the
 *           outer unified chart card owned by `EarnDetail`. The
 *           component owns only:
 *
 *             • chart-card header (symbol · range · freshness)
 *             • timeframe controls
 *             • the chart itself (LightweightLineChart)
 *             • empty / loading / error surfaces
 *
 *           No second white card, no developer footnotes.
 *
 * Responsibilities (unchanged):
 *
 *   - Owns its fetch lifecycle for the historical price series.
 *   - Reads / writes the small in-memory client cache so rapid
 *     timeframe switching feels instant when the data is fresh.
 *   - Renders ONE of six first-class states, mapped 1:1 from the
 *     `HistoryFetchResult` discriminated union.
 *   - Cancels in-flight requests when the user switches ranges.
 *   - Never blocks Asset Detail rendering.
 *   - Never invents data.
 *
 * Chart library: `lightweight-charts` (TradingView, Inc.). We use
 * it purely as a renderer; the upstream data remains the existing
 * ZEKS history pipeline.
 */

import * as React from "react"

import type {
  HistoryFetchResult,
  HistoryRange,
  HistoricalSeries,
} from "@/lib/markets/history/types"
import {
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGE_META,
} from "@/lib/markets/history/range"
import {
  getCachedSeries,
  setCachedSeries,
  invalidateCachedSeries,
} from "./history-cache"
import HistoryRangeControls from "./history-range-controls"
import LightweightLineChart from "./lightweight-line-chart"
import {
  absoluteTimestamp,
  formatUsd,
  relativeUpdated,
} from "@/lib/markets/client"

/**
 * Hard upper bound on how long we wait for a single fetch.
 * The server route also races against its own 8 s timeout, so
 * this is just a defensive client-side ceiling.
 */
const FETCH_TIMEOUT_MS = 10_000

interface AssetHistoryChartProps {
  symbol: string
  /** Server-rendered `Date.now()` — injected by the parent so hydration
   *  is stable. The parent owns the 5s tick interval. */
  initialNowMs: number
}

export default function AssetHistoryChart({ symbol, initialNowMs }: AssetHistoryChartProps) {
  const [range, setRange] = React.useState<HistoryRange>(DEFAULT_HISTORY_RANGE)
  const [result, setResult] = React.useState<HistoryFetchResult>({
    kind: "loading",
  })
  const [lastKnown, setLastKnown] = React.useState<HistoricalSeries | null>(null)
  const [nowMs, setNowMs] = React.useState<number>(initialNowMs)

  // We keep a reference to the current AbortController so we can
  // cancel in-flight requests when the user switches ranges.
  const inflightRef = React.useRef<AbortController | null>(null)

  const fetchSeries = React.useCallback(
    async (target: HistoryRange) => {
      if (inflightRef.current) {
        inflightRef.current.abort()
      }
      const controller = new AbortController()
      inflightRef.current = controller

      const cached = getCachedSeries(symbol, target)
      if (cached) {
        setResult(cached)
        if (cached.kind === "ready" || cached.kind === "stale") {
          setLastKnown(cached.series)
        }
        return
      }

      setResult({ kind: "loading" })

      const timeoutId = window.setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS,
      )

      try {
        const res = await fetch(
          `/api/markets/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(target)}`,
          { signal: controller.signal },
        )
        const body = (await res.json()) as {
          ok: boolean
          series?: HistoricalSeries | null
          result?: HistoryFetchResult
          message?: string
        }

        if (controller.signal.aborted) return

        if (!res.ok || !body.ok || !body.result) {
          setResult({
            kind: "error",
            symbol,
            range: target,
            message: body.message ?? "Request failed.",
          })
          return
        }

        const next: HistoryFetchResult = body.result
        setResult(next)

        if (next.kind === "ready" || next.kind === "stale") {
          setCachedSeries(symbol, target, next)
          setLastKnown(next.series)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        const message =
          err instanceof Error ? err.message : "Network error."
        setResult({
          kind: "error",
          symbol,
          range: target,
          message,
        })
      } finally {
        window.clearTimeout(timeoutId)
        if (inflightRef.current === controller) {
          inflightRef.current = null
        }
      }
    },
    [symbol],
  )

  React.useEffect(() => {
    void fetchSeries(range)
    return () => {
      if (inflightRef.current) inflightRef.current.abort()
    }
  }, [range, fetchSeries])

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000)
    return () => window.clearInterval(id)
  }, [])

  const onRetry = React.useCallback(() => {
    invalidateCachedSeries(symbol, range)
    void fetchSeries(range)
  }, [fetchSeries, range, symbol])

  return (
    <div
      aria-label={`${symbol} price history`}
      data-testid="asset-history-chart"
      className="flex flex-col"
    >
      <ChartHeader
        symbol={symbol}
        range={range}
        onRangeChange={setRange}
        result={result}
        nowMs={nowMs}
      />

      <ChartBody
        symbol={symbol}
        range={range}
        result={result}
        lastKnown={lastKnown}
        onRetry={onRetry}
      />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Header                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function ChartHeader({
  symbol,
  range,
  onRangeChange,
  result,
  nowMs,
}: {
  symbol: string
  range: HistoryRange
  onRangeChange: (r: HistoryRange) => void
  result: HistoryFetchResult
  nowMs: number
}) {
  const lastPoint =
    result.kind === "ready" || result.kind === "stale"
      ? result.series.points[result.series.points.length - 1]
      : null
  const hasData = lastPoint != null
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}
      data-testid="history-header"
    >
      <div className="min-w-0">
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--muted-foreground)",
            letterSpacing: 0,
          }}
        >
          Historical price
        </div>
        <div
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "26px",
            fontWeight: 500,
            color: "var(--foreground)",
            marginTop: "4px",
            letterSpacing: "-0.018em",
            lineHeight: 1.1,
          }}
          data-field="historical-price"
        >
          {lastPoint
            ? `$${lastPoint.price.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : "—"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            marginTop: "6px",
            fontWeight: 400,
            letterSpacing: 0,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <span>
            {symbol} · {HISTORY_RANGE_META[range].durationLabel}
          </span>
          {hasData ? (
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                color: "var(--muted-foreground)",
                fontWeight: 400,
              }}
            >
              Latest stored sample · {relativeUpdated(result.kind === "ready" || result.kind === "stale" ? (result.series.generatedAt ?? null) : null, nowMs)}
            </span>
          ) : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <HistoryRangeControls value={range} onChange={onRangeChange} />
      </div>
    </div>
  )
}

function FreshnessChip({
  fetchedAt,
  nowMs,
  stale,
}: {
  fetchedAt: string | undefined
  nowMs: number
  stale: boolean
}) {
  if (!fetchedAt) return null
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 10px",
        borderRadius: "999px",
        backgroundColor: stale ? "var(--background)" : "var(--up-soft)",
        color: stale ? "var(--down-strong)" : "var(--up-strong)",
        fontFamily: "var(--font-sans)",
        fontSize: "11.5px",
        fontWeight: 500,
        letterSpacing: 0,
        whiteSpace: "nowrap",
        border: stale
          ? "1px solid var(--border)"
          : "1px solid transparent",
      }}
      data-testid="history-freshness"
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "999px",
          backgroundColor: stale ? "var(--down-strong)" : "var(--up-strong)",
        }}
      />
      Updated {relativeUpdated(fetchedAt, nowMs)}
      {stale ? " · stale" : ""}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Body — state dispatch                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function ChartBody({
  symbol,
  range,
  result,
  lastKnown,
  onRetry,
}: {
  symbol: string
  range: HistoryRange
  result: HistoryFetchResult
  lastKnown: HistoricalSeries | null
  onRetry: () => void
}) {
  const effective: HistoryFetchResult =
    result.kind === "ready" ||
    result.kind === "stale" ||
    result.kind === "loading"
      ? result
      : lastKnown
        ? {
            kind: "stale",
            series: lastKnown,
            reason:
              result.kind === "empty"
                ? "No data for this range — showing the most recent real series."
                : result.kind === "error"
                  ? "Upstream error — showing the most recent real series."
                  : result.kind === "provider-not-configured"
                    ? "Provider not configured — showing the most recent real series."
                    : "Showing the most recent real series.",
          }
        : result

  const heightClass = "h-[240px] md:h-[340px]"

  if (effective.kind === "loading") {
    return (
      <ChartSkeleton
        heightClass={heightClass}
        message="Loading historical data…"
      />
    )
  }

  if (effective.kind === "ready" || effective.kind === "stale") {
    return (
      <div data-testid="history-chart-ready">
        <PriceChart
          series={effective.series}
          range={range}
          isStale={effective.kind === "stale"}
        />
      </div>
    )
  }

  if (effective.kind === "empty") {
    return (
      <ChartMessage
        heightClass={heightClass}
        title="Historical price data unavailable."
        hint={`No data for ${symbol} over the ${HISTORY_RANGE_META[range].durationLabel} range.`}
        testId="history-chart-empty"
      />
    )
  }

  if (effective.kind === "provider-not-configured") {
    return (
      <ChartMessage
        heightClass={heightClass}
        title="Historical price data is not available yet."
        hint="Price history will appear here when historical data is available."
        testId="history-chart-provider-pending"
      />
    )
  }

  return (
    <div data-testid="history-chart-error">
      <ChartMessage
        heightClass={heightClass}
        title="Historical price data temporarily unavailable."
        hint={`${symbol} · ${HISTORY_RANGE_META[range].durationLabel} · ${
          effective.message ?? "Unknown error."
        }`}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRetry}
          className="h-8 px-3 zeks-eyebrow rounded-md border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          data-testid="history-chart-retry"
        >
          RETRY
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Skeleton                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function ChartSkeleton({
  heightClass,
  message,
}: {
  heightClass: string
  message: string
}) {
  return (
    <div
      className={
        "mt-4 rounded-lg border border-border bg-secondary/30 relative overflow-hidden " +
        heightClass
      }
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid="history-chart-skeleton"
    >
      <div className="absolute inset-0 flex flex-col">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 border-t border-border/60 first:border-t-0"
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          style={{
            fontFamily:
              "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
            fontSize: 12,
            color: "var(--muted-foreground)",
          }}
        >
          {message}
        </span>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Empty / Provider / Error surfaces                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function ChartMessage({
  heightClass,
  title,
  hint,
  testId,
}: {
  heightClass: string
  title: string
  hint?: string
  testId?: string
}) {
  return (
    <div
      className={
        "mt-4 rounded-lg border border-border bg-secondary/30 relative overflow-hidden flex items-center justify-center " +
        heightClass
      }
      data-testid={testId}
    >
      <div className="text-center px-4 max-w-md">
        <div
          style={{
            fontFamily:
              "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
            fontSize: 13,
            color: "var(--foreground)",
          }}
        >
          {title}
        </div>
        {hint ? (
          <div
            style={{
              fontFamily:
                "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
              fontSize: 11.5,
              marginTop: 6,
              color: "var(--muted-foreground)",
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Real chart — Phase E renderer                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function PriceChart({
  series,
  range,
  isStale,
}: {
  series: HistoricalSeries
  range: HistoryRange
  isStale: boolean
}) {
  const { absolute, percent } = React.useMemo(() => {
    if (series.points.length < 2)
      return { absolute: null as number | null, percent: null as number | null }
    const first = series.points[0]
    const last = series.points[series.points.length - 1]
    if (
      !Number.isFinite(first.price) ||
      !Number.isFinite(last.price) ||
      first.price <= 0
    )
      return { absolute: null as number | null, percent: null as number | null }
    const diff = last.price - first.price
    return { absolute: diff, percent: (diff / first.price) * 100 }
  }, [series.points])

  const tone: "up" | "down" | "neutral" =
    absolute === null
      ? "neutral"
      : absolute > 0
        ? "up"
        : absolute < 0
          ? "down"
          : "neutral"
  const isUp = tone === "up"
  const isDown = tone === "down"

  const isSparse = series.points.length >= 1 && series.points.length <= 6

  return (
    <div className="mt-3">
      {/* ── Change indicator (real derived first→last) ───────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          {HISTORY_RANGE_META[range].durationLabel} change
        </span>
        {absolute !== null ? (
          <>
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13.5px",
                fontWeight: 500,
                letterSpacing: "-0.01em",
                color: isUp
                  ? "var(--up-strong)"
                  : isDown
                    ? "var(--down-strong)"
                    : "var(--muted-foreground)",
              }}
              data-testid="history-range-change"
            >
              {absolute >= 0 ? "+" : ""}
              {formatUsd(absolute, 2)}
            </span>
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12.5px",
                letterSpacing: 0,
                fontWeight: 500,
                color: isUp
                  ? "var(--up-strong)"
                  : isDown
                    ? "var(--down-strong)"
                    : "var(--muted-foreground)",
                opacity: 0.85,
              }}
              data-testid="history-range-change-pct"
            >
              {percent !== null && percent >= 0 ? "+" : ""}
              {percent !== null ? percent.toFixed(2) : "0.00"}%
            </span>
          </>
        ) : (
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            —
          </span>
        )}
      </div>

      {/* ── Chart canvas ────────────────────────────────────────────── */}
      <div
        className="mt-3 rounded-[14px] overflow-hidden h-[240px] md:h-[340px]"
        data-testid="history-chart-canvas"
        aria-label={`${series.symbol} price chart, ${HISTORY_RANGE_META[range].durationLabel}`}
      >
        <LightweightLineChart
          series={series}
          range={range}
          isStale={isStale}
        />
      </div>

      {/* ── Chart footer · very subtle sparse-data note ─────────── */}
      {isSparse ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "8px",
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            fontWeight: 400,
            color: "var(--muted-foreground)",
            opacity: 0.75,
            letterSpacing: 0,
          }}
          data-testid="history-sparse-note"
        >
          <span
            aria-hidden="true"
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "9999px",
              backgroundColor: "var(--muted-foreground)",
              opacity: 0.5,
              display: "inline-block",
            }}
          />
          History is still accumulating
        </div>
      ) : null}
    </div>
  )
}
