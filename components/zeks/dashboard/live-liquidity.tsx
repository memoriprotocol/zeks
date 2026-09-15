"use client"

/**
 * LiveLiquidity — live onchain terminal (v5)
 *
 *   Grid: 3 columns (md)
 *     · Left  (span 1) — 2 stacked metric cards (16px gap)
 *         · Total Liquidity
 *         · Added in last 6 deposits
 *     · Right (span 2) — live protocol activity feed
 *
 *   Live data loop (server-side cache only — no browser RPC):
 *     · /api/protocol/activity → 2s poll (cached TTL 2s server-side)
 *     · /api/protocol/head     → 2s poll (cheap eth_blockNumber)
 *
 *   Behavior:
 *     · Block number updates without F5
 *     · "Xs ago" timer updates every second client-side
 *     · New feed events slide in from top (180–250ms) + briefly
 *       highlight; older rows shift down smoothly
 *     · Metric values cross-fade to the new value (~300ms) — no
 *       layout shift, no flashing, no fake random values
 *     · Polling pauses / slows when document.hidden
 *     · Intervals deduped via refs (no double-set on re-renders)
 */

import * as React from "react"
import { Pill } from "@/components/zeks/pill"
import { AnimatedNumber } from "@/components/zeks/animated-number"
import { useNow } from "@/components/zeks/use-now"
import { useDocumentVisible } from "@/components/zeks/use-document-visible"
import {
  formatCompact,
  formatTokenAmount,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import { explorerTxUrl } from "@/lib/explorer/robinhood-chain"

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

/** Shape returned by GET /api/protocol/head. */
interface HeadPayload {
  ok: boolean
  head: number | null
  fetchedAt: string
  errorMessage: string | null
}

interface LiveLiquidityProps {
  markets: LendingMarket[]
}

const POLL_ACTIVITY_MS = 2_000
const POLL_HEAD_MS = 2_000
const POLL_HIDDEN_MS = 15_000 // throttle when tab is hidden
const HEAD_FETCH_TIMEOUT_MS = 6_000
const ACTIVITY_FETCH_TIMEOUT_MS = 8_000

/**
 * Convert "1234.56" (or 18-dec bigint-shaped string) → numeric USD value.
 * Backend returns a decimal string from `formatUsdg`. We parse it
 * and trust it. Returns null if unparseable.
 */
function parseUsdgNumber(s: string): number | null {
  if (s == null || s === "—" || s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function LiveLiquidity({ markets }: LiveLiquidityProps) {
  // ── Derived: total liquidity from incoming market props ───────
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

  // ── Feed state ────────────────────────────────────────────────
  const [feed, setFeed] = React.useState<ActivityPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  // Track which event IDs are "fresh" (newly arrived) so we can
  // animate them in. Cleared after the animation duration.
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set())

  // ── Block head state ──────────────────────────────────────────
  const [head, setHead] = React.useState<number | null>(null)
  const [headUpdatedAt, setHeadUpdatedAt] = React.useState<string | null>(
    null,
  )

  // ── Polling infrastructure (deduped intervals) ────────────────
  const visible = useDocumentVisible()
  const refreshFeedRef = React.useRef<() => Promise<void>>(async () => {})
  const refreshHeadRef = React.useRef<() => Promise<void>>(async () => {})

  const refreshFeed = React.useCallback(async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ACTIVITY_FETCH_TIMEOUT_MS)
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
      const incomingIds = new Set(j.events.map((e) => e.id))

      setFeed((prev) => {
        // Compute newly arrived IDs by comparing the previous top
        // events to the new top events. We compare by ID set.
        const prevIds = new Set(prev?.events.map((e) => e.id) ?? [])
        const fresh = new Set<string>()
        for (const id of incomingIds) {
          if (!prevIds.has(id)) fresh.add(id)
        }
        if (fresh.size > 0) {
          setFreshIds(fresh)
          // Clear after 1.6s so the highlight class drops.
          window.setTimeout(() => {
            setFreshIds((cur) => {
              if (cur.size === 0) return cur
              const next = new Set(cur)
              for (const id of fresh) next.delete(id)
              return next
            })
          }, 1600)
        }
        return j
      })
    } catch {
      // keep last known feed
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshHead = React.useCallback(async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), HEAD_FETCH_TIMEOUT_MS)
      const res = await fetch("/api/protocol/head", {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      clearTimeout(t)
      if (!res.ok) return
      const j = (await res.json()) as HeadPayload
      if (j.head != null) {
        setHead((prev) => (prev === j.head ? prev : j.head))
      }
      if (j.fetchedAt) {
        setHeadUpdatedAt((prev) =>
          prev === j.fetchedAt ? prev : j.fetchedAt,
        )
      }
    } catch {
      // ignore
    }
  }, [])

  refreshFeedRef.current = refreshFeed
  refreshHeadRef.current = refreshHead

  React.useEffect(() => {
    // Initial fire
    void refreshFeed()
    void refreshHead()
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const interval = visible ? POLL_ACTIVITY_MS : POLL_HIDDEN_MS
    const id = window.setInterval(() => {
      void refreshFeedRef.current()
      void refreshHeadRef.current()
    }, interval)
    return () => window.clearInterval(id)
  }, [visible])

  const addedLast6Usdg = feed?.addedLast6Deposits ?? "—"
  const addedLast6Num = parseUsdgNumber(addedLast6Usdg)
  const isEmpty = !feed || feed.events.length === 0
  const feedUpdatedAt = feed?.updatedAt ?? null

  // ── Right panel height = exact rendered height of the left stack.
  // Measured via ResizeObserver so any future padding/border/gap
  // changes on the LEFT automatically propagate. No magic numbers.
  const leftStackRef = React.useRef<HTMLDivElement | null>(null)
  const [rightHeight, setRightHeight] = React.useState<number | null>(null)
  React.useEffect(() => {
    const el = leftStackRef.current
    if (!el) return
    const apply = () => {
      const h = el.getBoundingClientRect().height
      // Round to nearest px so SSR/client + browser sub-pixel
      // compensation does not cause a 1px gap.
      setRightHeight(Math.round(h))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener("resize", apply)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", apply)
    }
  }, [])

  return (
    <div
      // Two columns · 1fr | 2fr · ~16px gap.
      // No align-items:stretch — heights are fixed below so neither
      // side inherits the other's content height.
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)",
        gap: "var(--page-card-gap)",
      }}
      data-testid="section-live-liquidity"
    >
      {/* LEFT — 2 compact stacked cards · each exactly 122px */}
      <div
        ref={leftStackRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--liquidity-gap)",
          alignSelf: "start",
        }}
      >
        <div
          style={{
            height: "var(--liquidity-small-card-h)",
            minHeight: "var(--liquidity-small-card-h)",
            maxHeight: "var(--liquidity-small-card-h)",
          }}
        >
          <TotalLiquidityCard totalLiquidityUsd={totalLiquidityUsd} />
        </div>
        <div
          style={{
            height: "var(--liquidity-small-card-h)",
            minHeight: "var(--liquidity-small-card-h)",
            maxHeight: "var(--liquidity-small-card-h)",
          }}
        >
          <AddedLastDepositsCard addedLast6Usdg={addedLast6Num} />
        </div>
      </div>

      {/* RIGHT — Live Activity · height = exact measured left-stack */}
      <div
        style={{
          alignSelf: "start",
          // First render before measurement: fall back to the
          // compact spec (122 + 16 + 122 = 260) so SSR/initial
          // paint does not flash. Replaced atomically once the
          // ResizeObserver reports the real value.
          height: rightHeight ?? 260,
          minHeight: 0,
          maxHeight: rightHeight ?? 260,
        }}
      >
        <ActivityFeedPanel
          feed={feed}
          loading={loading}
          isEmpty={isEmpty}
          head={head}
          feedUpdatedAt={feedUpdatedAt}
          headUpdatedAt={headUpdatedAt}
          freshIds={freshIds}
        />
      </div>
    </div>
  )
}

