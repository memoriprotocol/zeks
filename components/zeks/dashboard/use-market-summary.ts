"use client"

/**
 * useMarketSummary — polls /api/markets/lending every 3 seconds.
 *
 * Used by the Dashboard to keep Total Liquidity / Borrow APYs /
 * per-market values current without an F5.
 *
 *   · Server side: the endpoint already caches the upstream Robinhood
 *     payload for 15s and dedupes in-flight.
 *   · Client side: this hook throttles to 3s (per spec), dedupes
 *     intervals, pauses (15s slow-poll) when document.hidden.
 */

import * as React from "react"
import { useDocumentVisible } from "@/components/zeks/use-document-visible"
import type { LendingMarket } from "@/lib/markets/lending"

interface LendingSummaryPayload {
  ok: boolean
  markets: LendingMarket[]
  failedSymbols: string[]
  fetchedAt: string
  message?: string
}

export interface UseMarketSummaryResult {
  markets: LendingMarket[]
  fetchedAt: string | null
  error: string | null
}

const POLL_MS = 3_000
const POLL_HIDDEN_MS = 30_000

export function useMarketSummary(initial?: {
  markets?: LendingMarket[]
  fetchedAt?: string | null
}): UseMarketSummaryResult {
  const visible = useDocumentVisible()
  const [markets, setMarkets] = React.useState<LendingMarket[]>(
    () => initial?.markets ?? [],
  )
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(
    () => initial?.fetchedAt ?? null,
  )
  const [error, setError] = React.useState<string | null>(null)
  const inflightRef = React.useRef<Promise<void> | null>(null)

  const refresh = React.useCallback(async () => {
    if (inflightRef.current) return inflightRef.current
    inflightRef.current = (async () => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8_000)
        const res = await fetch("/api/markets/lending", {
          method: "GET",
          signal: ctrl.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        })
        clearTimeout(t)
        if (!res.ok) return
        const j = (await res.json()) as LendingSummaryPayload
        if (j.ok && Array.isArray(j.markets)) {
          setMarkets((prev) => {
            if (prev.length === j.markets.length && prev === j.markets) {
              return prev
            }
            return j.markets
          })
          setFetchedAt(j.fetchedAt ?? new Date().toISOString())
          setError(null)
        } else {
          setError(j.message ?? "Live data unavailable")
        }
      } catch {
        // keep last known good
      } finally {
        inflightRef.current = null
      }
    })()
    return inflightRef.current
  }, [])

  React.useEffect(() => {
    // Initial fire so the dashboard reaches parity with server-rendered values.
    if (!initial?.markets || initial.markets.length === 0) {
      void refresh()
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const interval = visible ? POLL_MS : POLL_HIDDEN_MS
    const id = window.setInterval(() => {
      void refresh()
    }, interval)
    return () => window.clearInterval(id)
  }, [visible, refresh])

  return { markets, fetchedAt, error }
}
