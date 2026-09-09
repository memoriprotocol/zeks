"use client"

/**
 * useNow — a re-rendering clock.
 *
 * Returns the current epoch ms and updates every `intervalMs`
 * (default 1000). Client-only; safe to call in render because the
 * interval is owned by a ref and torn down on unmount.
 *
 * Usage:
 *   const now = useNow(1000)
 *   return <span>updated {formatAgo(now, fetchedAt)}</span>
 */
import * as React from "react"

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    // Update immediately so the first paint is correct.
    setNow(Date.now())
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
