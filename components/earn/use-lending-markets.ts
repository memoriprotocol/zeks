"use client"

/**
 * useLendingMarkets — shared read-only Morpho lending market hook.
 *
 * Polls `/api/markets/lending` every 5 s. Single module-level
 * subscription shared across all consumers — earn + borrow pages
 * never produce duplicate concurrent fetches.
 *
 * Architecture:
 *   · Module-level Map<subscriptionId, Listener> keyed by
 *     module identity (same object reference). Earn and Borrow
 *     pages both import this — one network request, two subscribers.
 *   · 5 s poll while visible, 10 s while hidden (via
 *     document.visibilitychange).
 *   · Inflight dedupe via `inflight` ref. Per-poll AbortController
 *     + 8 s timeout.
 *   · SSR seed: pages call with initialMarkets from the server
 *     component to avoid a loading flash on first paint.
 *   · Error isolation: one page's error does NOT affect the other.
 */

import * as React from "react"
import type { LendingMarket } from "@/lib/markets/lending"
import { onDataInvalidate } from "@/components/markets/data-invalidate"

export type { LendingMarket }
export type { LendingServiceResult } from "@/lib/markets/lending"

interface SharedState {
  markets: LendingMarket[]
  loading: boolean
  errorMessage: string | null
  fetchedAt: string | null
  listeners: Set<() => void>
  started: boolean
  inflight: Promise<void> | null
  initialSeeded: boolean
}

let _shared: SharedState | null = null
let _interval: ReturnType<typeof setInterval> | null = null
let _visHandler: (() => void) | null = null

const POLL_VISIBLE_MS = 5_000
const POLL_HIDDEN_MS = 10_000
const REQUEST_TIMEOUT_MS = 8_000

function shared(): SharedState {
  if (!_shared) {
    _shared = {
      markets: [],
      loading: true,
      errorMessage: null,
      fetchedAt: null,
      listeners: new Set(),
      started: false,
      inflight: null,
      initialSeeded: false,
    }
  }
  return _shared
}

function pollInterval(): number {
  return typeof document !== "undefined" && document.hidden
    ? POLL_HIDDEN_MS
    : POLL_VISIBLE_MS
}

function resetInterval(): void {
  if (_interval != null) {
    clearInterval(_interval)
    _interval = null
  }
  _interval = setInterval(() => {
    void doPoll()
  }, pollInterval())
}

async function doPoll(): Promise<void> {
  const s = _shared
  if (!s || s.inflight) return
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  s.inflight = (async () => {
    try {
      const res = await fetch("/api/markets/lending", {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      if (!res.ok) {
        s.errorMessage = `HTTP ${res.status}`
        s.loading = false
      } else {
        const json = (await res.json()) as {
          ok: boolean
          markets: LendingMarket[]
          message?: string
        }
        if (!json.ok) {
          s.errorMessage = json.message ?? "Failed"
        } else {
          s.markets = json.markets ?? []
          s.errorMessage = null
          s.fetchedAt = new Date().toISOString()
        }
        s.loading = false
      }
    } catch (err) {
      s.errorMessage =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : "Network error"
      s.loading = false
    } finally {
      s.inflight = null
      clearTimeout(t)
      notify()
    }
  })()
  return s.inflight
}

function notify(): void {
  const s = _shared
  if (!s) return
  for (const cb of s.listeners) {
    try {
      cb()
    } catch {
      // ignore listener errors
    }
  }
}

function start(s: SharedState): void {
  if (s.started) return
  s.started = true
  void doPoll()
  resetInterval()
  _visHandler = () => resetInterval()
  document.addEventListener("visibilitychange", _visHandler)
}

function stop(): void {
  if (_interval != null) clearInterval(_interval)
  if (_visHandler) document.removeEventListener("visibilitychange", _visHandler)
  _interval = null
  _visHandler = null
  _shared = null
}

export interface UseLendingMarketsResult {
  markets: LendingMarket[]
  loading: boolean
  errorMessage: string | null
  fetchedAt: string | null
  refresh: () => Promise<void>
}

/**
 * Shared lending market hook. Provide `initialMarkets` from the
 * server component to seed the list and avoid a loading flash.
 *
 * @param initialMarkets  Markets from the server component SSR pass.
 * @param initialError    Error message from the server component.
 */
export function useLendingMarkets(
  initialMarkets: LendingMarket[] = [],
  initialError: string | null = null,
): UseLendingMarketsResult {
  const s = shared()

  // Seed from SSR on first call.
  if (!s.initialSeeded && initialMarkets.length > 0) {
    s.markets = initialMarkets
    s.loading = false
    s.errorMessage = initialError
    s.fetchedAt = new Date().toISOString()
    s.initialSeeded = true
  } else if (!s.initialSeeded && initialError) {
    s.errorMessage = initialError
    s.loading = false
    s.initialSeeded = true
  }

  React.useEffect(() => {
    start(s)
  }, [s])

  const [, tick] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => {
    s.listeners.add(tick)
    return () => {
      s.listeners.delete(tick)
    }
  }, [s])

  // Re-fetch on cross-hook invalidate events (after Supply/Borrow success).
  React.useEffect(() => {
    return onDataInvalidate(() => {
      void doPoll()
    })
  }, [])

  const refresh = React.useCallback(async () => {
    await doPoll()
  }, [])

  return {
    markets: s.markets,
    loading: s.loading,
    errorMessage: s.errorMessage,
    fetchedAt: s.fetchedAt,
    refresh,
  }
}

// HMR cleanup
if (typeof window !== "undefined") {
  ;(window as unknown as { __zeksLendingCleanup?: () => void }).__zeksLendingCleanup =
    () => stop()
}
