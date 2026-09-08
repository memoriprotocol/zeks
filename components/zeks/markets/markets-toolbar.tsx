"use client"

/**
 * MarketsToolbar — search + status filter + (optional) source filter.
 *
 *   · Search input (flex-1, 240px min)
 *   · Status filter (All · Live · Borrowable)
 *
 * Reads/writes controlled state. Visual system matches Dashboard.
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
      className="flex items-center gap-2.5 flex-wrap"
      data-testid={testId ?? "markets-toolbar"}
    >
      <label className="relative flex-1 min-w-[240px]">
        <span className="sr-only">Search markets</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 rounded-[10px] border border-border bg-transparent pl-9 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40 transition-colors"
        />
        <span
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-[12px]"
        >
          ⌕
        </span>
      </label>

      <select
        value={status}
        onChange={(e) => onStatusChange(e.currentTarget.value as StatusFilter)}
        aria-label="Filter by status"
        className="h-9 rounded-[10px] border border-border bg-transparent px-3 text-[12px] text-foreground outline-none focus:border-foreground/40 transition-colors"
      >
        <option value="all">All</option>
        <option value="live">Live</option>
        <option value="borrowable">Borrowable</option>
      </select>
    </div>
  )
}