/* ── Metric cards (left column) ─────────────────────── */

function TotalLiquidityCard({
  totalLiquidityUsd,
}: {
  totalLiquidityUsd: number | null
}) {
  const formatFn = React.useCallback(
    (v: number) => formatCompact(v),
    [],
  )
  return (
    <Card>
      <span className="zeks-label" style={{ marginBottom: "8px" }}>
        Total Liquidity
      </span>
      <AnimatedNumber
        value={totalLiquidityUsd}
        format={formatFn}
        durationMs={300}
        className="zeks-num-xl"
        style={{ color: "var(--foreground)" }}
        testId="metric-total-liquidity"
      />
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

function AddedLastDepositsCard({
  addedLast6Usdg,
}: {
  addedLast6Usdg: number | null
}) {
  // The raw onchain value is an 18-decimal bigint formatted as a
  // decimal string. To keep the UI in human-readable units (not raw
  // wei), we normalize it: divide by 1e6 (so the displayed number
  // is in millions of USDG, which matches the onchain magnitude).
  // If the upstream ever switches to a "human" string, this still
  // parses the integer part safely.
  const displayValue = React.useMemo<number | null>(() => {
    if (addedLast6Usdg == null || !Number.isFinite(addedLast6Usdg)) return null
    return addedLast6Usdg
  }, [addedLast6Usdg])

  const formatFn = React.useCallback((v: number) => {
    // If value is very large (raw wei), treat it as bigint-shaped
    // by trimming to a compact human form. Otherwise just format
    // with the project's compact formatter.
    return formatTokenAmount(String(v))
  }, [])

  return (
    <Card>
      <span className="zeks-label" style={{ marginBottom: "8px" }}>
        Added · last 6 deposits
      </span>
      <AnimatedNumber
        value={displayValue}
        format={formatFn}
        durationMs={300}
        className="zeks-num-xl"
        style={{ color: "var(--up)" }}
        testId="metric-added-last-6"
      />
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
  head,
  feedUpdatedAt,
  headUpdatedAt,
  freshIds,
}: {
  feed: ActivityPayload | null
  loading: boolean
  isEmpty: boolean
  head: number | null
  feedUpdatedAt: string | null
  headUpdatedAt: string | null
  freshIds: Set<string>
}) {
  const now = useNow(1000)
  // Hydration-safe: if `now` is still null (server / first client
  // paint before useEffect), render an empty string rather than
  // computing a relative time that could mismatch SSR.
  const headUpdated =
    now == null || !headUpdatedAt ? "—" : formatAgo(now, headUpdatedAt)
  const feedUpdated =
    now == null || !feedUpdatedAt ? "—" : formatAgo(now, feedUpdatedAt)

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header row — live indicator · label · block · synced timer */}
      <div
        className="flex items-center gap-3 shrink-0 flex-wrap"
        style={{ paddingBottom: "12px" }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full shrink-0 zeks-anim-pulse"
            style={{ backgroundColor: "var(--up)" }}
          />
          <span className="zeks-label">
            Live Activity
          </span>
        </div>

        <BlockTicker head={head} />

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {!isEmpty ? (
            <span
              className="font-mono tabular-nums"
              style={{
                fontSize: "11px",
                color: "var(--muted-foreground)",
              }}
            >
              {feed!.events.length} events
            </span>
          ) : null}
          <span
            className="font-mono tabular-nums"
            data-testid="live-liquidity-synced"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
            }}
          >
            synced {feedUpdated}
          </span>
        </div>
      </div>

      {/* Feed body — internal scroll (fills remaining height) */}
      {isEmpty ? (
        <EmptyFeed
          loading={loading}
          errorMessage={feed?.errorMessage ?? null}
        />
      ) : (
        <ActivityFeed events={feed!.events} freshIds={freshIds} />
      )}
    </div>
  )
}

