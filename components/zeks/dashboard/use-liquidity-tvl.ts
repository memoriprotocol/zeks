"use client"

/**
 * useLiquidityTvl — drives the TOTAL LIQUIDITY card refresh.
 *
 *   - Derives totalLiquidityUsd by summing totalSupply across the
 *     shared `markets` prop (provided by useMarketSummary at
 *     /components/zeks/dashboard/use-market-summary.ts, which
 *     polls /api/markets/lending).
 *   - Stamps `lastSyncedAtMs = Date.now()` ONLY when a fresh
 *     `marketsFetchedAt` arrives, and ONLY at most once per
 *     10-second cycle. This is what powers "synced Xs ago".
 *
 * Why this shape:
 *   - Reuses the existing `/api/markets/lending` polling loop. No
 *     duplicate network requests.
 *   - The card's data refresh cadence is exactly 10s, as required.
 *   - On a failed fetch the parent never advances `marketsFetchedAt`,
 *     so `lastSyncedAtMs` is NOT reset → "synced Xs ago" keeps
 *     counting up (correct failure behavior).
 *   - Replaces the earlier bug where the label was derived from the
 *     upstream server timestamp, which drifted into the thousands
 *     of seconds during a long-lived browser tab.
 */

import * as React from "react"
import { useNow } from "@/components/zeks/use-now"
import type { LendingMarket } from "@/lib/markets/lending"

const SYNC_GATE_MS = 10_000

export interface UseLiquidityTvlResult {
  totalLiquidityUsd: number | null
  lastSyncedAtMs: number | null
  /** True until the very first sample is stamped. */
  loading: boolean
}

export function useLiquidityTvl(opts: {
  markets: LendingMarket[]
  marketsFetchedAt: string | null
}): UseLiquidityTvlResult {
  const { markets, marketsFetchedAt } = opts

  // Live ticker · 1s · drives the "synced Xs ago" label.
  const now = useNow(1000)

  // True totalSupply sum across the shared markets feed.
  const totalLiquidityUsd = React.useMemo(
    () => sumMarkets(markets),
    [markets],
  )

  // Wall-clock ms of the most recent 10s-gated, SUCCESSFUL feed
  // observation. The 10s gate guarantees the "synced" timer resets
  // to 0 only every ~10s (matches the spec) even if the upstream
  // poll arrives every 3s.
  const [lastSyncedAtMs, setLastSyncedAtMs] = React.useState<number | null>(
    null,
  )
  const lastAcceptedMsRef = React.useRef<number>(0)

  React.useEffect(() => {
    if (!marketsFetchedAt) return
    const t = Date.parse(marketsFetchedAt)
    if (!Number.isFinite(t)) return
    // Gate: ignore new fetch timestamps arriving within 10s of the
    // last accepted one. The NEXT acceptable sample will reset the
    // timer back to ~0s.
    if (t < lastAcceptedMsRef.current) return
    if (lastAcceptedMsRef.current !== 0 && t - lastAcceptedMsRef.current < SYNC_GATE_MS) {
      return
    }
    lastAcceptedMsRef.current = t
    // Stamp wall-clock "now" so the timer reads "0s ago" exactly
    // when the cycle resets — independent of upstream server clock.
    setLastSyncedAtMs(Date.now())
  }, [marketsFetchedAt])

  const syncedSecondsAgo = React.useMemo(() => {
    if (lastSyncedAtMs == null) return null
    return Math.max(0, Math.floor((now - lastSyncedAtMs) / 1000))
  }, [lastSyncedAtMs, now])

  // Initial loading: we have a markets prop but no successful
  // 10s-gated sample yet.
  const loading = lastSyncedAtMs == null

  return {
    totalLiquidityUsd,
    lastSyncedAtMs: syncedSecondsAgo,
    loading,
  }
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
