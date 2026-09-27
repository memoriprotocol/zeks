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
import { useLiquidityTvl } from "@/components/zeks/dashboard/use-liquidity-tvl"
import { formatTokenAmount } from "@/lib/markets/format"
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
  marketsFetchedAt: string | null
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

export function LiveLiquidity({
  markets,
  marketsFetchedAt,
}: LiveLiquidityProps) {
  // ── Total liquidity + "synced Xs ago" timer · driven by the
  // shared /api/markets/lending feed via useMarketSummary in the
  // parent (3s when visible, 30s when hidden). The hook stamps
  // the sync time ONLY on a fresh upstream `fetchedAt`, so the
  // UI never fakes a successful sync on a failed request.
  const { totalLiquidityUsd, syncedSecondsAgo } = useLiquidityTvl({
    markets,
    marketsFetchedAt,
  })

  // ── Pool counts · derived from the same markets prop ───────
  // Total approved pools = all markets currently passed in.
  // Active pools        = status === "active".
  const poolCounts = React.useMemo(() => {
    let total = 0
    let active = 0
    for (const m of markets) {
      total += 1
      if (m.status === "active") active += 1
    }
    return { total, active }
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 0.51fr) minmax(0, 1fr)",
        gridTemplateRows: "minmax(280px, 280px)",
        columnGap: "16px",
        rowGap: "16px",
        alignItems: "stretch",
        width: "100%",
        maxWidth: "100%",
      }}
      data-testid="section-live-liquidity"
    >
      {/* LEFT col — two stacked metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: "1fr 1fr",
          rowGap: "16px",
          minHeight: 0,
          maxHeight: "100%",
          overflow: "hidden",
        }}
      >
        <TotalLiquidityCard
          totalLiquidityUsd={totalLiquidityUsd}
          totalPools={poolCounts.total}
          activePools={poolCounts.active}
          syncedSecondsAgo={syncedSecondsAgo}
        />
        <AddedLastDepositsCard
          addedLast6Usdg={addedLast6Num}
          depositCount={60}
        />
      </div>

      {/* RIGHT col — Live Activity · height locked to outer grid row */}
      <div style={{ minHeight: 0, maxHeight: "100%", overflow: "hidden" }}>
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
  totalPools,
  activePools,
  syncedSecondsAgo,
}: {
  totalLiquidityUsd: number | null
  totalPools: number
  activePools: number
  syncedSecondsAgo: number | null
}) {
  // Full comma-separated USD (no K/M/B abbreviation).
  // Examples: 483739194 → "$483,739,194", 495600000 → "$495,600,000".
  // Falls back to "$0" while upstream data is loading so the layout
  // never shifts.
  const formatFn = React.useCallback((v: number) => {
    const safe = Number.isFinite(v) ? v : 0
    return `$${Math.round(safe).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    })}`
  }, [])

  const syncedLabel =
    syncedSecondsAgo == null ? "syncing…" : `synced ${syncedSecondsAgo}s ago`

  return (
    <Card>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          marginBottom: "8px",
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        <span
          aria-hidden="true"
          className="zeks-anim-pulse"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--up)",
            flexShrink: 0,
          }}
        />
        Total Liquidity
      </span>
      <AnimatedNumber
        value={totalLiquidityUsd}
        format={formatFn}
        durationMs={300}
        className="zeks-num-xl"
        style={{
          color: "var(--foreground)",
          lineHeight: 1.05,
          fontSize: "26px",
          letterSpacing: "-0.018em",
          fontWeight: 500,
        }}
        testId="metric-total-liquidity"
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "6px",
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        <span>{totalPools} pools</span>
        <span
          aria-hidden="true"
          style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--border-strong)" }}
        />
        <span>{activePools} active</span>
        <span
          aria-hidden="true"
          style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--border-strong)" }}
        />
        <span>{syncedLabel}</span>
      </div>
    </Card>
  )
}

