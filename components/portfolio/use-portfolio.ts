"use client"

/**
 * usePortfolio
 *
 * Live read-only hook. Aggregates:
 *
 *   - Morpho user positions (via api.morpho.org/graphql)
 *   - Wallet ERC20 balances for tokens the user has touched
 *
 * Cadence:
 *   - Initial fetch on mount and whenever the wallet address,
 *     chain id, or status changes (immediate).
 *   - Polls every 5 s while connected and the tab is visible.
 *   - Slows to 10 s while `document.hidden`.
 *
 * NEVER fabricates data. Every value traces to either the Morpho
 * API or a real `eth_call` against the wallet's RPC.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  buildPortfolioSnapshot,
  type PortfolioSnapshot,
} from "@/lib/markets/portfolio"

const POLL_VISIBLE_MS = 5_000
const POLL_HIDDEN_MS = 10_000

function pollIntervalMs(): number {
  return typeof document !== "undefined" && document.hidden
    ? POLL_HIDDEN_MS
    : POLL_VISIBLE_MS
}

export interface UsePortfolioResult {
  snapshot: PortfolioSnapshot | null
  loading: boolean
  refresh: () => Promise<void>
}

export function usePortfolio(): UsePortfolioResult {
  const wallet = useWallet()
  const [snapshot, setSnapshot] = React.useState<PortfolioSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (wallet.status !== "connected") return
    setLoading(true)
    try {
      const provider =
        typeof window !== "undefined"
          ? ((window as unknown as { ethereum?: EIP1193Provider })
              .ethereum ?? null)
          : null
      const r = await buildPortfolioSnapshot({
        walletAddress: wallet.address as Address | null,
        walletChainId: wallet.chainId,
        walletProvider: provider,
      })
      setSnapshot(r)
    } catch {
      // buildPortfolioSnapshot resolves with issues[]; defensive
      // catch for unexpected runtime errors.
    } finally {
      setLoading(false)
    }
  }, [wallet.status, wallet.address, wallet.chainId])

  // Immediate refresh on account / network / status change.
  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Polling while connected, visibility-aware cadence.
  React.useEffect(() => {
    if (wallet.status !== "connected") return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id != null) clearInterval(id)
      id = setInterval(() => void refresh(), pollIntervalMs())
    }
    start()
    const onVisibility = () => start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      if (id != null) clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [wallet.status, refresh])

  return { snapshot, loading, refresh }
}
