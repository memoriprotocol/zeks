"use client"

/**
 * useProtocolActivity — client-side protocol activity feed.
 *
 * Polls `/api/protocol/activity` (server-cached, incremental scan
 * over verified Loopr vaults on Robinhood Chain). Never calls RPC
 * directly from the browser.
 *
 * Architecture:
 *   · 2.5s poll while tab is visible, 10s while hidden.
 *   · Inflight dedupe via useRef — never queue overlapping fetches.
 *   · Per-poll AbortController + 8s timeout.
 *   · Client-side dedupe by `id = "<txHash>-<logIndex>"`.
 *     Multiple polls cannot produce duplicate rows.
 *   · Sorted newest-first by (blockNumber DESC, logIndex DESC).
 *   · Single module-level subscription — multiple components can
 *     mount this hook without stacking intervals.
 *   · Exposes the merged & deduped list to the consumer. The
 *     "Load more" UX reuses the same in-memory list (it was already
 *     paginated server-side to 60 events, so Load more only widens
 *     the visible slice — never forces a 50k-block rescan).
 */

import * as React from "react"

export type ProtocolActivityKind = "in" | "out" | "transfer"
export type ProtocolActivityVenue =
  | "steakhouse"
  | "ethena-steakhouse"
  | "grove-steakhouse"

export interface ProtocolActivityEvent {
  id: string
  txHash: `0x${string}`
  logIndex: number
  blockNumber: number
  /** Unix epoch seconds (UTC). null when block lookup failed. */
  timestamp: number | null
  vault: `0x${string}`
  venue: ProtocolActivityVenue
  label: string
  kind: ProtocolActivityKind
  amountUsdg: string
}

export interface ProtocolActivityPayload {
  ok: boolean
  events: ProtocolActivityEvent[]
  addedLast6Deposits: string
  latestBlock: number | null
  fromBlock: number | null
  updatedAt: string
  errorMessage: string | null
  partial: boolean
}

export interface UseProtocolActivityResult {
  events: ProtocolActivityEvent[]
  loading: boolean
  /** API / network error message (page-level). null on success. */
  errorMessage: string | null
  /** True when the upstream RPC returned partial data (some vaults OK). */
  partial: boolean
  /** Latest known chain head from /api/protocol/head is tracked elsewhere. */
  latestBlock: number | null
  /** Block range actually scanned for the most recent poll. */
  fromBlock: number | null
  /** ISO timestamp of the most recent successful poll. */
  updatedAt: string | null
  /** Force a fresh poll immediately. */
  refresh: () => Promise<void>
}

/* ── Constants ─────────────────────────────────────── */

const POLL_VISIBLE_MS = 2_500
const POLL_HIDDEN_MS = 10_000
const REQUEST_TIMEOUT_MS = 8_000

/* ── Shared subscription (single network connection) ── */

interface SharedState {
  events: Map<string, ProtocolActivityEvent>
  loading: boolean
  errorMessage: string | null
  partial: boolean
  latestBlock: number | null
  fromBlock: number | null
  updatedAt: string | null
  listeners: Set<() => void>
  started: boolean
  inflight: Promise<void> | null
}

let shared: SharedState | null = null
let sharedInterval: number | null = null
let visibilityHandler: (() => void) | null = null

function ensureShared(): SharedState {
  if (shared) return shared
  shared = {
    events: new Map(),
    loading: true,
    errorMessage: null,
    partial: false,
    latestBlock: null,
    fromBlock: null,
    updatedAt: null,
    listeners: new Set(),
    started: false,
    inflight: null,
  }
  return shared
}

async function pollOnce(s: SharedState): Promise<void> {
  if (s.inflight) return s.inflight
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  s.inflight = (async () => {
    try {
      const res = await fetch("/api/protocol/activity", {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        s.errorMessage = `Feed unavailable (HTTP ${res.status})${text ? `: ${truncate(text, 80)}` : ""}`
      } else {
        const json = (await res.json()) as ProtocolActivityPayload
        if (json && json.ok === false) {
          s.errorMessage = json.errorMessage ?? "Feed unavailable"
        } else if (json && Array.isArray(json.events)) {
          // Merge in. Dedupe by id; sort newest-first.
          for (const e of json.events) {
            if (e && typeof e.id === "string" && typeof e.txHash === "string") {
              s.events.set(e.id, e)
            }
          }
          // The API returns sorted newest-first, but the merged map
          // could include older cached entries from earlier scans.
          // We re-sort on demand at consumer side, so just keep the map.
          s.errorMessage = null
          s.partial = json.partial === true
          s.latestBlock = typeof json.latestBlock === "number" ? json.latestBlock : null
          s.fromBlock = typeof json.fromBlock === "number" ? json.fromBlock : null
          s.updatedAt = typeof json.updatedAt === "string" ? json.updatedAt : null
        } else {
          s.errorMessage = "Feed unavailable: bad payload"
        }
      }
    } catch (err) {
      s.errorMessage =
        err instanceof Error && err.name === "AbortError"
          ? "Feed unavailable: request timed out"
          : `Feed unavailable${err instanceof Error ? `: ${err.message}` : ""}`
    } finally {
      s.loading = false
      s.inflight = null
      window.clearTimeout(t)
      notify(s)
    }
  })()
  return s.inflight
}

function notify(s: SharedState): void {
  for (const cb of s.listeners) {
    try {
      cb()
    } catch {
      // listener error — ignore
    }
  }
}

function startShared(s: SharedState): void {
  if (s.started) return
  s.started = true
  // initial poll
  void pollOnce(s)
  const interval = () =>
    document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS
  sharedInterval = window.setInterval(() => {
    void pollOnce(s)
  }, interval())
  visibilityHandler = () => {
    // Reset interval when visibility flips
    if (sharedInterval != null) window.clearInterval(sharedInterval)
    sharedInterval = window.setInterval(() => {
      void pollOnce(s)
    }, interval())
  }
  document.addEventListener("visibilitychange", visibilityHandler)
}

function stopShared(): void {
  if (sharedInterval != null) window.clearInterval(sharedInterval)
  if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler)
  sharedInterval = null
  visibilityHandler = null
  shared = null
}

/* ── Hook ─────────────────────────────────────────── */

export function useProtocolActivity(): UseProtocolActivityResult {
  const s = ensureShared()
  React.useEffect(() => {
    startShared(s)
  }, [s])

  const [, force] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => {
    const cb = () => force()
    s.listeners.add(cb)
    return () => {
      s.listeners.delete(cb)
    }
  }, [s])

  // Sort newest-first (stable; same id set, just a re-emit).
  const sorted = React.useMemo<ProtocolActivityEvent[]>(() => {
    return Array.from(s.events.values()).sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return b.blockNumber - a.blockNumber
      }
      return b.logIndex - a.logIndex
    })
  }, [s.events, s.updatedAt])

  const refresh = React.useCallback(async () => {
    await pollOnce(s)
  }, [s])

  return {
    events: sorted,
    loading: s.loading,
    errorMessage: s.errorMessage,
    partial: s.partial,
    latestBlock: s.latestBlock,
    fromBlock: s.fromBlock,
    updatedAt: s.updatedAt,
    refresh,
  }
}

/* ── Helpers ──────────────────────────────────────── */

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1)}…`
}

// Allow cleanup at HMR. Not strictly required for production.
if (typeof window !== "undefined") {
  ;(window as unknown as { __zeksProtocolFeedCleanup?: () => void }).__zeksProtocolFeedCleanup =
    () => stopShared()
}
