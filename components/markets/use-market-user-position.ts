"use client"

/**
 * useMarketUserPosition
 *
 * Fetches per-market user positions from the Morpho GraphQL API
 * and returns the slice for one `marketId`. Polls every 60s.
 *
 * Returns:
 *   - hasPosition       true when any of supplied/borrowed/collateral > 0
 *   - suppliedUsd       total USD value of user's supply in this market
 *   - borrowedUsd       total USD value of user's debt in this market
 *   - collateralUsd     total USD value of user's collateral in this market
 *   - suppliedRaw / borrowedRaw / collateralRaw (bigint, null=0)
 *   - state kind: "idle" | "loading" | "live" | "empty" | "no-wallet" |
 *                 "wrong-network" | "unavailable"
 *
 * Read-only. No transactions.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import { fetchUserMarketPositions, type RawMorphoUserPosition } from "@/lib/markets/morpho/user-positions"

const POLL_INTERVAL_MS = 60_000

export type MarketUserPositionState =
  | { kind: "idle" }
  | { kind: "no-wallet" }
  | { kind: "wrong-network"; chainId: number | null }
  | { kind: "loading" }
  | { kind: "live"; position: RawMorphoUserPosition }
  | { kind: "empty" }
  | { kind: "unavailable"; reason: string }

interface UseMarketUserPositionResult {
  state: MarketUserPositionState
  hasPosition: boolean
  position: RawMorphoUserPosition | null
  refresh: () => Promise<void>
}

export function useMarketUserPosition(
  marketId: string | null | undefined,
): UseMarketUserPositionResult {
  const wallet = useWallet()
  const [state, setState] = React.useState<MarketUserPositionState>({
    kind: "idle",
  })
  const [reloadTick, setReloadTick] = React.useState(0)

  const refresh = React.useCallback(async () => {
    if (!marketId) {
      setState({ kind: "unavailable", reason: "Market data unavailable" })
      return
    }
    if (
      wallet.status === "idle" ||
      wallet.status === "available" ||
      wallet.status === "disconnected" ||
      wallet.status === "initializing" ||
      !wallet.address
    ) {
      setState({ kind: "no-wallet" })
      return
    }
    if (wallet.chainId != null && wallet.chainId !== 4663) {
      setState({ kind: "wrong-network", chainId: wallet.chainId })
      return
    }
    setState((s) => (s.kind === "live" || s.kind === "empty" ? s : { kind: "loading" }))
    try {
      const r = await fetchUserMarketPositions(wallet.address as `0x${string}`, {
        fetchTimeoutMs: 6_000,
      })
      if (r.partial && r.positions.length === 0) {
        setState({
          kind: "unavailable",
          reason: r.apiError ?? "Live data unavailable",
        })
        return
      }
      const match = r.positions.find((p) => p.marketId === marketId) ?? null
      if (!match) {
        setState({ kind: "empty" })
        return
      }
      setState({ kind: "live", position: match })
    } catch (err) {
      setState({
        kind: "unavailable",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }, [marketId, wallet.status, wallet.address, wallet.chainId])

  React.useEffect(() => {
    void refresh()
  }, [refresh, reloadTick])

  React.useEffect(() => {
    const id = window.setInterval(() => setReloadTick((n) => n + 1), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const position = state.kind === "live" ? state.position : null
  const hasPosition =
    position != null &&
    (position.supplyAssetsUsd != null ||
      position.borrowAssetsUsd != null ||
      position.collateralUsd != null)

  return { state, hasPosition, position, refresh }
}
