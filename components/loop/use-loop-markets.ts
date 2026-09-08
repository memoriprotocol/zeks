"use client"

/**
 * useLoopMarkets
 *
 * Fetches curated LoopMarkets + YieldVenues from the ZEKS API in
 * one round-trip.
 *
 * Polls every 90 s while the page is mounted. Loop data is fully
 * read-only and refreshes modestly.
 */

import * as React from "react"
import type { LoopMarket, YieldVenue } from "@/lib/markets/loop/types"

const POLL_INTERVAL_MS = 90_000

interface UseLoopMarketsResult {
  markets: LoopMarket[]
  yieldVenues: YieldVenue[]
  loading: boolean
  error: string | null
  fetchedAt: string | null
}

interface ApiResponse {
  ok: boolean
  markets?: LoopMarket[]
  yieldVenues?: YieldVenue[]
  message?: string
  fetchedAt?: string
}

export function useLoopMarkets(): UseLoopMarketsResult {
  const [markets, setMarkets] = React.useState<LoopMarket[]>([])
  const [yieldVenues, setVenues] = React.useState<YieldVenue[]>([])
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch("/api/loop/markets")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: ApiResponse) => {
        if (cancelled) return
        if (!data.ok) throw new Error(data.message ?? "Unknown error")
        setMarkets(data.markets ?? [])
        setVenues(data.yieldVenues ?? [])
        setFetchedAt(data.fetchedAt ?? null)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const cleanup = refresh()
    return cleanup
  }, [refresh, tick])

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  return { markets, yieldVenues, loading, error, fetchedAt }
}
