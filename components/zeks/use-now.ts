"use client"

/**
 * useNow — a re-rendering clock.
 *
 * Returns the current epoch ms and updates every `intervalMs`
 * (default 1000). Client-only; safe to call in render because the
 * interval is owned by a ref and torn down on unmount.
 *
 * Hydration safety:
 *   The first paint uses `null` so the server and the first
 *   client render produce identical output. The actual time is
 *   set inside `useEffect`, which only runs on the client.
 *
 * Usage:
 *   const now = useNow(1000)
 *   if (now == null) return null
 *   return <span>updated {formatAgo(now, fetchedAt)}</span>
 */
import * as React from "react"

export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = React.useState<number | null>(null)

  React.useEffect(() => {
    // Update immediately so the first client paint is correct.
    setNow(Date.now())
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