function AddedLastDepositsCard({
  addedLast6Usdg,
  depositCount,
}: {
  addedLast6Usdg: number | null
  depositCount: number
}) {
  // The raw onchain value is an 18-decimal bigint formatted as a
  // decimal string. parseUsdgNumber upstream has already converted
  // it to a human-readable numeric (e.g. 2394.58 → "$2,394.58").
  const displayValue = React.useMemo<number | null>(
    () => (addedLast6Usdg != null && Number.isFinite(addedLast6Usdg) ? addedLast6Usdg : null),
    [addedLast6Usdg],
  )

  // Comma-formatted USD with 2 decimals (no K/M/B abbreviation).
  // Examples: 0 → "$0", 2394.58 → "$2,394.58", 12610.45 → "$12,610.45".
  const formatFn = React.useCallback((v: number) => {
    const safe = Number.isFinite(v) ? v : 0
    return `$${safe.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }, [])

  return (
    <Card>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          marginBottom: "8px",
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        <span
          aria-hidden="true"
          className="zeks-anim-pulse"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--up)",
            flexShrink: 0,
          }}
        />
        Added · last {depositCount} on-chain deposits
      </span>
      <AnimatedNumber
        value={displayValue}
        format={formatFn}
        durationMs={300}
        className="zeks-num-xl"
        style={{
          color: "var(--up)",
          lineHeight: 1.05,
          fontSize: "26px",
          letterSpacing: "-0.018em",
          fontWeight: 500,
        }}
        testId="metric-added-last-6"
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "6px",
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        <span>USDG</span>
        <span
          aria-hidden="true"
          style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--border-strong)" }}
        />
        <span>Vault Transfer events</span>
      </div>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col"
      style={{
        padding: "16px 20px",
        borderRadius: "18px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        minHeight: 0,
        maxHeight: "100%",
        overflow: "hidden",
        justifyContent: "center",
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
        padding: "16px 20px 14px 20px",
        borderRadius: "18px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        height: "100%",
        minHeight: 0,
        maxHeight: "280px",
      }}
    >
      {/* Header row — live indicator · label · block · synced timer */}
      <div
        className="flex items-center gap-3 shrink-0 flex-wrap"
        style={{ paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-1.5 h-1.5 rounded-full shrink-0 zeks-anim-pulse"
            style={{ backgroundColor: "var(--up)" }}
          />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--foreground)",
              letterSpacing: 0,
            }}
          >
            Live Activity
          </span>
        </div>

        <BlockTicker head={head} />

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {!isEmpty ? (
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "11.5px",
                color: "var(--muted-foreground)",
                fontWeight: 500,
              }}
            >
              {feed!.events.length} events
            </span>
          ) : null}
          <span
            className="tabular-nums"
            data-testid="live-liquidity-synced"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11.5px",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            synced {feedUpdated}
          </span>
        </div>
      </div>

      {/* Feed body — internal scroll (fills remaining height, never grows the card) */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ paddingTop: "4px" }}
      >
        {isEmpty ? (
          <EmptyFeed
            loading={loading}
            errorMessage={feed?.errorMessage ?? null}
          />
        ) : (
          <ActivityFeed events={feed!.events} freshIds={freshIds} />
        )}
      </div>
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
      className="tabular-nums inline-flex items-center gap-1.5"
      style={{
        fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
        fontSize: "11.5px",
        color: pulsing ? "var(--foreground)" : "var(--muted-foreground)",
        padding: "3px 9px",
        borderRadius: "999px",
        border: "1px solid var(--border)",
        background: pulsing ? "var(--secondary)" : "var(--card)",
        transition:
          "color 220ms ease-out, background-color 220ms ease-out",
        fontWeight: 500,
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={{
          width: "5px",
          height: "5px",
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
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          color: "var(--muted-foreground)",
          fontWeight: 500,
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
        style={{ padding: "2px 0 2px 0" }}
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
    event.kind === "in" ? "In" : event.kind === "out" ? "Out" : "Transfer"

  return (
    <li
      className={
        "relative " +
        (isFresh
          ? "zeks-anim-row-insert zeks-anim-row-highlight"
          : "")
      }
      style={{
        paddingLeft: "28px",
        paddingRight: "8px",
        paddingTop: "6px",
        paddingBottom: "6px",
        borderRadius: "8px",
      }}
      data-feed-row={event.id}
      data-fresh={isFresh ? "1" : undefined}
    >
      {/* Timeline dot */}
      <span
        aria-hidden="true"
        className="absolute rounded-full shrink-0"
        style={{
          left: "9px",
          top: "11px",
          width: "6px",
          height: "6px",
          backgroundColor:
            event.kind === "in"
              ? "var(--up)"
              : event.kind === "out"
                ? "var(--down)"
                : "var(--muted-foreground)",
        }}
      />

      {/* Top row — chip + venue + time */}
      <div className="flex items-center gap-2">
        <Pill tone={tone} dot>
          {label}
        </Pill>
        <span
          className="truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            color: "var(--foreground)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {event.label}
        </span>
        <span
          className="ml-auto tabular-nums shrink-0"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          {relative(event.timestamp, now)}
        </span>
      </div>

      {/* Amount + tx link */}
      <p
        className="flex items-center gap-2"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          color: "var(--muted-foreground)",
          marginTop: "3px",
          fontWeight: 500,
        }}
      >
        <span
          style={{
            color: "var(--foreground)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
          }}
        >
          {formatTokenAmount(event.amountUsdg)} USDG
        </span>
        <a
          href={txLink(event.txHash)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 underline-offset-2 transition-colors"
          style={{
            fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
            color: "var(--muted-foreground)",
            fontSize: "11px",
            fontWeight: 500,
          }}
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
