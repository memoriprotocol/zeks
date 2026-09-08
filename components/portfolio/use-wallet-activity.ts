"use client"

/**
 * useWalletActivity — read-only activity hook.
 *
 * Loads recent transactions for the connected wallet from the
 * Robinhood Chain Blockscout explorer. Polls every 60 s. When the
 * wallet disconnects we reset to an empty list.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { Address } from "@/lib/wallet/types-common"
import {
  fetchWalletActivity,
  type ActivityItem,
} from "@/lib/markets/activity"

const POLL_INTERVAL_MS = 60_000

export interface UseWalletActivityResult {
  activity: ActivityItem[]
  loading: boolean
  /** Surfaces a human-readable error from the upstream explorer. */
  activityError: string | null
  /** True when this chain does not surface a reliable activity feed. */
  activityUnsupported: boolean
  /** Reserved — kept as an alias for legacy call-sites. */
  error: string | null
  unsupported: boolean
}

export function useWalletActivity(): UseWalletActivityResult {
  const wallet = useWallet()
  const [items, setItems] = React.useState<ActivityItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [unsupported, setUnsupported] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (wallet.status !== "connected" || !wallet.address) {
      setItems([])
      setError(null)
      setUnsupported(false)
      return
    }
    setLoading(true)
    try {
      const r = await fetchWalletActivity(wallet.address as Address, {
        chainId: wallet.chainId ?? 4663,
      })
      setItems(r.items)
      setError(r.errorMessage)
      setUnsupported(r.unsupported)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [wallet.status, wallet.address, wallet.chainId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (wallet.status !== "connected") return
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [wallet.status, refresh])

  return {
    activity: items,
    loading,
    activityError: error,
    activityUnsupported: unsupported,
    error,
    unsupported,
  }
}
