"use client"

/**
 * MarketsTable
 *
 * Full-width, dense, terminal-style table of onchain lending markets.
 *
 * Columns:
 *   Market | Oracle Price | Supply APY | Borrow APY | Total Supply |
 *   Total Borrow | Utilization | Liquidity | Status
 *
 * Features (REUSED from previous trading view):
 *   - Client-side search by symbol and name
 *   - Filter tabs (lending-relevant modes)
 *   - Sort dropdown + direction toggle
 *   - Skeleton rows during initial load
 *   - Error and empty states
 *   - STALE indicator when refresh fails
 */

import * as React from "react"
import MarketAssetRow from "@/components/markets/market-asset-row"
import type { LendingMarket } from "@/lib/markets/lending"
import type {
  LendingFilterMode,
  LendingSortField,
  LendingSortDir,
} from "@/lib/markets/lending"
import {
  compareLending,
  matchesLendingFilter,
  matchesLendingQuery,
} from "@/lib/markets/lending"

export type { LendingFilterMode, LendingSortField, LendingSortDir }

interface MarketsTableProps {
  markets: LendingMarket[]
  failedSymbols?: string[]
  loading?: boolean
  errorReason?: string | null
  stale?: boolean
  onRetry?: () => void
  skeletonRows?: number
}

export default function MarketsTable({
  markets,
  failedSymbols,
  loading,
  errorReason,
  stale,
  onRetry,
  skeletonRows = 8,
}: MarketsTableProps) {
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<LendingFilterMode>("all")
  const [sortField, setSortField] = React.useState<LendingSortField>("market")
  const [sortDir, setSortDir] = React.useState<LendingSortDir>("asc")

  const displayed = React.useMemo(() => {
    let list = markets

    // Search
    list = list.filter((m) => matchesLendingQuery(m, query))

    // Filter
    list = list.filter((m) => matchesLendingFilter(m, filter))

    // Sort
    list = [...list].sort((a, b) => compareLending(a, b, sortField, sortDir))

    return list
  }, [markets, query, filter, sortField, sortDir])

  const totalMarkets = markets.length

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden" aria-label="Lending markets table">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border">
        <SearchInput query={query} onChange={setQuery} />

        <span
          className="hidden sm:inline zeks-eyebrow text-muted-foreground tabular-nums shrink-0"
          aria-live="polite"
        >
          {displayed.length === totalMarkets
            ? `${totalMarkets} markets`
            : `${displayed.length} of ${totalMarkets}`}
        </span>

        <FilterTabs value={filter} onChange={setFilter} />

        <SortControl
          field={sortField}
          dir={sortDir}
          onFieldChange={setSortField}
          onDirChange={setSortDir}
        />
      </div>

      {/* Header row */}
      <div
        className="sticky top-12 z-20 grid items-center gap-3 px-3 h-8 border-b border-border bg-card"
        style={{
          gridTemplateColumns:
            "minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.9fr)",
        }}
        role="row"
        aria-label="Lending markets table header"
      >
        <HeaderCell>Market</HeaderCell>
        <SortHeader
          label="Oracle Price"
          field="oraclePrice"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Supply APY"
          field="supplyApy"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Borrow APY"
          field="borrowApy"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Total Supply"
          field="totalSupply"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Total Borrow"
          field="totalBorrow"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Utilization"
          field="utilization"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <SortHeader
          label="Liquidity"
          field="liquidity"
          activeField={sortField}
          activeDir={sortDir}
          onField={setSortField}
          onDir={setSortDir}
        />
        <HeaderCell align="right">Status</HeaderCell>
      </div>

      {/* Body */}
      {loading ? (
        <SkeletonRows count={skeletonRows} />
      ) : errorReason ? (
        <ErrorState reason={errorReason} onRetry={onRetry} />
      ) : displayed.length === 0 ? (
        <EmptyState query={query} onClear={() => setQuery("")} />
      ) : (
        <div role="rowgroup" data-stale={stale || undefined}>
          {displayed.map((m) => (
            <MarketAssetRow key={m.symbol} market={m} />
          ))}
        </div>
      )}

      {/* Stale footer */}
      {stale && !loading && !errorReason ? (
        <div className="px-4 py-2 border-t border-border bg-amber-500/5 zeks-eyebrow text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Showing the most recent data.
          {failedSymbols && failedSymbols.length > 0 ? (
            <span className="text-muted-foreground">
              · {failedSymbols.length} market{failedSymbols.length === 1 ? "" : "s"} unavailable
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/* ─── Toolbar components ──────────────────────────────────────────── */

function SearchInput({
  query,
  onChange,
}: {
  query: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md bg-secondary/60 border border-border text-sm max-w-sm">
      <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <input
        type="text"
        placeholder="Search markets"
        aria-label="Search markets"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault()
            e.stopPropagation()
            onChange("")
          }
        }}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="zeks-eyebrow text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Clear search"
        >
          CLEAR
        </button>
      ) : null}
    </label>
  )
}

const FILTER_OPTIONS: Array<{ key: LendingFilterMode; label: string }> = [
  { key: "all", label: "All" },
  { key: "highest-supply-apy", label: "Highest Supply APY" },
  { key: "lowest-borrow-apy", label: "Lowest Borrow APY" },
  { key: "highest-liquidity", label: "Highest Liquidity" },
  { key: "most-utilized", label: "Most Utilized" },
]

