"use client"

/**
 * useLiquidityTvl — drives the TOTAL LIQUIDITY card.
 *
 *   - Derives totalLiquidityUsd by summing totalSupply across the
 *     shared `markets` prop, which is fed by
 *     /components/zeks/dashboard/use-market-summary.ts.
 *   - That hook polls /api/markets/lending every 3s (POLL_MS in
 *     use-market-summary.ts) and exposes the server-side
 *     `fetchedAt` timestamp. We observe that timestamp and stamp
 *     `lastSyncedAtMs = Date.now()` ONLY when it advances — i.e.
 *     after a SUCCESSFUL refresh. No artificial gating, no extra
 *     network requests, no duplicate polling loop.
 *
 * Why this shape:
 *   - Reuses the existing 3s refresh cadence (or 30s when the tab
 *     is hidden) directly. ONE source of truth for liquidity
 *     refresh timing.
 *   - On a failed fetch, `marketsFetchedAt` does NOT advance, so
 *     `lastSyncedAtMs` is NOT reset → "synced Xs ago" keeps
 *     counting up (correct failure behavior — no fake sync).
 *   - Replaces the earlier bug where the label was derived from
 *     an old upstream server timestamp that drifted into the
 *     thousands of seconds.
 */

import * as React from "react"
import { useNow } from "@/components/zeks/use-now"
import type { LendingMarket } from "@/lib/markets/lending"

export interface UseLiquidityTvlResult {
  totalLiquidityUsd: number | null
  syncedSecondsAgo: number | null
}

export function useLiquidityTvl(opts: {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
}): UseLiquidityTvlResult {
  const { markets, marketsFetchedAt } = opts

  // Live ticker · 1s · drives the "synced Xs ago" label.
  const now = useNow(1000)

  // Total TVL = sum of totalSupply across the shared markets feed.
  const totalLiquidityUsd = React.useMemo(
    () => sumMarkets(markets),
    [markets],
  )

  // Wall-clock ms of the most recent observed upstream fetch
  // timestamp. Reset ONLY when the parent reports a new, valid
  // `marketsFetchedAt`. This is the client-side stamp — it has
  // no relationship to upstream server clocks.
  const [lastSyncedAtMs, setLastSyncedAtMs] = React.useState<number | null>(
    null,
  )
  const lastSeenTimestampRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!marketsFetchedAt) return
    // Only react to genuinely NEW upstream timestamps. This guards
    // against React 18 strict-mode double effects and against the
    // case where the same fetchedAt is replayed on re-render.
    if (lastSeenTimestampRef.current === marketsFetchedAt) return
    lastSeenTimestampRef.current = marketsFetchedAt
    setLastSyncedAtMs(Date.now())
  }, [marketsFetchedAt])

  const syncedSecondsAgo = React.useMemo(() => {
    if (lastSyncedAtMs == null) return null
    return Math.max(0, Math.floor((now - lastSyncedAtMs) / 1000))
  }, [lastSyncedAtMs, now])

  return { totalLiquidityUsd, syncedSecondsAgo }
}

function sumMarkets(markets: LendingMarket[]): number | null {
  if (!Array.isArray(markets) || markets.length === 0) return null
  let total = 0
  let any = false
  for (const m of markets) {
    const v = m?.totalSupply ?? null
    if (v != null && Number.isFinite(v)) {
      total += v
      any = true
    }
  }
  return any ? total : null
}
