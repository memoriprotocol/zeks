"use client"

/**
 * ActivityLive (v4 — Protocol-wide vault activity)
 *
 * UI shell preserved from v3 — same title, copy, table layout,
 * empty/error states. Only the data source and a small
 * status/refresh row + Load-more pagination are added.
 *
 *   · Read-only. No browser-side RPC, no signing, no wallet queries.
 *   · Polls every 2.5s (visible) / 10s (hidden). Single shared
 *     subscription — never stacks intervals.
 *   · Dedupe by (txHash, logIndex) on the client.
 *   · New rows appear in place (no F5 needed).
 *   · Pagination: in-memory "Load more" widens the visible slice
 *     without forcing a 50k-block rescan.
 *   · Graceful states: loading · empty · API unavailable ·
 *     RPC unavailable (partial). Never throws.
 */

import * as React from "react"
import Link from "next/link"
import {
  useProtocolActivity,
  type ProtocolActivityEvent,
} from "@/components/activity/use-protocol-activity"
import { explorerTxUrl } from "@/lib/explorer/robinhood-chain"
import { formatTokenAmount } from "@/lib/markets/format"
import { safeFormatBlock } from "@/lib/markets/fmt"

const PAGE_STEP = 12
const INITIAL_VISIBLE = 24

export default function ActivityLive() {
  const {
    events,
    loading,
    errorMessage,
    partial,
    latestBlock,
    updatedAt,
    refresh,
  } = useProtocolActivity()

  const [visibleCount, setVisibleCount] = React.useState(INITIAL_VISIBLE)

  // When the newest event id changes (i.e. a new row arrives on top),
  // collapse the list back to the initial visible count so the user
  // sees the new event without paging.
  const firstId = events[0]?.id
  React.useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [firstId])

  const visible = events.slice(0, visibleCount)
  const canLoadMore = events.length > visible.length

  const statusLabel =
    loading && events.length === 0
      ? "Connecting…"
      : errorMessage && events.length === 0
        ? "API unavailable"
        : errorMessage
          ? "Partial · retrying"
          : "Live"

  return (
    <div className="zeks-page">
      <header className="zeks-page-title-row" data-activity-header>
        <div className="zeks-block" style={{ gap: "6px" }}>
          <span className="zeks-label" data-testid="activity-eyebrow">
            Activity
          </span>
          <h1 className="zeks-display" style={{ fontSize: "26px", letterSpacing: "-0.035em", lineHeight: 1.05 }}>
            Activity
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted-foreground)",
              maxWidth: "52ch",
              lineHeight: 1.5,
              letterSpacing: "-0.005em",
            }}
          >
            Verified Loopr vault transfers on Robinhood Chain.
          </p>
        </div>
      </header>

      <div className="zeks-footer-nav" data-activity-status-row>
        <StatusPill
          label={statusLabel}
          tone={
            errorMessage && events.length === 0
              ? "down"
              : partial
                ? "warn"
                : "up"
          }
        />
        <span className="zeks-meta-strong" data-testid="activity-meta">
          block #
          {latestBlock != null ? safeFormatBlock(latestBlock) : "—"}
          {updatedAt ? ` · synced ${formatAgo(updatedAt)}` : ""}
          {events.length > 0 ? ` · ${events.length} events` : ""}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto"
          aria-label="Refresh activity"
        >
          ↻ Refresh
        </button>
      </div>

      {errorMessage && events.length === 0 ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => void refresh()}
        />
      ) : null}

      {events.length === 0 && !errorMessage ? (
        <section
          className="zeks-empty"
          data-activity-empty
        >
          <span className="zeks-section-title text-[14px] text-foreground">
            No recent activity
          </span>
          <span className="zeks-dim">
            No verified vault transfers detected on Robinhood Chain in
            the recent scan window.
          </span>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section
          className="rounded-2xl border border-border bg-card overflow-hidden"
          aria-label="Recent activity"
          data-activity-table
        >
          <ul className="divide-y divide-border">
            {visible.map((e, idx) => (
              <ActivityRow
                key={e.id}
                event={e}
                isFresh={idx === 0 && !loading}
              />
            ))}
          </ul>
          {canLoadMore ? (
            <div className="flex items-center justify-center px-4 py-3 border-t border-border bg-card-soft gap-3">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((n) =>
                    Math.min(events.length, n + PAGE_STEP),
                  )
                }
                className="zeks-meta text-muted-foreground hover:text-foreground transition-colors"
                data-testid="activity-load-more"
              >
                Load more ↓
              </button>
              <span
                className="tabular-nums text-muted-foreground/60 text-[11px]"
                aria-hidden="true"
              >
                {events.length - visible.length} more
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {partial && events.length > 0 ? (
        <p
          className="mt-3 zeks-meta text-amber-700 dark:text-amber-300"
          data-testid="activity-partial"
        >
          RPC unavailable · partial data · retrying
        </p>
      ) : null}

      <p className="mt-3 zeks-meta text-muted-foreground/70">
        {loading && events.length === 0
          ? "Connecting…"
          : "Robinhood Chain · verified Loopr vaults"}
      </p>
    </div>
  )
}

/* ── Row ──────────────────────────────────────────── */

function ActivityRow({
  event,
  isFresh,
}: {
  event: ProtocolActivityEvent
  isFresh: boolean
}) {
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
    <li
      data-feed-row={event.id}
      data-fresh={isFresh ? "1" : undefined}
      className={isFresh ? "zeks-anim-row-insert" : undefined}
    >
      <Link
        href={explorerTxUrl(event.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 px-4 h-12 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={
              "inline-flex items-center px-1.5 h-5 rounded-[4px] zeks-eyebrow shrink-0 " +
              (tone === "up"
                ? "text-up"
                : tone === "down"
                  ? "text-down"
                  : "text-muted-foreground")
            }
            data-feed-tone={tone}
          >
            {label}
          </span>
          <span
            className="zeks-symbol-sm truncate"
            data-feed-vault
          >
            {event.label}
          </span>
          <span
            className="tabular-nums font-sans text-[13px] text-muted-foreground shrink-0"
            data-feed-amount
          >
            {formatTokenAmount(event.amountUsdg)} USDG
          </span>
        </div>
        <div className="flex items-center gap-4 text-[12px] font-sans shrink-0">
          <span className="text-muted-foreground tabular-nums">
            #{safeFormatBlock(event.blockNumber)}
          </span>
          <span
            className="zeks-tech-sm text-muted-foreground truncate"
            data-feed-hash
          >
            {shortenHash(event.txHash)}
          </span>
          <span
            className="text-muted-foreground tabular-nums shrink-0"
            data-feed-time
          >
            {event.timestamp != null
              ? formatRelative(event.timestamp)
              : "—"}
          </span>
        </div>
      </Link>
    </li>
  )
}

/* ── Status pill ─────────────────────────────────── */

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: "up" | "down" | "warn"
}) {
  const dotColor =
    tone === "up"
      ? "var(--up)"
      : tone === "down"
        ? "var(--down)"
        : "var(--muted-foreground)"
  return (
    <span
      className="zeks-chip"
      data-testid="activity-status"
      data-tone={tone}
    >
      <span
        aria-hidden="true"
        className="zeks-chip-dot"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      className="zeks-card-tight flex items-center justify-between gap-3"
      style={{ borderColor: "var(--border)" }}
      data-testid="activity-error"
    >
      <span className="text-[12px] text-foreground/80">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="zeks-btn-ghost"
      >
        Retry
      </button>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────── */

function shortenHash(h: string): string {
  if (h.length < 14) return h
  return `${h.slice(0, 10)}…${h.slice(-4)}`
}

function formatAgo(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 1500) return "just now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatRelative(ts: number): string {
  const ms = Math.max(0, Date.now() - ts * 1000)
  if (ms < 1500) return "just now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
