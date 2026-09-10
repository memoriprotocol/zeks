"use client"

/**
 * usePortfolio — read-only wallet portfolio hook.
 *
 * Single HTTP boundary: polls `/api/portfolio/positions` every 5 s.
 * The browser NEVER calls the Morpho GraphQL endpoint or the
 * Robinhood public RPC directly — all upstream traffic routes
 * through the server route. This keeps ZEKS inside the
 * "browser is a pure consumer of normalized JSON" architecture.
 *
 * Cadence:
 *   - Immediate refresh on every (address, chainId, status) change.
 *   - 5 s poll while tab is visible. 10 s while hidden.
 *   - Coalesces: a refresh in flight is never duplicated.
 *
 * No fabrication. Every value comes back from the server route or
 * surfaces as `issues[].kind`.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { Address } from "@/lib/wallet/types-common"
// Re-export the canonical types so consumers keep a single import surface.
export type {
  PortfolioLeg,
  PortfolioSnapshot,
  PortfolioIssue,
} from "@/lib/markets/portfolio"
import type {
  PortfolioLeg as CanonicalLeg,
  PortfolioSnapshot as CanonicalSnapshot,
  PortfolioIssue as CanonicalIssue,
} from "@/lib/markets/portfolio"

const POLL_VISIBLE_MS = 5_000
const POLL_HIDDEN_MS = 10_000
const REQ_TIMEOUT_MS = 6_000

interface LegJson {
  source: "morpho" | "wallet"
  symbol: string
  contractAddress: string | null
  balance: { raw: string; decimals: number | null }
  balanceUsd: number | null
  marketId: string | null
  supplyApy: number | null
  borrowApy: number | null
  utilization: number | null
}

interface SnapshotJson {
  wallet: {
    address: string
    chainId: number | null
    wrongNetwork: boolean
    fetchedAt: string
  }
  supplied: LegJson[]
  borrowed: LegJson[]
  collateral: LegJson[]
  walletBalances: LegJson[]
  totalSuppliedUsd: number | null
  totalBorrowedUsd: number | null
  totalCollateralUsd: number | null
  netValueUsd: number | null
  weightedSupplyApy: number | null
  weightedBorrowApy: number | null
  estimatedYieldUsd: number | null
  positionCount: number | null
  fetchedAt: string
}

type IssueJson =
  | { kind: "morpho-unavailable"; message: string }
  | { kind: "rpc-unavailable"; message: string }
  | {
      kind: "missing-token-info"
      symbol: string
      contractAddress: string
    }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "no-position" }

interface ApiResponse {
  ok: boolean
  snapshot: SnapshotJson | null
  issues: IssueJson[]
  message?: string
}

export interface UsePortfolioResult {
  snapshot: CanonicalSnapshot | null
  loading: boolean
  refresh: () => Promise<void>
}

function pollIntervalMs(): number {
  return typeof document !== "undefined" && document.hidden
    ? POLL_HIDDEN_MS
    : POLL_VISIBLE_MS
}

function isAddressLike(v: unknown): v is Address {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v)
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function convertLeg(input: LegJson): CanonicalLeg {
  let balanceRaw: bigint
  try {
    balanceRaw = BigInt(input.balance.raw)
  } catch {
    balanceRaw = BigInt(0)
  }
  return {
    source: input.source,
    symbol: input.symbol,
    contractAddress: isAddressLike(input.contractAddress ?? "")
      ? (input.contractAddress as Address)
      : null,
    balanceRaw,
    balanceDecimals: asNumber(input.balance.decimals),
    balanceUsd: asNumber(input.balanceUsd),
    marketId: input.marketId ?? null,
    supplyApy: asNumber(input.supplyApy),
    borrowApy: asNumber(input.borrowApy),
    utilization: asNumber(input.utilization),
  }
}

function convertIssues(input: IssueJson[]): CanonicalIssue[] {
  const out: CanonicalIssue[] = []
  for (const i of input) {
    if (i.kind === "missing-token-info") {
      out.push({
        kind: "missing-token-info",
        symbol: i.symbol,
        contractAddress: isAddressLike(i.contractAddress)
          ? (i.contractAddress as Address)
          : (("0x" + "0".repeat(40)) as Address),
      })
    } else if (i.kind === "wrong-network") {
      out.push({ kind: "wrong-network", chainId: i.chainId })
    } else if (i.kind === "morpho-unavailable") {
      out.push({ kind: "morpho-unavailable", message: i.message })
    } else if (i.kind === "rpc-unavailable") {
      out.push({ kind: "rpc-unavailable", message: i.message })
    } else if (i.kind === "no-position") {
      out.push({ kind: "no-position" })
    }
  }
  return out
}

function snapshotFromApi(data: ApiResponse): CanonicalSnapshot | null {
  if (!data.ok || !data.snapshot) return null
  const s = data.snapshot
  const zeroAddr = ("0x" + "0".repeat(40)) as Address
  return {
    wallet: {
      address: isAddressLike(s.wallet.address)
        ? (s.wallet.address as Address)
        : zeroAddr,
      chainId: s.wallet.chainId ?? null,
      wrongNetwork: !!s.wallet.wrongNetwork,
      fetchedAt: s.wallet.fetchedAt,
    },
    supplied: s.supplied.map(convertLeg),
    borrowed: s.borrowed.map(convertLeg),
    collateral: s.collateral.map(convertLeg),
    walletBalances: s.walletBalances.map(convertLeg),
    totalSuppliedUsd: asNumber(s.totalSuppliedUsd),
    totalBorrowedUsd: asNumber(s.totalBorrowedUsd),
    totalCollateralUsd: asNumber(s.totalCollateralUsd),
    netValueUsd: asNumber(s.netValueUsd),
    weightedSupplyApy: asNumber(s.weightedSupplyApy),
    weightedBorrowApy: asNumber(s.weightedBorrowApy),
    estimatedYieldUsd: asNumber(s.estimatedYieldUsd),
    positionCount:
      typeof s.positionCount === "number" ? s.positionCount : 0,
    issues: convertIssues(data.issues ?? []),
    fetchedAt: s.fetchedAt,
  }
}

export function usePortfolio(): UsePortfolioResult {
  const wallet = useWallet()
  const [snapshot, setSnapshot] =
    React.useState<CanonicalSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Coalesced fetcher. Reads the current address from a ref so the
  // function identity is stable across reconnects.
  const inflightRef = React.useRef<Promise<void> | null>(null)

  const walletAddressRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    walletAddressRef.current =
      wallet.status === "connected" && wallet.address
        ? wallet.address
        : null
  }, [wallet.status, wallet.address])

  const fetchOnce = React.useCallback(async (): Promise<void> => {
    const addr = walletAddressRef.current
    if (!isAddressLike(addr)) return
    if (inflightRef.current) return inflightRef.current
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS)
    const p = (async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/portfolio/positions?address=${addr.toLowerCase()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: { accept: "application/json" },
            signal: ctrl.signal,
          },
        )
        if (!res.ok) return
        const json = (await res.json()) as ApiResponse
        setSnapshot(snapshotFromApi(json))
      } catch {
        // Network/abort errors leave the last snapshot in place so
        // the page doesn't flash empty.
      } finally {
        clearTimeout(t)
        setLoading(false)
      }
    })()
    inflightRef.current = p
    try {
      await p
    } finally {
      inflightRef.current = null
    }
  }, [])

  // Immediate refresh on (status, address, chainId) change.
  React.useEffect(() => {
    void fetchOnce()
  }, [wallet.status, wallet.address, wallet.chainId, fetchOnce])

  // Visibility-aware polling.
  React.useEffect(() => {
    if (wallet.status !== "connected" || !wallet.address) return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id != null) clearInterval(id)
      id = setInterval(() => void fetchOnce(), pollIntervalMs())
    }
    start()
    const onVis = () => start()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      if (id != null) clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [wallet.status, wallet.address, fetchOnce])

  const refresh = React.useCallback(async () => {
    await fetchOnce()
  }, [fetchOnce])

  return { snapshot, loading, refresh }
}
