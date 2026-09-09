"use client"

/**
 * LiveSyncedTag — "updated Xs ago" pill.
 *
 *   · Calls useNow(1000) so the relative timer ticks every second.
 *   · Supports `null` / `undefined` ⇒ renders "—".
 *
 * Hydration safety:
 *   On the server and during the first client paint (before the
 *   useEffect runs) the relative time would differ between SSR
 *   and client (server Date.now() != client Date.now()). To keep
 *   the markup stable we suppress the relative part until the
 *   client has produced its first `now`. The container element
 *   (a span with the dot + prefix) is always present so layout
 *   does not jump.
 *
 * Uses the project's typography tokens (font-mono, 11px muted).
 */

import * as React from "react"
import { useNow } from "@/components/zeks/use-now"

interface LiveSyncedTagProps {
  /** ISO timestamp of the upstream fetch. */
  fetchedAt: string | null | undefined
  /** Override the leading word. Default "Updated". */
  prefix?: string
  /** Optional className. */
  className?: string
  /** Optional testid. */
  testId?: string
}

export function LiveSyncedTag({
  fetchedAt,
  prefix = "Updated",
  className,
  testId,
}: LiveSyncedTagProps) {
  const now = useNow(1000)
  const text = React.useMemo(() => {
    if (!fetchedAt) return "—"
    // Suppress relative time until the client has produced its
    // first `now`. This keeps SSR / first-paint markup identical
    // between server and client.
    if (now == null) return prefix
    const t = Date.parse(fetchedAt)
    if (!Number.isFinite(t)) return "—"
    const ms = Math.max(0, now - t)
    if (ms < 1500) return `${prefix} just now`
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${prefix} ${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${prefix} ${m}m ago`
    const h = Math.floor(m / 60)
    return `${prefix} ${h}h ago`
  }, [now, fetchedAt, prefix])

  return (
    <span
      className={
        "font-mono tabular-nums inline-flex items-center gap-1.5 " +
        (className ?? "")
      }
      data-testid={testId}
      style={{
        fontSize: "11px",
        color: "var(--muted-foreground)",
      }}
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full shrink-0 zeks-anim-pulse"
        style={{ backgroundColor: "var(--up)" }}
      />
      {text}
    </span>
  )
}
