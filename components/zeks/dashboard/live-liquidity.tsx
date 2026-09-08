"use client"

/**
 * LiveLiquidity — measured reference composition.
 *
 *   Grid: 3 columns (md)
 *     · Left  (span 1) — 2 stacked metric cards (16px gap)
 *         · Total Liquidity
 *         · Added in last 6 deposits
 *     · Right (span 2) — live protocol activity feed
 *
 *   All cards p-5 rounded-2xl · warm beige surface · thin border
 *   Heading lives OUTSIDE cards (handled by SectionTitle in parent).
 *
 *   Motion: pulse dot · fade-in on metric change · slide-in on rows.
 *   Spec compliance:
 *     · No wallet-only data shown.
 *     · Empty state is compact and honest.
 *     · No fake rows.
 */

import * as React from "react"
import { Pill } from "@/components/zeks/pill"
import { formatCompact, formatTokenAmount } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

/** Shape returned by GET /api/protocol/activity. */
interface ActivityEvent {
  id: string
  txHash: `0x${string}`
  logIndex: number
  blockNumber: number
  timestamp: number | null
  vault: `0x${string}`
  venue: "steakhouse" | "ethena-steakhouse" | "grove-steakhouse"
  label: string
  kind: "in" | "out" | "transfer"
  amountUsdg: string
}

interface ActivityPayload {
  ok: boolean
  events: ActivityEvent[]
  addedLast6Deposits: string
  latestBlock: number | null
  fromBlock: number | null
  updatedAt: string
  errorMessage: string | null
  partial: boolean
}

interface LiveLiquidityProps {
  markets: LendingMarket[]
}

const VISIBLE_ROWS = 8
const POLL_MS = 10_000

export function LiveLiquidity({ markets }: LiveLiquidityProps) {
  const totalLiquidityUsd = React.useMemo(() => {
    let total = 0
    let any = false
    for (const m of markets) {
      const v = m.totalSupply ?? null
      if (v != null && Number.isFinite(v)) {
        total += v
        any = true
      }
    }
    return any ? total : null
  }, [markets])

  const [feed, setFeed] = React.useState<ActivityPayload | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8_000)
      const res = await fetch("/api/protocol/activity", {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      clearTimeout(t)
      if (!res.ok) {
        setLoading(false)
        return
      }
      const j = (await res.json()) as ActivityPayload
      setFeed(j)
    } catch {
      // keep last known feed
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const addedLast6Usdg = feed?.addedLast6Deposits ?? "—"
  const isEmpty = !feed || feed.events.length === 0

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)",
        gap: "var(--dash-card-gap)",
      }}
      data-testid="section-live-liquidity"
    >
      {/* LEFT — 2 stacked metric cards */}
      <div
        className="grid"
        style={{
          gridTemplateRows: "1fr 1fr",
          gap: "var(--dash-card-gap)",
        }}
      >
        <TotalLiquidityCard totalLiquidityUsd={totalLiquidityUsd} />
        <AddedLastDepositsCard addedLast6Usdg={addedLast6Usdg} />
      </div>

      {/* RIGHT — live protocol activity */}
      <ActivityFeedPanel feed={feed} loading={loading} isEmpty={isEmpty} />
    </div>
  )
}

/* ── Metric cards (left column) ─────────────────────── */

function TotalLiquidityCard({
  totalLiquidityUsd,
}: {
  totalLiquidityUsd: number | null
}) {
  const primary =
    totalLiquidityUsd != null ? formatCompact(totalLiquidityUsd) : "—"

  return (
    <Card>
      <span
        className="font-mono uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        Total Liquidity
      </span>
      <span
        key={primary}
        className="zeks-anim-fade-in leading-none tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "34px",
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          marginTop: "auto",
        }}
      >
        {primary}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          marginTop: "4px",
        }}
      >
        Across curated Morpho markets
      </span>
    </Card>
  )
}

function AddedLastDepositsCard({ addedLast6Usdg }: { addedLast6Usdg: string }) {
  return (
    <Card>
      <span
        className="font-mono uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        Added · last 6 deposits
      </span>
      <span
        className="leading-none tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "34px",
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          marginTop: "auto",
        }}
      >
        {formatTokenAmount(addedLast6Usdg)}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          marginTop: "4px",
        }}
      >
        USDG · onchain vault events
      </span>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: "120px",
      }}
    >
      {children}
    </div>
  )
}

