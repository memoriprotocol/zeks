"use client"

/**
 * useMarketActivity
 *
 * Read-only recent wallet activity for the market-detail page.
 *
 * The market detail page never decodes calldata, so we surface the
 * user's wallet txlist as-is (Blockscout) and label each row
 * "Transaction" — never invent a supply/borrow action type.
 *
 * When the wallet is not connected we return an `idle` state so
 * the UI can show a single compact CTA.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  fetchWalletActivity,
  type ActivityItem,
} from "@/lib/markets/activity"
import type { Address } from "@/lib/wallet/types-common"

const POLL_INTERVAL_MS = 60_000
const MAX_ITEMS = 5

export interface UseMarketActivityResult {
  kind: "idle" | "loading" | "live" | "empty" | "wrong-network" | "unavailable"
  items: ActivityItem[]
  error: string | null
  refresh: () => Promise<void>
}

export function useMarketActivity(): UseMarketActivityResult {
  const wallet = useWallet()
  const [items, setItems] = React.useState<ActivityItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [kind, setKind] = React.useState<UseMarketActivityResult["kind"]>("idle")

  const refresh = React.useCallback(async () => {
    if (
      wallet.status === "idle" ||
      wallet.status === "available" ||
      wallet.status === "disconnected" ||
      wallet.status === "initializing" ||
      !wallet.address
    ) {
      setItems([])
      setError(null)
      setKind("idle")
      return
    }
    if (wallet.chainId != null && wallet.chainId !== 4663) {
      setItems([])
      setError(null)
      setKind("wrong-network")
      return
    }
    setLoading(true)
    try {
      const r = await fetchWalletActivity(wallet.address as Address, {
        chainId: wallet.chainId ?? 4663,
      })
      setItems(r.items.slice(0, MAX_ITEMS))
      setError(r.errorMessage)
      if (r.items.length === 0) {
        setKind("empty")
      } else if (r.unsupported || r.errorMessage) {
        setKind("unavailable")
      } else {
        setKind("live")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setKind("unavailable")
    } finally {
      setLoading(false)
    }
  }, [wallet.status, wallet.address, wallet.chainId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (kind !== "live" && kind !== "empty") return
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [kind, refresh])

  return { kind, items, error, refresh }
}
