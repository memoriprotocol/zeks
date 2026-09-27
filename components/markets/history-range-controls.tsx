"use client"

/**
 * HistoryRangeControls
 *
 * The timeframe chip group rendered above the chart.
 *
 * UI-3 visual pass: soft sage / segmented design, 32px height,
 * rounded pill style matching the Markets toolbar.
 *
 * Always renders exactly the four supported ranges
 * (1H / 1D / 1W / 1M). Switching ranges is a safe local-only
 * operation; the parent chart owns the fetch lifecycle and will
 * surface honest empty / loading / error states for any range,
 * including the provider-not-configured case.
 *
 * No fabricated data. No new fetches.
 */

import * as React from "react"
import { HISTORY_RANGES, type HistoryRange } from "@/lib/markets/history/types"

interface HistoryRangeControlsProps {
  value: HistoryRange
  onChange: (next: HistoryRange) => void
}

export default function HistoryRangeControls({
  value,
  onChange,
}: HistoryRangeControlsProps) {
  return (
    <div
      role="group"
      aria-label="Chart timeframe"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "3px",
        borderRadius: "999px",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        height: "32px",
      }}
      data-testid="history-range-controls"
    >
      {HISTORY_RANGES.map((range) => {
        const selected = range === value
        return (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            aria-pressed={selected}
            style={{
              appearance: "none",
              border: "none",
              height: "100%",
              padding: "0 13px",
              borderRadius: "999px",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: 0,
              color: selected ? "var(--ink-foreground)" : "var(--muted-foreground)",
              backgroundColor: selected ? "var(--ink)" : "transparent",
              cursor: "pointer",
              transition: "background-color 140ms ease-out, color 140ms ease-out",
            }}
            data-testid={"history-range-" + range.toLowerCase()}
          >
            {range}
          </button>
        )
      })}
    </div>
  )
}
