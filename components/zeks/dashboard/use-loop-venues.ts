"use client"

/**
 * useLoopVenues — polls /api/loop/markets every 5 seconds.
 *
 * Used by the Dashboard's Yield Venues section.
 *
 *   · Refreshes `venues` and `fetchedAt` independently from the
 *     server-rendered initial values.
 *   · Throttles to 30s when document.hidden.
 *   · Dedupes intervals; never issues parallel requests.
 */

import * as React from "react"
import { useDocumentVisible } from "@/components/zeks/use-document-visible"
import type { YieldVenue } from "@/lib/markets/loop/types"

interface LoopMarketsPayload {
  ok: boolean
  yieldVenues?: YieldVenue[]
  fetchedAt?: string
  message?: string
}

export interface UseLoopVenuesResult {
  venues: YieldVenue[]
  fetchedAt: string | null
  error: string | null
}

const POLL_MS = 5_000
const POLL_HIDDEN_MS = 30_000

export function useLoopVenues(initial?: {
  venues?: YieldVenue[]
  fetchedAt?: string | null
}): UseLoopVenuesResult {
  const visible = useDocumentVisible()
  const [venues, setVenues] = React.useState<YieldVenue[]>(
    () => initial?.venues ?? [],
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
        const res = await fetch("/api/loop/markets", {
          method: "GET",
          signal: ctrl.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        })
        clearTimeout(t)
        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          return
        }
        const j = (await res.json()) as LoopMarketsPayload
        if (j.ok && Array.isArray(j.yieldVenues)) {
          setVenues((prev) =>
            prev.length === j.yieldVenues!.length && prev === j.yieldVenues
              ? prev
              : j.yieldVenues!,
          )
          if (j.fetchedAt) setFetchedAt(j.fetchedAt)
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
    // No initial fire if server already provided values — it'll
    // happen after the user's first interval tick.
    if (!initial?.venues || initial.venues.length === 0) {
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

  return { venues, fetchedAt, error }
}
