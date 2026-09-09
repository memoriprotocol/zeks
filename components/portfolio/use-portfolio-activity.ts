"use client"

/**
 * usePortfolioActivity
 *
 * Bridges the existing realtime protocol activity feed
 * (`/api/protocol/activity`, via the shared `useProtocolActivity`)
 * into the `ActivityItem` shape that `PortfolioActivity` already
 * consumes. No additional network call — multiple portfolio-related
 * consumers share the same single subscription.
 *
 * Reused by /terminal/portfolio as the page-level recent activity
 * feed. No per-wallet Blockscout polling, no direct RPC reads, no
 * fabrication.
 */

import * as React from "react"
import type { ActivityItem } from "@/lib/markets/activity"
import { useProtocolActivity } from "@/components/activity/use-protocol-activity"

export interface UsePortfolioActivityResult {
  items: ActivityItem[]
  loading: boolean
  error: string | null
  unsupported: boolean
}

export function usePortfolioActivity(): UsePortfolioActivityResult {
  const { events, loading, errorMessage } = useProtocolActivity()

  const items = React.useMemo<ActivityItem[]>(() => {
    return events.slice(0, 20).map((e) => ({
      hash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp != null ? new Date(e.timestamp * 1000).toISOString() : null,
      // Protocol events don't include a wallet-side from/to; the
      // portfolio page renders these as protocol activity rather
      // than wallet tx list, so we leave the counterparty as null.
      from: "0x0" as ActivityItem["from"],
      to: e.vault,
      valueRaw: BigInt(0),
      reverted: false,
      gasUsed: null,
    }))
  }, [events])

  return {
    items,
    loading,
    error: errorMessage,
    unsupported: false,
  }
}
