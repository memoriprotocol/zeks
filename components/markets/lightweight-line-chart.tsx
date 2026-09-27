"use client"

/**
 * LightweightLineChart
 *
 * UI-3 visual pass — TradingView Lightweight Charts renderer that
 * matches the supplied DEXORA reference.
 *
 * Render-only. Receives a `HistoricalSeries` (provider-neutral)
 * and draws it via `lightweight-charts`. Does NOT fetch or own
 * state — the parent `AssetHistoryChart` is the state machine.
 *
 * Uses ONLY real ZEKS history data already passed in. No mock,
 * no synthetic points, no interpolation.
 *
 * Visual language:
 *   - Thin green price line (when up)
 *   - Very soft translucent green area below the line
 *   - Sage / cream chart surface, thin horizontal guides
 *   - Subtle vertical crosshair, no decorative chrome
 *   - Honest no-data state: 0 or 1 point renders a clean note
 *     without fabricating movement.
 *   - ZEKS palette via CSS variables read from
 *     `getComputedStyle(document.documentElement)`.
 */

import * as React from "react"
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts"

import type {
  HistoricalPoint,
  HistoricalSeries,
  HistoryRange,
} from "@/lib/markets/history/types"
import { formatUsd } from "@/lib/markets/client"

interface LightweightLineChartProps {
  series: HistoricalSeries
  range: HistoryRange
  /** When true, render a translucent overlay to signal stale data. */
  isStale?: boolean
  /** Pixels. Caller is responsible for sizing the host. */
  height?: number
}

interface ZeksTokens {
  foreground: string
  border: string
  muted: string
  /** Color used for chart horizontal guides — soft but readable. */
  gridFaint: string
  up: string
  down: string
}

function readZeksTokens(): ZeksTokens {
  if (typeof window === "undefined") {
    return {
      foreground: "#1A1814",
      border: "#E6DFCF",
      muted: "#6B6555",
      // Slightly darker than the card surface so guidelines are
      // clearly readable without becoming a dashboard grid.
      gridFaint: "#E1D8C2",
      up: "#2E7D4F",
      down: "#B33A2A",
    }
  }
  const cs = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string): string =>
    cs.getPropertyValue(name).trim() || fallback
  return {
    foreground: pick("--foreground", "#1A1814"),
    border: pick("--border", "#E6DFCF"),
    muted: pick("--muted-foreground", "#6B6555"),
    // Slightly darker than the card-soft surface so guidelines are
    // clearly readable without becoming a dashboard grid.
    gridFaint: pick("--border-strong", "#D5CCB6"),
    up: pick("--up", "#2E7D4F"),
    down: pick("--down", "#B33A2A"),
  }
}

/**
 * Lightweight Charts expects Time = UTCTimestamp (seconds) for
 * line series. Our historical points are already UNIX seconds.
 */
function toLineData(points: HistoricalPoint[]): Array<{ time: Time; value: number }> {
  const sorted = points
    .filter(
      (p) =>
        Number.isFinite(p.timestamp) &&
        Number.isFinite(p.price) &&
        p.timestamp > 0 &&
        p.price > 0,
    )
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)

  // De-duplicate by timestamp (LWC requires strict ascending order).
  const seen = new Set<number>()
  const out: Array<{ time: Time; value: number }> = []
  for (const p of sorted) {
    if (seen.has(p.timestamp)) continue
    seen.add(p.timestamp)
    out.push({ time: p.timestamp as Time, value: p.price })
  }
  return out
}

/**
 * Compute the time-axis visible domain to use.
 *
 * - SPARSE data (≤6 samples): honor the user's instruction —
 *   fit the chart to the actual real samples with modest visual
 *   padding. We do NOT add, interpolate, duplicate, or synthesize
 *   samples. We only adjust the rendered X-domain so the real
 *   points use the available width naturally.
 * - DENSE data (>6 samples): fall back to the full selected range
 *   window via fitContent (the original behavior).
 *
 * Tooltip timestamps continue to resolve to the exact real samples.
 */
