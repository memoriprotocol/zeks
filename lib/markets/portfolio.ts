/**
 * ZEKS Markets — Portfolio aggregator.
 *
 * Combines per-wallet data from multiple read-only sources:
 *
 *   - Morpho GraphQL API       → positions (supply/borrow/collateral)
 *   - Wallet EIP-1193 provider → live ERC20 balances for tokens the
 *                                user has touched on Morpho + a small
 *                                whitelist of ZEKS-supported tokens
 *   - Public Robinhood RPC     → fallback when wallet is unavailable
 *
 * NEVER fabricates positions. Every USD value is sourced from
 * either the Morpho API (supplyAssetsUsd, borrowAssetsUsd,
 * collateralUsd) or the existing oracle/reference-market layer. If
 * neither is available, the field is null and the UI surfaces
 * "—" or "Live data unavailable".
 */

import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { ROBINHOOD_CHAIN_ID_DEC } from "./onchain/rpc"
import { readErc20Info, readErc20Balance } from "./onchain/erc20"
import {
  fetchUserMarketPositions,
  type RawMorphoUserPosition,
} from "./morpho/user-positions"
import { fetchMarketsForChain } from "./morpho/user-positions"

/** A single user-tracked position (Morpho or wallet). */
export interface PortfolioLeg {
  /** Source of the leg. */
  source: "morpho" | "wallet"
  /** Asset symbol as resolved onchain. */
  symbol: string
  /** Asset contract address (lowercased). */
  contractAddress: Address | null
  /** Raw bigint balance (token smallest units). */
  balanceRaw: bigint
  /** ERC20 decimals when known. `null` for Morpho legs whose decimals
      are reported by the API (unknown to the UI). */
  balanceDecimals: number | null
  /** USD value as reported by the source. null when unavailable. */
  balanceUsd: number | null
  /** For Morpho legs: the market id (32-byte hex). */
  marketId: string | null
  /** For Morpho legs: the protocol's supply APY (%). */
  supplyApy: number | null
  /** For Morpho legs: the protocol's borrow APY (%). */
  borrowApy: number | null
  /** For Morpho legs: market utilization (0..1). */
  utilization: number | null
}

export interface PortfolioSnapshot {
  wallet: {
    address: Address | null
    chainId: number | null
    wrongNetwork: boolean
    fetchedAt: string
  }
  supplied: PortfolioLeg[]
  borrowed: PortfolioLeg[]
  collateral: PortfolioLeg[]
  /** Wallet-held tokens that have no Morpho position. */
  walletBalances: PortfolioLeg[]
  totalSuppliedUsd: number | null
  totalBorrowedUsd: number | null
  totalCollateralUsd: number | null
  netValueUsd: number | null
  weightedSupplyApy: number | null
  weightedBorrowApy: number | null
  /** Annualized yield estimate: suppliedUsd × (weightedSupplyApy / 100). */
  estimatedYieldUsd: number | null
  /** Convenience: supplied.length + borrowed.length + collateral.length. */
  positionCount: number
  issues: PortfolioIssue[]
  fetchedAt: string
}