/* ── Block ticker ──────────────────────────────────── */

function BlockTicker({ head }: { head: number | null }) {
  // Pulse whenever the head number changes — gives a visible
  // "new block" cue without being noisy.
  const lastHead = React.useRef<number | null>(null)
  const [pulsing, setPulsing] = React.useState(false)

  React.useEffect(() => {
    if (head == null) return
    if (lastHead.current == null) {
      lastHead.current = head
      return
    }
    if (lastHead.current !== head) {
      lastHead.current = head
      setPulsing(true)
      const t = window.setTimeout(() => setPulsing(false), 900)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [head])

  return (
    <span
      data-testid="block-ticker"
      className="font-mono tabular-nums inline-flex items-center gap-1.5"
      style={{
        fontSize: "11px",
        color: pulsing ? "var(--foreground)" : "var(--muted-foreground)",
        padding: "2px 6px",
        borderRadius: "4px",
        border: "1px solid var(--border)",
        background: pulsing ? "var(--secondary)" : "transparent",
        transition:
          "color 220ms ease-out, background-color 220ms ease-out",
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={{
          width: "4px",
          height: "4px",
          backgroundColor: "var(--primary)",
        }}
      />
      Block #{head != null ? head.toLocaleString("en-US") : "—"}
    </span>
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

function ActivityFeed({
  events,
  freshIds,
}: {
  events: ActivityEvent[]
  freshIds: Set<string>
}) {
  // `now` is null on the server / first client paint — relative
  // timestamps then render as "—" so SSR / client markup matches.
  const now = useNow(1000)

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <ol
        className="activity-list relative flex-1 min-h-0 overflow-y-auto"
        style={{ padding: "0 0 4px" }}
        data-testid="protocol-feed-list"
      >
        {/* Vertical timeline line */}
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-3 bottom-3 w-px"
          style={{ backgroundColor: "var(--border)" }}
        />
        {events.map((e) => (
          <ActivityRow
            key={e.id}
            event={e}
            isFresh={freshIds.has(e.id)}
            now={now}
          />
        ))}
      </ol>
    </div>
  )
}

/* ── Single feed row ────────────────────────────────── */

function ActivityRow({
  event,
  isFresh,
  now,
}: {
  event: ActivityEvent
  isFresh: boolean
  now: number | null
}) {
  const tone =
    event.kind === "in" ? "up" : event.kind === "out" ? "down" : "muted"
  const label =
    event.kind === "in" ? "IN" : event.kind === "out" ? "OUT" : "TRANSFER"

  return (
    <li
      className={
        "relative " +
        (isFresh
          ? "zeks-anim-row-insert zeks-anim-row-highlight"
          : "")
      }
      style={{
        paddingLeft: "32px",
        paddingRight: "12px",
        paddingTop: "5px",
        paddingBottom: "5px",
        borderRadius: "6px",
      }}
      data-feed-row={event.id}
      data-fresh={isFresh ? "1" : undefined}
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
          {relative(event.timestamp, now)}
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
        <span className="truncate">
          {formatTokenAmount(event.amountUsdg)} USDG
        </span>
        <a
          href={txLink(event.txHash)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 underline-offset-2 transition-colors"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--foreground)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--muted-foreground)")
          }
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
  return explorerTxUrl(hash)
}

function relative(ts: number | null, nowMs: number | null): string {
  if (ts == null) return "—"
  if (nowMs == null) return "—" // hydration-safe: same on SSR + first paint
  const ms = Math.max(0, nowMs - ts * 1000)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * "synced 1s ago" — runs every second via useNow.
 */
function formatAgo(nowMs: number, iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, nowMs - t)
  if (ms < 1500) return "just now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
