"use client"

/**
 * MarketsToolbar — search + status filter.
 *
 *   · Search input (flex-1, 240px min)
 *   · Status filter (All · Live · Borrowable)
 *
 * Reads/writes controlled state. Uses locked design tokens.
 */

import * as React from "react"

export type StatusFilter = "all" | "live" | "borrowable"

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
  placeholder = "Search markets…",
  testId,
}: MarketsToolbarProps) {
  return (
    <div
      className="flex items-center flex-wrap"
      data-testid={testId ?? "markets-toolbar"}
      style={{ gap: "10px" }}
    >
      <label className="relative flex-1 min-w-[240px]">
        <span className="sr-only">Search markets</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border outline-none transition-colors"
          style={{
            padding: "10px 12px 10px 32px",
            fontSize: "var(--font-body)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
            background: "var(--background)",
            borderRadius: "8px",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--foreground)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <span
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            fontSize: "13px",
            color: "var(--muted-foreground)",
          }}
        >
          ⌕
        </span>
      </label>

      <select
        value={status}
        onChange={(e) => onStatusChange(e.currentTarget.value as StatusFilter)}
        aria-label="Filter by status"
        className="rounded-md border outline-none cursor-pointer font-mono uppercase transition-colors"
        style={{
          padding: "8px 12px",
          fontSize: "12px",
          letterSpacing: "0.04em",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          background: "var(--background)",
          borderRadius: "8px",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--foreground)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        <option value="all">All</option>
        <option value="live">Live</option>
        <option value="borrowable">Borrowable</option>
      </select>
    </div>
  )
}