export type PortfolioIssue =
  | { kind: "wallet-disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "morpho-unavailable"; message: string }
  | { kind: "no-position" }
  | { kind: "rpc-unavailable"; message: string }
  | { kind: "missing-token-info"; symbol: string; contractAddress: Address }

/* ------------------------------------------------------ */
/* Aggregator                                              */
/* ------------------------------------------------------ */

export interface BuildPortfolioOptions {
  walletAddress: Address | null
  walletChainId: number | null
  walletProvider: EIP1193Provider | null
  /** Optional pre-fetched positions (e.g. for SSR / cached state). */
  positions?: RawMorphoUserPosition[]
  timeoutMs?: number
}

/**
 * Build a full portfolio snapshot. Always resolves — never throws —
 * and surfaces issues in the `issues` field.
 */
export async function buildPortfolioSnapshot(
  options: BuildPortfolioOptions,
): Promise<PortfolioSnapshot> {
  const fetchedAt = new Date().toISOString()
  const issues: PortfolioIssue[] = []

  if (!options.walletAddress) {
    return emptySnapshot(null, options.walletChainId, fetchedAt, [
      { kind: "wallet-disconnected" },
    ])
  }

  const onRobinhood =
    options.walletChainId == null ||
    options.walletChainId === ROBINHOOD_CHAIN_ID_DEC
  if (!onRobinhood) {
    issues.push({
      kind: "wrong-network",
      chainId: options.walletChainId ?? -1,
    })
  }

  // 1. Morpho positions — fetch if not provided.
  let positions: RawMorphoUserPosition[] = options.positions ?? []
  if (!options.positions) {
    const r = await fetchUserMarketPositions(
      options.walletAddress as Address,
      { fetchTimeoutMs: options.timeoutMs },
    )
    positions = r.positions
    if (r.partial || r.apiError) {
      issues.push({ kind: "morpho-unavailable", message: r.apiError ?? "API error" })
    }
  }

  // 2. Aggregate positions into supplied / borrowed / collateral legs.
  const supplied: PortfolioLeg[] = []
  const borrowed: PortfolioLeg[] = []
  const collateral: PortfolioLeg[] = []
  const touchedTokens = new Set<string>()

  for (const p of positions) {
    if (p.supplyAssetsRaw > BigInt(0)) {
      supplied.push({
        source: "morpho",
        symbol: p.loanAssetSymbol,
        contractAddress: (p.loanAssetAddress || null) as Address | null,
        balanceRaw: p.supplyAssetsRaw,
        balanceDecimals: null,
        balanceUsd: p.supplyAssetsUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
      if (p.loanAssetAddress) touchedTokens.add(p.loanAssetAddress.toLowerCase())
    }
    if (p.borrowAssetsRaw > BigInt(0)) {
      borrowed.push({
        source: "morpho",
        symbol: p.loanAssetSymbol,
        contractAddress: (p.loanAssetAddress || null) as Address | null,
        balanceRaw: p.borrowAssetsRaw,
        balanceDecimals: null,
        balanceUsd: p.borrowAssetsUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
    }
    if (p.collateralRaw > BigInt(0) && p.collateralAssetAddress) {
      collateral.push({
        source: "morpho",
        symbol: p.collateralAssetSymbol ?? "?",
        contractAddress: (p.collateralAssetAddress || null) as Address | null,
        balanceRaw: p.collateralRaw,
        balanceDecimals: null,
        balanceUsd: p.collateralUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
      touchedTokens.add(p.collateralAssetAddress.toLowerCase())
    }
  }

  // 3. Wallet balances for every token the user has touched on
  //    Morpho. We always read these via the wallet provider
  //    (preferred) or public RPC.
  const walletBalances: PortfolioLeg[] = []
  for (const addr of touchedTokens) {
    const r = await readErc20Balance(addr as Address, options.walletAddress as Address, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (r.kind !== "ok") {
      issues.push({ kind: "rpc-unavailable", message: "balance read failed" })
      continue
    }
    const info = await readErc20Info(addr as Address, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (info.kind !== "ok") {
      issues.push({
        kind: "missing-token-info",
        symbol: addr,
        contractAddress: addr as Address,
      })
      continue
    }
    walletBalances.push({
      source: "wallet",
      symbol: info.value.symbol,
      contractAddress: addr as Address,
      balanceRaw: r.value,
      balanceDecimals: info.value.decimals,
      balanceUsd: null, // wallet balance USD requires an oracle price
      marketId: null,
      supplyApy: null,
      borrowApy: null,
      utilization: null,
    })
  }

  // 4. Aggregate USD values.
  const totalSuppliedUsd = sumUsd(supplied)
  const totalBorrowedUsd = sumUsd(borrowed)
  const totalCollateralUsd = sumUsd(collateral)
  const netValueUsd =
    totalSuppliedUsd != null && totalBorrowedUsd != null
      ? (totalSuppliedUsd ?? 0) - (totalBorrowedUsd ?? 0)
      : null

  // 5. Weighted APY by USD value. null when we cannot compute.
  const weightedSupplyApy = weightedApy(supplied)
  const weightedBorrowApy = weightedApy(borrowed)

  const estimatedYieldUsd =
    totalSuppliedUsd != null && weightedSupplyApy != null
      ? (totalSuppliedUsd * weightedSupplyApy) / 100
      : null
  const positionCount =
    supplied.length + borrowed.length + collateral.length

  if (positions.length === 0 && !issues.some((i) => i.kind !== "morpho-unavailable")) {
    issues.push({ kind: "no-position" })
  }

  return {
    wallet: {
      address: options.walletAddress as Address,
      chainId: options.walletChainId ?? null,
      wrongNetwork: !onRobinhood,
      fetchedAt,
    },
    supplied,
    borrowed,
    collateral,
    walletBalances,
    totalSuppliedUsd,
    totalBorrowedUsd,
    totalCollateralUsd,
    netValueUsd,
    weightedSupplyApy,
    weightedBorrowApy,
    estimatedYieldUsd,
    positionCount,
    issues,
    fetchedAt,
  }
}

/**
 * Convenience: fetch the market list (for the Earn page) without
 * forcing the caller to import the underlying `morpho` module.
 */
export async function listOpportunities(chainId = ROBINHOOD_CHAIN_ID_DEC) {
  return fetchMarketsForChain(chainId)
}

/* ------------------------------------------------------ */
/* Math helpers                                            */
/* ------------------------------------------------------ */

function sumUsd(legs: PortfolioLeg[]): number | null {
  let sum = 0
  let anyUsd = false
  for (const l of legs) {
    if (l.balanceUsd != null) {
      sum += l.balanceUsd
      anyUsd = true
    }
  }
  return anyUsd ? sum : null
}

function weightedApy(legs: PortfolioLeg[]): number | null {
  let weighted = 0
  let total = 0
  for (const l of legs) {
    if (l.balanceUsd != null && l.balanceUsd > 0) {
      // supplyApy is in % (e.g. 4.5). Convert to fraction.
      const apy = (l.supplyApy ?? l.borrowApy ?? 0) / 100
      weighted += apy * l.balanceUsd
      total += l.balanceUsd
    }
  }
  if (total === 0) return null
  return weighted / total
}

function emptySnapshot(
  address: Address | null,
  chainId: number | null,
  fetchedAt: string,
  issues: PortfolioIssue[],
): PortfolioSnapshot {
  return {
    wallet: {
      address,
      chainId,
      wrongNetwork: chainId != null && chainId !== ROBINHOOD_CHAIN_ID_DEC,
      fetchedAt,
    },
    supplied: [],
    borrowed: [],
    collateral: [],
    walletBalances: [],
    totalSuppliedUsd: null,
    totalBorrowedUsd: null,
    totalCollateralUsd: null,
    netValueUsd: null,
    weightedSupplyApy: null,
    weightedBorrowApy: null,
    estimatedYieldUsd: null,
    positionCount: 0,
    issues,
    fetchedAt,
  }
}
