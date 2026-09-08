"use client"

/**
 * LiveLiquidity — 32% / 68% two-column composition.
 *
 *   LEFT (~32%)
 *     · Total Liquidity card        (height ≈ 108px)
 *       — primary: protocol-wide totalSupply (USD)
 *       — secondary: "Added in last 6 deposits" (newest 6 IN events
 *         from the verified Protocol Feed, summed in raw token units
 *         — USDG).
 *
 *   RIGHT (~68%)
 *     · Live Protocol Activity feed
 *       — newest-first Transfer events from verified Loopr vaults
 *       — IN · OUT · TRANSFER classification
 *       — compact rows; collapsed to a compact empty state when
 *         the feed has no events or the RPC returned an error.
 *
 * Spec compliance:
 *   · No wallet-only data shown.
 *   · Compact when empty / when RPC unavailable.
 *   · No fake rows.
 *   · No horizontal scrollbars.
 *   · Reuses `--dash-card-gap` · `--card-soft` · `--dash-metric-h` ·
 *     `--dash-feed-h` · `--dash-feed-empty`.
 */

import * as React from "react"
import { Section } from "@/components/zeks/section"
import { Pill } from "@/components/zeks/pill"
import { formatCompact } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

/**
 * Shape returned by GET /api/protocol/activity. We intentionally do
 * NOT import the server-side feed module from this client component —
 * the browser calls the API route only.
 */
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

interface ListedFeedProps {
  events: ActivityEvent[]
}

interface LiveLiquidityProps {
  markets: LendingMarket[]
}

const PAGE_SIZE = 10

export function LiveLiquidity({ markets }: LiveLiquidityProps) {
  // Total liquidity — sum of totalSupply across all Morpho markets.
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

  // Protocol feed state — fetched from /api/protocol/activity (server-side).
  const [feed, setFeed] = React.useState<ActivityPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(async () => {
    try {
      const ctrl = new AbortController()
      // 8s — the server cache is 10s, so we always arrive into a hot cache.
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
      // keep last known feed; surfaces nothing new
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      void refresh()
    }, 10_000)
    return () => window.clearInterval(id)
  }, [refresh])

  // "Added in last 6 deposits" is already computed server-side.
  const addedLast6Usdg = feed?.addedLast6Deposits ?? "—"

  const isEmpty = !feed || feed.events.length === 0

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,32%)_minmax(0,68%)]"
      style={{ gap: "var(--dash-card-gap)" }}
      data-testid="section-live-liquidity"
    >
      {/* ── LEFT — Total Liquidity card (108px) ────────────── */}
      <div
        className="rounded-[14px] border border-border px-5 py-4 flex flex-col"
        style={{
          minHeight: "var(--dash-metric-h)",
          backgroundColor: "var(--card-soft)",
        }}
      >
        <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase">
          Total Liquidity
        </div>
        <div
          className="font-serif tabular-nums leading-none tracking-tight text-foreground mt-2"
          style={{ fontSize: "32px" }}
        >
          {totalLiquidityUsd != null ? formatCompact(totalLiquidityUsd) : "—"}
        </div>

        {/* secondary — added in last 6 deposits */}
        <div className="mt-auto pt-3 border-t border-border flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9.5px] tracking-wide text-muted-foreground/70 uppercase">
            Added · last 6 deposits
          </span>
          <span className="font-mono tabular-nums text-[12.5px] text-foreground">
            {addedLast6Usdg} <span className="text-muted-foreground/70">USDG</span>
          </span>
        </div>
      </div>

      {/* ── RIGHT — Live Protocol Activity (max 228 / empty 120) ── */}
      <Section
        aria-label="Live protocol activity"
        data-testid="section-live-activity"
        className="flex flex-col"
        style={{
          minHeight: isEmpty
            ? "var(--dash-feed-empty)"
            : "var(--dash-feed-h)",
          maxHeight: "var(--dash-feed-h)",
        }}
      >
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground/80 uppercase">
              Live Protocol Activity
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60 hidden md:inline">
            3 verified vaults · ~50k blocks
          </span>
        </div>

        {isEmpty ? (
          <EmptyFeed
            loading={loading}
            partial={Boolean(feed?.partial)}
            errorMessage={feed?.errorMessage ?? null}
            tick={tick}
          />
        ) : (
          <ListedFeed events={feed!.events} />
        )}
      </Section>
    </div>
  )
}

/* ── Empty / error state ─────────────────────────────────── */

function EmptyFeed({
  loading,
  partial,
  errorMessage,
  tick,
}: {
  loading: boolean
  partial: boolean
  errorMessage: string | null
  tick: number
}) {
  const label = errorMessage
    ? partial
      ? "RPC partial · recent events unavailable"
      : "RPC unavailable · no recent vault activity"
    : loading && tick === 0
      ? "Loading recent vault activity…"
      : "No recent vault activity in the last 50,000 blocks"
  return (
    <div className="flex-1 flex items-center px-4">
      <p
        className="font-mono text-[10.5px] tracking-wide text-muted-foreground/60"
        style={{ lineHeight: 1.4 }}
      >
        {label}
      </p>
    </div>
  )
}

/* ── Listed (compact rows) ──────────────────────────────── */

function ListedFeed({ events }: ListedFeedProps) {
  const [showAll, setShowAll] = React.useState(false)
  const visible = showAll ? events.length : Math.min(events.length, PAGE_SIZE)
  const items = events.slice(0, visible)
  const more = events.length - visible

  return (
    <>
      <ol
        className="relative flex-1 overflow-auto"
        data-testid="protocol-feed-list"
      >
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-2 bottom-2 w-px bg-border"
        />
        {items.map((e) => (
          <FeedRow key={e.id} event={e} />
        ))}
      </ol>
      {more > 0 ? (
        <div className="border-t border-border px-4 py-2 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60">
            +{more} earlier events
          </span>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="font-mono text-[10.5px] tracking-wide text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
          >
            Show all
          </button>
        </div>
      ) : null}
    </>
  )
}

function FeedRow({ event }: { event: ActivityEvent }) {
  const tone =
    event.kind === "in"
      ? "up"
      : event.kind === "out"
        ? "down"
        : "muted"
  const label =
    event.kind === "in"
      ? "IN"
      : event.kind === "out"
        ? "OUT"
        : "TRANSFER"
  return (
    <li className="relative pl-7 pr-3 py-2 border-t border-border first:border-t-0">
      <span
        aria-hidden="true"
        className={[
          "absolute left-[7px] top-3 w-1.5 h-1.5 rounded-full",
          event.kind === "in"
            ? "bg-up"
            : event.kind === "out"
              ? "bg-amber-500"
              : "bg-muted-foreground/60",
        ].join(" ")}
      />
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Pill tone={tone} dot>
            {label}
          </Pill>
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/80 truncate">
            {event.label}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70 tabular-nums shrink-0">
          {relative(event.timestamp)}
        </span>
      </div>
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground/70 mt-0.5 truncate">
        {event.amountUsdg}{" "}
        <span className="text-muted-foreground/50">USDG</span>
        {" · "}
        <a
          href={txLink(event.txHash)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          {short(event.txHash)}
        </a>
      </p>
    </li>
  )
}

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