function FilterTabs({
  value,
  onChange,
}: {
  value: LendingFilterMode
  onChange: (v: LendingFilterMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Lending markets filter"
      className="inline-flex items-center rounded-md border border-border overflow-hidden"
    >
      {FILTER_OPTIONS.map((tab) => {
        const active = value === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={
              "h-9 px-3 zeks-eyebrow transition-colors " +
              (active
                ? "bg-secondary text-foreground"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/40")
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

const SORT_FIELD_OPTIONS: Array<{ key: LendingSortField; label: string }> = [
  { key: "market", label: "Market" },
  { key: "oraclePrice", label: "Oracle Price" },
  { key: "supplyApy", label: "Supply APY" },
  { key: "borrowApy", label: "Borrow APY" },
  { key: "totalSupply", label: "Total Supply" },
  { key: "totalBorrow", label: "Total Borrow" },
  { key: "utilization", label: "Utilization" },
  { key: "liquidity", label: "Liquidity" },
]

function SortControl({
  field,
  dir,
  onFieldChange,
  onDirChange,
}: {
  field: LendingSortField
  dir: LendingSortDir
  onFieldChange: (f: LendingSortField) => void
  onDirChange: (d: LendingSortDir) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="zeks-eyebrow text-muted-foreground tracking-wider shrink-0 hidden md:inline">
        SORT
      </span>
      <select
        value={field}
        onChange={(e) => onFieldChange(e.target.value as LendingSortField)}
        aria-label="Sort by column"
        className="h-9 pl-2.5 pr-7 rounded-md bg-secondary/60 border border-border text-[12px] font-sans font-medium text-foreground appearance-none cursor-pointer outline-none hover:bg-secondary/80 transition-colors"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%23999999' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {SORT_FIELD_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onDirChange(dir === "asc" ? "desc" : "asc")}
        aria-label={dir === "asc" ? "Sort ascending" : "Sort descending"}
        className="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
      >
        {dir === "asc" ? (
          <SortAscIcon className="w-3.5 h-3.5" />
        ) : (
          <SortDescIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}

function HeaderCell({
  children,
  align,
}: {
  children: React.ReactNode
  align?: "left" | "right"
}) {
  return (
    <span
      className={
        "zeks-eyebrow text-muted-foreground " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </span>
  )
}

function SortHeader({
  label,
  field,
  activeField,
  activeDir,
  onField,
  onDir,
}: {
  label: string
  field: LendingSortField
  activeField: LendingSortField
  activeDir: LendingSortDir
  onField: (f: LendingSortField) => void
  onDir: (d: LendingSortDir) => void
}) {
  const active = field === activeField
  return (
    <button
      type="button"
      onClick={() => {
        if (active) {
          onDir(activeDir === "asc" ? "desc" : "asc")
        } else {
          onField(field)
          onDir("asc")
        }
      }}
      className="zeks-eyebrow text-right transition-colors hover:text-foreground"
      aria-label={`Sort by ${label}`}
    >
      <span className={active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      {active
        ? activeDir === "asc"
          ? <SortAscIcon className="inline w-2.5 h-2.5 ml-0.5" />
          : <SortDescIcon className="inline w-2.5 h-2.5 ml-0.5" />
        : null}
    </button>
  )
}

/* ─── Skeleton / Empty / Error ───────────────────────────────────── */

function SkeletonRows({ count }: { count: number }) {
  return (
    <div role="rowgroup" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`sk-${i}`}
          className="grid items-center gap-3 px-4 h-12 border-b border-border last:border-b-0"
          style={{
            gridTemplateColumns:
              "minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.9fr)",
          }}
          aria-hidden="true"
        >
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-secondary animate-pulse shrink-0" />
            <div className="space-y-1.5">
              <div className="h-3 w-12 rounded bg-secondary animate-pulse" />
              <div className="h-2.5 w-20 rounded bg-secondary animate-pulse" />
            </div>
          </div>
          <div className="h-3 w-14 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-14 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-14 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-12 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-12 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-12 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-3 w-12 rounded bg-secondary animate-pulse justify-self-end" />
          <div className="h-6 w-16 rounded bg-secondary animate-pulse justify-self-end" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  query,
  onClear,
}: {
  query: string
  onClear: () => void
}) {
  if (query) {
    return (
      <div className="px-4 py-12 text-center space-y-3" role="status">
        <p className="text-xs zeks-eyebrow text-muted-foreground">
          No markets match &ldquo;{query}&rdquo;.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center h-8 px-3 rounded-md bg-secondary border border-border text-[12px] font-sans font-medium text-foreground hover:bg-secondary/80 transition-colors"
        >
          Clear search
        </button>
      </div>
    )
  }
  return (
    <div className="px-4 py-12 text-center" role="status">
      <p className="text-xs zeks-eyebrow text-muted-foreground">
        No markets in this filter.
      </p>
    </div>
  )
}

function ErrorState({
  reason,
  onRetry,
}: {
  reason: string
  onRetry?: () => void
}) {
  return (
    <div className="px-4 py-12 text-center" role="alert" data-testid="markets-error">
      <p className="text-sm font-sans text-foreground">Market data temporarily unavailable.</p>
      <p className="text-[11.5px] zeks-secondary text-muted-foreground mt-1.5">{reason}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-sans font-medium hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}

/* ─── Icons ──────────────────────────────────────────────────────── */

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx={11} cy={11} r={7} />
      <line x1={20} y1={20} x2={16.65} y2={16.65} />
    </svg>
  )
}

function SortAscIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1={8} y1={12} x2={8} y2={4} />
      <polyline points="5 7 8 4 11 7" />
    </svg>
  )
}

function SortDescIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1={8} y1={4} x2={8} y2={12} />
      <polyline points="5 9 8 12 11 9" />
    </svg>
  )
}