function chooseVisibleRange(
  data: Array<{ time: Time; value: number }>,
  chart: IChartApi,
) {
  if (data.length === 0) {
    chart.timeScale().fitContent()
    return
  }
  if (data.length === 1) {
    // Single point: center it with symmetric padding.
    const t = Number(data[0]!.time)
    const PAD = 60 // seconds of visual padding either side
    chart.timeScale().setVisibleRange({
      from: (t - PAD) as Time,
      to: (t + PAD) as Time,
    })
    return
  }
  if (data.length <= 6) {
    const first = Number(data[0]!.time)
    const last = Number(data[data.length - 1]!.time)
    const spread = Math.max(1, last - first)
    // ~25% padding on each side keeps real points breathing but uses
    // the width. Min 30s so even clustered samples get room.
    const pad = Math.max(30, Math.round(spread * 0.25))
    chart.timeScale().setVisibleRange({
      from: (first - pad) as Time,
      to: (last + pad) as Time,
    })
    return
  }
  // Dense data: use the full real range as before.
  chart.timeScale().fitContent()
}

function changeOf(points: HistoricalPoint[]): {
  absolute: number | null
  percent: number | null
} {
  if (points.length < 2) return { absolute: null, percent: null }
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return { absolute: null, percent: null }
  if (!Number.isFinite(first.price) || !Number.isFinite(last.price))
    return { absolute: null, percent: null }
  if (first.price <= 0) return { absolute: null, percent: null }
  const absolute = last.price - first.price
  return { absolute, percent: (absolute / first.price) * 100 }
}