/* ── Activity feed panel (right column) ─────────────── */

function ActivityFeedPanel({
  feed,
  loading,
  isEmpty,
}: {
  feed: ActivityPayload | null
  loading: boolean
  isEmpty: boolean
}) {
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: "256px",
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ paddingBottom: "12px" }}
      >
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full shrink-0 zeks-anim-pulse"
          style={{ backgroundColor: "var(--primary)" }}
        />
        <span
          className="font-mono uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          Live Activity
        </span>
        {!isEmpty && (
          <span
            className="ml-auto font-mono tabular-nums"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
            }}
          >
            {feed!.events.length} events
          </span>
        )}
      </div>

      {/* Feed body */}
      {isEmpty ? (
        <EmptyFeed
          loading={loading}
          errorMessage={feed?.errorMessage ?? null}
        />
      ) : (
        <ActivityFeed events={feed!.events} />
      )}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────── */

function EmptyFeed({
  loading,
  errorMessage,
}: {
  loading: boolean
  errorMessage: string | null
}) {
  const label = errorMessage
    ? "Live feed unavailable"
    : loading
      ? "Connecting…"
      : "No recent vault activity"
  return (
    <div className="flex-1 flex items-center">
      <p
        className="font-mono tracking-wide"
        style={{
          fontSize: "12px",
          color: "var(--muted-foreground)",
        }}
      >
        {label}
      </p>
    </div>
  )
}

/* ── Activity feed ───────────────────────────────────── */

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [showAll, setShowAll] = React.useState(false)
  const visible = showAll ? events.length : Math.min(events.length, VISIBLE_ROWS)
  const items = events.slice(0, visible)
  const more = events.length - visible

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ol
        className="relative flex-1 overflow-auto"
        style={{ padding: "0 0 4px" }}
        data-testid="protocol-feed-list"
      >
        {/* Vertical timeline line */}
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-3 bottom-3 w-px"
          style={{ backgroundColor: "var(--border)" }}
        />
        {items.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </ol>

      {more > 0 && !showAll && (
        <div
          className="flex items-center justify-end shrink-0"
          style={{
            paddingTop: "6px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="font-mono tracking-wide transition-colors"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
          >
            +{more} more
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Single feed row ────────────────────────────────── */

function ActivityRow({ event }: { event: ActivityEvent }) {
  const tone =
    event.kind === "in" ? "up" : event.kind === "out" ? "down" : "muted"
  const label =
    event.kind === "in" ? "IN" : event.kind === "out" ? "OUT" : "TRANSFER"

  return (
    <li
      className="relative"
      style={{
        paddingLeft: "32px",
        paddingRight: "12px",
        paddingTop: "5px",
        paddingBottom: "5px",
      }}
    >
      {/* Timeline dot */}
      <span
        aria-hidden="true"
        className="absolute rounded-full shrink-0"
        style={{
          left: "10px",
          top: "11px",
          width: "5px",
          height: "5px",
          backgroundColor:
            event.kind === "in"
              ? "var(--up)"
              : event.kind === "out"
                ? "var(--down)"
                : "var(--muted-foreground)",
          opacity: 0.7,
        }}
      />

      {/* Top row — chip + venue + time */}
      <div className="flex items-center gap-2">
        <Pill tone={tone} dot>
          {label}
        </Pill>
        <span
          className="font-mono truncate"
          style={{
            fontSize: "11px",
            color: "var(--muted-foreground)",
          }}
        >
          {event.label}
        </span>
        <span
          className="ml-auto font-mono tabular-nums shrink-0"
          style={{ fontSize: "11px", color: "var(--muted-foreground)" }}
        >
          {relative(event.timestamp)}
        </span>
      </div>

      {/* Amount + tx link */}
      <p
        className="font-mono flex items-center gap-2"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          marginTop: "2px",
        }}
      >
        <span className="truncate">{formatTokenAmount(event.amountUsdg)} USDG</span>
        <a
          href={txLink(event.txHash)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 underline-offset-2 transition-colors"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
        >
          {short(event.txHash)}
        </a>
      </p>
    </li>
  )
}

/* ── Helpers ────────────────────────────────────────── */

function short(hash: string): string {
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`
}

function txLink(hash: string): string {
  return `https://explorer.robinhood.com/tx/${hash}`
}

function relative(ts: number | null): string {
  if (ts == null) return "—"
  const ms = Math.max(0, Date.now() - ts * 1000)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
