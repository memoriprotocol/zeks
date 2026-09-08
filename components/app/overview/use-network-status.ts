"use client"

/**
 * useNetworkStatus
 *
 * Lightweight read-only radar for the four canonical data sources:
 *
 *   - Wallet provider (EIP-1193)         → `eth_chainId` / `eth_blockNumber`
 *   - Public Robinhood RPC               → `eth_blockNumber`
 *   - Morpho GraphQL                     → `marketPositions` introspection
 *   - Chainlink                          → static (already wired)
 *
 * Used by the Overview Network/Protocol Status row. NEVER triggers
 * a wallet signature. NEVER opens a wallet popup.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import { ROBINHOOD_PUBLIC_RPC_URL } from "@/lib/markets/onchain/rpc"
import { fetchUserMarketPositions } from "@/lib/markets/morpho/user-positions"

export interface NetworkStatus {
  wallet: "connected" | "wrong-network" | "disconnected" | "wrong-chain"
  robinhoodRpc: "live" | "unreachable" | "unknown"
  morphoApi: "live" | "unreachable" | "unknown"
  chainlink: "ready" | "unknown"
}

const POLL_INTERVAL_MS = 30_000

async function checkRpc(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 4_000)
    const res = await fetch(ROBINHOOD_PUBLIC_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(t)
    if (!res.ok) return false
    const j = (await res.json()) as { result?: string; error?: unknown }
    return typeof j.result === "string"
  } catch {
    return false
  }
}

async function checkMorpho(): Promise<boolean> {
  try {
    // Probe with the empty address; the schema is what we care about.
    const r = await fetchUserMarketPositions(
      "0x0000000000000000000000000000000000000000",
      { fetchTimeoutMs: 4_000 },
    )
    return !r.partial
  } catch {
    return false
  }
}

export function useNetworkStatus(): NetworkStatus {
  const wallet = useWallet()
  const [rpcState, setRpcState] = React.useState<NetworkStatus["robinhoodRpc"]>(
    "unknown",
  )
  const [morphoState, setMorphoState] = React.useState<
    NetworkStatus["morphoApi"]
  >("unknown")

  const refresh = React.useCallback(async () => {
    const [rpcOk, morphoOk] = await Promise.all([checkRpc(), checkMorpho()])
    setRpcState(rpcOk ? "live" : "unreachable")
    setMorphoState(morphoOk ? "live" : "unreachable")
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const walletState: NetworkStatus["wallet"] =
    wallet.status === "connected"
      ? "connected"
      : wallet.status === "wrong-network"
        ? "wrong-network"
        : "disconnected"

  return {
    wallet: walletState,
    robinhoodRpc: rpcState,
    morphoApi: morphoState,
    chainlink: "ready",
  }
}
