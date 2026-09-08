"use client"

/**
 * usePortfolio
 *
 * Live read-only hook. Aggregates:
 *
 *   - Morpho user positions (via api.morpho.org/graphql)
 *   - Wallet ERC20 balances for tokens the user has touched
 *
 * Polls every 30 s while connected. Recomputes when the wallet
 * state changes (accountsChanged / chainChanged). Resets to
 * disconnected state on disconnect.
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

const POLL_INTERVAL_MS = 30_000

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
  }, [wallet.address, wallet.chainId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (wallet.status !== "connected") return
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [wallet.status, refresh])

  return { snapshot, loading, refresh }
}
