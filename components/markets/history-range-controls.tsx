"use client"

/**
 * HistoryRangeControls
 *
 * The timeframe chip group rendered above the chart.
 *
 * Behavior:
 *   - Always renders exactly the four supported ranges
 *     (1H / 1D / 1W / 1M). 1Y is intentionally absent for Phase 2B.
 *   - Buttons update local state only — they never fabricate data
 *     and never trigger an upstream call from the control itself.
 *     The parent chart owns the fetch lifecycle.
 *   - Selected range gets a lime accent and a subtle border;
 *     unselected ranges stay neutral.
 *   - Buttons are always clickable even when the provider is not
 *     configured: switching ranges must remain a safe local-only
 *     operation, and the chart will render the same provider-
 *     pending state for the new selection.
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
      className="inline-flex items-center rounded-md border border-border overflow-hidden bg-card"
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
            className={
              "h-8 px-3 text-[11px] font-mono tracking-wider border-r border-border last:border-r-0 transition-colors " +
              (selected
                ? "bg-primary/10 text-foreground"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/60")
            }
            data-testid={"history-range-" + range.toLowerCase()}
          >
            {range}
          </button>
        )
      })}
    </div>
  )
}
