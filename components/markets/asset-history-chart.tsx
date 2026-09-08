"use client"

/**
 * AssetHistoryChart
 *
 * Phase 2B — Asset Detail historical price chart (UI + state machine).
 *
 * Responsibilities:
 *
 *   - Owns its fetch lifecycle for the historical price series.
 *   - Reads / writes the small in-memory client cache so rapid
 *     timeframe switching feels instant when the data is fresh.
 *   - Renders ONE of six first-class states, mapped 1:1 from the
 *     `HistoryFetchResult` discriminated union:
 *
 *       LOADING                 -> geometry-matched skeleton
 *       READY                   -> real line, tooltip, range change
 *       EMPTY                   -> "Historical price data unavailable."
 *       PROVIDER_NOT_CONFIGURED -> "Historical data provider not configured."
 *       ERROR                   -> "Historical price data temporarily unavailable." + retry
 *       STALE                   -> last real data + stale badge
 *
 *   - Cancels in-flight requests when the user switches ranges
 *     (via AbortController on the upstream fetch). Old responses
 *     cannot overwrite newer selections.
 *   - Never blocks Asset Detail rendering. If the history service
 *     is unreachable, the asset header + price summary still show.
 *   - Never invents data. If the provider returns nothing, the
 *     chart says so explicitly.
 *
 * Chart library: `recharts` (already in package.json — no install
 * needed per the spec §05 reuse rule). We render a single-area
 * line chart with a custom tooltip. Recharts handles
 * responsiveness via `ResponsiveContainer`.
 */

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type {
  HistoryFetchResult,
  HistoryRange,
  HistoricalSeries,
  HistoricalPoint,
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

/** Chart geometry — kept identical to the Phase 2A placeholder. */
const CHART_HEIGHT_MOBILE = 220
const CHART_HEIGHT_DESKTOP = 260

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
  /**
   * `lastKnownSeries` retains the most recent READY/STALE series so
   * switching ranges back to one that is now EMPTY still shows the
   * prior real chart with a STALE badge (per spec state machine).
   */
  const [lastKnown, setLastKnown] = React.useState<HistoricalSeries | null>(null)
  /**
   * Hydration-stable initial value — comes from the server via the
   * `initialNowMs` prop so the "Updated Xs ago" label renders
   * identically on server and first client paint. Parent owns the
   * 5s tick interval.
   */
  const [nowMs, setNowMs] = React.useState<number>(initialNowMs)

  // We keep a reference to the current AbortController so we can
  // cancel in-flight requests when the user switches ranges.
  const inflightRef = React.useRef<AbortController | null>(null)

  const fetchSeries = React.useCallback(
    async (target: HistoryRange) => {
      // 1. Cancel any in-flight request for a previous range so its
      //    response cannot overwrite the new selection.
      if (inflightRef.current) {
        inflightRef.current.abort()
      }
      const controller = new AbortController()
      inflightRef.current = controller

      // 2. Permissive cache lookup. The cache only ever returns a
      //    usable READY/STALE result, never a non-data state.
      const cached = getCachedSeries(symbol, target)
      if (cached) {
        setResult(cached)
        if (cached.kind === "ready" || cached.kind === "stale") {
          setLastKnown(cached.series)
        }
        return
      }

      // 3. Otherwise, mark LOADING and fetch.
      setResult({ kind: "loading" })

      // Defensive timeout. The route also enforces its own ceiling.
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

        if (controller.signal.aborted) return // already cancelled

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

        // Update cache + retained chart fallback.
        if (next.kind === "ready" || next.kind === "stale") {
          setCachedSeries(symbol, target, next)
          setLastKnown(next.series)
        } else if (next.kind === "empty") {
          // No data: keep any prior `lastKnown` so the user still
          // sees the most recent real chart, marked STALE.
          //
          // (The STALE badge is rendered in the READY-with-fallback
          // path; here we just don't overwrite lastKnown.)
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

  // Fetch on mount and whenever the user changes range.
  React.useEffect(() => {
    void fetchSeries(range)
    return () => {
      // Cancel on unmount.
      if (inflightRef.current) inflightRef.current.abort()
    }
  }, [range, fetchSeries])

  // Lightweight "Updated Xs ago" ticker — same cadence as the
  // asset-header freshness indicator, intentionally cheap.
  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000)
    return () => window.clearInterval(id)
  }, [])

  // Manual retry from the ERROR state. Drops the in-memory entry
  // (if any) and refetches.
  const onRetry = React.useCallback(() => {
    invalidateCachedSeries(symbol, range)
    void fetchSeries(range)
  }, [fetchSeries, range, symbol])

  return (
    <section
      aria-label={`${symbol} price history`}
      data-testid="asset-history-chart"
      className="bg-card border border-border rounded-xl p-5 md:p-6"
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
    </section>
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
  const meta = HISTORY_RANGE_META[range]
  // Range-change badge is only meaningful when we actually have
  // enough real points to compute it. We surface it from the chart
  // body via a CSS class marker; this header keeps the structural
  // copy.
  const seriesFreshnessLabel =
    result.kind === "ready" || result.kind === "stale"
      ? `${meta.durationLabel} · multiplier-adjusted`
      : null

  return (
    <header className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="font-serif text-[18px] md:text-[20px] leading-tight text-foreground">
          Price history
        </h2>
        <p className="text-[10px] font-mono tracking-wider text-muted-foreground/70 mt-1">
          {symbol} ·{" "}
          {seriesFreshnessLabel ?? "provider-pending"}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {result.kind === "ready" || result.kind === "stale" ? (
          <FreshnessChip
            fetchedAt={result.series.generatedAt}
            nowMs={nowMs}
            stale={result.kind === "stale"}
          />
        ) : null}
        <HistoryRangeControls value={range} onChange={onRangeChange} />
      </div>
    </header>
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
    <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-muted-foreground">
      <span aria-hidden="true" className="relative inline-flex w-1.5 h-1.5">
        <span
          className={
            "absolute inset-0 rounded-full opacity-70 animate-ping " +
            (stale ? "bg-destructive" : "bg-primary")
          }
        />
        <span
          className={
            "relative inline-block w-1.5 h-1.5 rounded-full " +
            (stale ? "bg-destructive" : "bg-primary")
          }
        />
      </span>
      <span data-testid="history-freshness">
        Updated {relativeUpdated(fetchedAt, nowMs)} ·{" "}
        {absoluteTimestamp(fetchedAt)}
      </span>
      {stale ? (
        <span
          className="ml-1 px-1.5 h-5 inline-flex items-center rounded bg-destructive/10 border border-destructive/30 text-destructive"
          data-testid="history-stale-badge"
        >
          STALE
        </span>
      ) : null}
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
  // If the latest fetch yielded an EMPTY/ERROR/PROVIDER_NOT_CONFIGURED
  // state but we still have a known real series, fall back to the
  // most recent one with a STALE wrapper.
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

  // Geometry — identical to the Phase 2A placeholder so the page
  // never jumps when Phase 2B lands.
  const heightClass =
    "h-[220px] md:h-[260px]"

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
        <ChartFootnote
          series={effective.series}
          range={range}
          stale={effective.kind === "stale"}
          staleReason={
            effective.kind === "stale" ? effective.reason : null
          }
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
        title="Historical data provider not configured."
        hint={`Add RHRPC_API_KEY to .env.local to enable historical charts for ${symbol}.`}
        testId="history-chart-provider-pending"
      />
    )
  }

  // ERROR — the only state with a retry affordance.
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
          className="h-8 px-3 text-[11px] font-mono tracking-wider rounded-md border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          data-testid="history-chart-retry"
        >
          RETRY
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Skeleton (geometry-matched loading state)                                  */
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
      {/* Geometry-matched horizontal grid lines so the skeleton has
          the same visual mass as the rendered chart. NO chart line,
          NO fake data points. */}
      <div className="absolute inset-0 flex flex-col">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 border-t border-border/60 first:border-t-0"
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-mono tracking-wider text-muted-foreground/70 bg-card/80 px-3 py-1 rounded-md border border-border">
          {message}
        </span>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Generic message surface (EMPTY / PROVIDER_NOT_CONFIGURED / ERROR header)   */
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
        <div className="text-[12px] font-mono tracking-wider text-foreground">
          {title}
        </div>
        {hint ? (
          <div className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground/80">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Real chart                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Compute `rangeChange` / `rangeChangePct` from the FIRST and LAST
 * real points. Returns `null` for either side when there are fewer
 * than two points OR the first price is non-positive. We NEVER
 * compute a change from the live bid/ask to fake one.
 */
function computeRangeChange(points: HistoricalPoint[]): {
  absolute: number | null
  percent: number | null
} {
  if (points.length < 2) return { absolute: null, percent: null }
  const first = points[0]
  const last = points[points.length - 1]
  if (
    !Number.isFinite(first.price) ||
    !Number.isFinite(last.price) ||
    first.price <= 0
  ) {
    return { absolute: null, percent: null }
  }
  const absolute = last.price - first.price
  const percent = (absolute / first.price) * 100
  return { absolute, percent }
}

/** Build the Recharts dataset — only the fields it needs. */
type ChartDatum = { ts: number; price: number }

function toChartData(points: HistoricalPoint[]): ChartDatum[] {
  return points.map((p) => ({ ts: p.timestamp, price: p.price }))
}

/** Decide whether to render a green or red line based on the range move. */
function changeTone(absolute: number | null): "up" | "down" | "neutral" {
  if (absolute === null) return "neutral"
  if (absolute > 0) return "up"
  if (absolute < 0) return "down"
  return "neutral"
}

function PriceChart({
  series,
  range,
  isStale,
}: {
  series: HistoricalSeries
  range: HistoryRange
  isStale: boolean
}) {
  const data = React.useMemo(() => toChartData(series.points), [series.points])
  const change = React.useMemo(() => computeRangeChange(series.points), [series.points])
  const tone = changeTone(change.absolute)

  const stroke =
    tone === "up"
      ? "var(--zeks-line-up, hsl(var(--primary)))"
      : tone === "down"
        ? "hsl(var(--destructive))"
        : "var(--zeks-line-neutral, hsl(var(--muted-foreground)))"

  const fillTop =
    tone === "up"
      ? "var(--zeks-area-up-top, hsl(var(--primary) / 0.18))"
      : tone === "down"
        ? "hsl(var(--destructive) / 0.18)"
        : "hsl(var(--muted-foreground) / 0.10)"

  // Pre-compute y-axis bounds with a small breathing margin so the
  // line never kisses the top/bottom edge.
  const { yMin, yMax } = React.useMemo(() => {
    if (data.length === 0) return { yMin: 0, yMax: 1 }
    let min = Infinity
    let max = -Infinity
    for (const d of data) {
      if (d.price < min) min = d.price
      if (d.price > max) max = d.price
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.02
      return { yMin: min - pad, yMax: max + pad }
    }
    const pad = (max - min) * 0.08
    return { yMin: min - pad, yMax: max + pad }
  }, [data])

  const rangeChange = change.absolute
  const rangeChangePct = change.percent

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          {HISTORY_RANGE_META[range].durationLabel.toUpperCase()} CHANGE
        </span>
        {rangeChange === null ? (
          <span className="font-mono tabular-nums text-sm text-muted-foreground">
            —
          </span>
        ) : (
          <>
            <span
              className={
                "font-mono tabular-nums text-sm " +
                (rangeChange > 0
                  ? "text-foreground"
                  : rangeChange < 0
                    ? "text-destructive"
                    : "text-muted-foreground")
              }
              data-testid="history-range-change"
            >
              {rangeChange >= 0 ? "+" : ""}
              {formatUsd(rangeChange, 2)}
            </span>
            {rangeChangePct !== null ? (
              <span
                className={
                  "font-mono tabular-nums text-[11px] " +
                  (rangeChangePct > 0
                    ? "text-foreground"
                    : rangeChangePct < 0
                      ? "text-destructive"
                      : "text-muted-foreground")
                }
                data-testid="history-range-change-pct"
              >
                ({rangeChangePct >= 0 ? "+" : ""}
                {rangeChangePct.toFixed(2)}%)
              </span>
            ) : null}
          </>
        )}
      </div>

      <div
        className="mt-3 h-[220px] md:h-[260px] rounded-lg border border-border bg-secondary/20 relative overflow-hidden"
        data-testid="history-chart-canvas"
        aria-label={`${series.symbol} price chart, ${HISTORY_RANGE_META[range].durationLabel}`}
        style={{ ["--zeks-line-tone" as string]: stroke }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <defs>
              <linearGradient id="zeks-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillTop} stopOpacity={1} />
                <stop
                  offset="100%"
                  stopColor={fillTop}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={xTickFormatter(range)}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              minTickGap={48}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => formatUsd(v, 2)}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              content={<ChartTooltip range={range} />}
              cursor={{
                stroke: "hsl(var(--muted-foreground))",
                strokeOpacity: 0.4,
                strokeDasharray: "3 3",
              }}
            />
            {data.length > 0 ? (
              <ReferenceLine
                y={data[0].price}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.35}
                strokeDasharray="2 4"
                ifOverflow="extendDomain"
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="price"
              stroke={stroke}
              strokeWidth={1.5}
              fill="url(#zeks-area-fill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 3,
                stroke: stroke,
                strokeWidth: 1.5,
                fill: "hsl(var(--card))",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
        {isStale ? (
          <div className="pointer-events-none absolute inset-0 bg-background/40" />
        ) : null}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* X-axis tick formatter — chosen per range for readable density              */
/* ────────────────────────────────────────────────────────────────────────── */

function xTickFormatter(
  range: HistoryRange,
): (value: number) => string {
  switch (range) {
    case "1H":
      return (v) => {
        const d = new Date(v * 1000)
        const hh = String(d.getHours()).padStart(2, "0")
        const mm = String(d.getMinutes()).padStart(2, "0")
        return `${hh}:${mm}`
      }
    case "1D":
      return (v) => {
        const d = new Date(v * 1000)
        const hh = String(d.getHours()).padStart(2, "0")
        const mm = String(d.getMinutes()).padStart(2, "0")
        return `${hh}:${mm}`
      }
    case "1W":
      return (v) => {
        const d = new Date(v * 1000)
        const weekday = d.toLocaleDateString("en-US", {
          weekday: "short",
        })
        return weekday
      }
    case "1M":
      return (v) => {
        const d = new Date(v * 1000)
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Custom tooltip — production-quality, ZEKS typography                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ChartDatum }>
  range: HistoryRange
}

function ChartTooltip({ active, payload, range }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload
  if (!datum) return null

  const ts = new Date(datum.ts * 1000)
  const time = ts.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return (
    <div
      className="bg-card border border-border rounded-md px-3 py-2 shadow-sm min-w-[160px]"
      data-testid="history-chart-tooltip"
    >
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {time}
      </div>
      <div className="font-mono tabular-nums text-sm text-foreground mt-0.5">
        {formatUsd(datum.price, 4)}
      </div>
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70 mt-1">
        {HISTORY_RANGE_META[range].durationLabel} · multiplier-adjusted
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Footnote (line under the chart)                                            */
/* ────────────────────────────────────────────────────────────────────────── */

function ChartFootnote({
  series,
  range,
  stale,
  staleReason,
}: {
  series: HistoricalSeries
  range: HistoryRange
  stale: boolean
  staleReason: string | null
}) {
  return (
    <p
      className="mt-3 text-[10px] font-mono tracking-wider text-muted-foreground/70"
      data-testid="history-chart-footnote"
    >
      {`${series.points.length} points · ${HISTORY_RANGE_META[range].durationLabel} · ${series.source} · ${series.priceSemantics}`}
      {stale && staleReason ? ` · ${staleReason}` : null}
    </p>
  )
}