export default function LightweightLineChart({
  series,
  range,
  isStale,
  height = 280,
}: LightweightLineChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<IChartApi | null>(null)
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null)
  const [legend, setLegend] = React.useState<{
    ts: number
    price: number
  } | null>(null)

  const data = React.useMemo(() => toLineData(series.points), [series.points])
  const change = React.useMemo(() => changeOf(series.points), [series.points])

  // Create / dispose chart instance bound to the host element.
  React.useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const tokens = readZeksTokens()
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: tokens.muted,
        fontFamily:
          "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        // UI-3B: drastically quieter grid. We render the lines
        // ourselves in a separate layer so the chart itself stays
        // pure-data. This avoids the "debug chart" look.
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.22, bottom: 0.22 },
        textColor: tokens.muted,
        ticksVisible: false,
        entireTextOnly: true,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: range === "1H" || range === "1D",
        secondsVisible: false,
        rightOffset: 14,
        barSpacing: 9,
        // Quiet axis: no horizontal line, no tick marks.
        fixLeftEdge: false,
      },
      crosshair: {
        mode: 1, // Magnet
        // Very subtle vertical crosshair. No horizontal crosshair
        // — keeps the chart uncluttered.
        vertLine: {
          color: tokens.muted,
          width: 1,
          style: 3,
          labelBackgroundColor: tokens.foreground,
        },
        horzLine: { visible: false },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    chartRef.current = chart

    // Determine initial stroke color (line tone) — same rule as before:
    // up=green, down=red, neutral=muted.
    const tone: "up" | "down" | "neutral" =
      change.absolute === null
        ? "neutral"
        : change.absolute > 0
          ? "up"
          : change.absolute < 0
            ? "down"
            : "neutral"
    const stroke =
      tone === "up"
        ? tokens.up
        : tone === "down"
          ? tokens.down
          : tokens.muted
    // Translucent fill under the line — also tied to the same tone.
    // Up=soft green, down=soft red, neutral=no fill.
    const fillTop =
      tone === "up"
        ? "rgba(46, 125, 79, 0.32)"
        : tone === "down"
          ? "rgba(179, 58, 42, 0.22)"
          : "rgba(110, 104, 87, 0.0)"
    const fillBottom =
      tone === "up"
        ? "rgba(46, 125, 79, 0.02)"
        : tone === "down"
          ? "rgba(179, 58, 42, 0.02)"
          : "rgba(110, 104, 87, 0.0)"

    // Area series renders the soft filled region below the price line.
    const area = chart.addSeries(AreaSeries, {
      lineColor: stroke,
      topColor: fillTop,
      bottomColor: fillBottom,
      lineWidth: 2 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: stroke,
      crosshairMarkerBackgroundColor: "#FFFFFF",
      // Sparse-data aware: render subtle real point markers when
      // the dataset is small. Dense ranges (>10) keep markers off.
      // Sparse is "almost always on" — never fabricate extra points.
      pointMarkersVisible: data.length > 0 && data.length <= 10,
      // Subtle, intentional point markers for the data points themselves.
      pointMarkersRadius: data.length <= 6 ? 3 : 0,
    })
    seriesRef.current = area

    area.setData(data)
    chooseVisibleRange(data, chart)

    const onCrosshair = (param: { time?: Time }) => {
      if (!param.time) {
        setLegend(null)
        return
      }
      const t =
        typeof param.time === "number" ? param.time : Number(param.time)
      const found = data.find((d) => d.time === t)
      if (found) {
        setLegend({ ts: Number(found.time), price: found.value })
        return
      }
      // Approximate nearest by binary search.
      if (data.length === 0) return
      let lo = 0
      let hi = data.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        const mt = Number(data[mid].time)
        if (mt < t) lo = mid + 1
        else hi = mid
      }
      const cand = data[lo]
      if (cand) setLegend({ ts: Number(cand.time), price: cand.value })
    }
    chart.subscribeCrosshairMove(onCrosshair)

    const ro = new ResizeObserver(() => {
      chart.applyOptions({})
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      chart.unsubscribeCrosshairMove(onCrosshair)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // Re-create chart when the underlying series identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.symbol, range])

  // Update data without recreating the chart.
  React.useEffect(() => {
    const line = seriesRef.current
    if (!line) return
    line.setData(data)
    const chart = chartRef.current
    if (chart) chooseVisibleRange(data, chart)
  }, [data])

  // Update stroke when tone changes (e.g. new fetch flipped direction).
  React.useEffect(() => {
    const line = seriesRef.current
    if (!line) return
    const tokens = readZeksTokens()
    const tone: "up" | "down" | "neutral" =
      change.absolute === null
        ? "neutral"
        : change.absolute > 0
          ? "up"
          : change.absolute < 0
            ? "down"
            : "neutral"
    const stroke =
      tone === "up"
        ? tokens.up
        : tone === "down"
          ? tokens.down
          : tokens.muted
    const fillTop =
      tone === "up"
        ? "rgba(46, 125, 79, 0.32)"
        : tone === "down"
          ? "rgba(179, 58, 42, 0.22)"
          : "rgba(110, 104, 87, 0.0)"
    const fillBottom =
      tone === "up"
        ? "rgba(46, 125, 79, 0.02)"
        : tone === "down"
          ? "rgba(179, 58, 42, 0.02)"
          : "rgba(110, 104, 87, 0.0)"
    line.applyOptions({
      lineColor: stroke,
      topColor: fillTop,
      bottomColor: fillBottom,
    })
  }, [change.absolute, change.percent])

  const tooFew = data.length < 2

  return (
    <div
      className="relative w-full"
      style={{ height }}
      data-testid="lw-chart-wrap"
    >
      {/* Crosshair legend — appears on hover. Subtle, positioned
          inline with the chart top. No developer copy. */}
      {legend ? (
        <div
          className="pointer-events-none absolute left-4 top-3 select-none"
          data-testid="lw-chart-legend"
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--foreground)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              padding: "5px 10px",
              borderRadius: "999px",
              letterSpacing: 0,
            }}
          >
            <span className="tabular-nums">{formatUsd(legend.price, 2)}</span>
            <span aria-hidden="true" style={{ color: "var(--muted-foreground)" }}>
              ·
            </span>
            <span style={{ color: "var(--muted-foreground)" }}>
              {formatCrosshairTime(legend.ts, range)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Stale veil — only when explicitly marked stale. */}
      {isStale ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--background)", opacity: 0.3 }}
        />
      ) : null}

      {/* Chart host. Empty-state handled honestly. */}
      {tooFew ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-testid="lw-chart-empty"
        >
          <p
            style={{
              fontFamily:
                "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
              fontSize: 12,
              letterSpacing: "0.01em",
              color: "var(--muted-foreground)",
            }}
          >
            Not enough points to draw a line.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="absolute inset-0"
          data-testid="lw-chart-host"
        />
      )}
    </div>
  )
}

function formatCrosshairTime(ts: number, range: HistoryRange): string {
  const d = new Date(ts * 1000)
  if (range === "1H" || range === "1D") {
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    const month = d.toLocaleDateString("en-US", { month: "short" })
    const day = d.getDate()
    return `${month} ${day} · ${hh}:${mm}`
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}
