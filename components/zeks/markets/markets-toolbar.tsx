"use client"

/**
 * MarketsToolbar — search + status filter (UI-2 visual pass).
 *
 * Reads/writes controlled state. Filtering and search semantics are
 * unchanged.
 *
 * Visual (UI-2):
 *   · Left: segmented filter (All / Live / Borrowable)
 *   · Right: search input fills the remaining width
 *   · Single composed control row, height 40px
 *   · Soft `--card-soft` surface, no aggressive borders
 *   · Sans typography — no mono caps, no excessive letter spacing
 *   · Selected filter uses ZEKS ink/foreground soft pill (no zebra)
 */

import * as React from "react"

export type StatusFilter = "all" | "live" | "borrowable"

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  live: "Live",
  borrowable: "Borrowable",
}

interface MarketsToolbarProps {
  query: string
  onQueryChange: (q: string) => void
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  placeholder?: string
  testId?: string
}

export function MarketsToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  placeholder = "Search AAPL, TSLA, NVDA…",
  testId,
}: MarketsToolbarProps) {
  return (
    <div
      className="zeks-toolbar"
      data-testid={testId ?? "markets-toolbar"}
      data-markets-toolbar
      style={{
        gap: "10px",
        alignItems: "stretch",
        backgroundColor: "var(--card-soft)",
        borderRadius: "14px",
        border: "1px solid var(--border)",
        padding: "6px",
      }}
    >
      <div
        className="zeks-segment"
        role="group"
        aria-label="Filter markets"
        style={{
          height: "40px",
          borderRadius: "10px",
          backgroundColor: "var(--background)",
          border: "1px solid var(--border)",
        }}
      >
        {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => {
          const active = key === status
          return (
            <button
              key={key}
              type="button"
              onClick={() => onStatusChange(key)}
              aria-pressed={active}
              data-markets-filter={key}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: 0,
                padding: "0 16px",
                height: "100%",
              }}
            >
              {FILTER_LABELS[key]}
            </button>
          )
        })}
      </div>

      <label
        className="zeks-search zeks-toolbar-search"
        style={{
          height: "40px",
          borderRadius: "10px",
          backgroundColor: "var(--background)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0"
          aria-hidden="true"
        >
          <circle cx={11} cy={11} r={7} />
          <line x1={20} y1={20} x2={16.65} y2={16.65} />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search markets"
          style={{
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
          }}
        />
      </label>
    </div>
  )
}
