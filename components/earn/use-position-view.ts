"use client"

/**
 * usePositionView — read-only onchain Morpho position + market state.
 *
 * Phase F3A. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Reads (in parallel, same `latest` block):
 *   1. Morpho Blue `position(bytes32 id, address user)`
 *      → supplyShares, borrowShares, collateral
 *   2. Morpho Blue `market(bytes32 id)`
 *      → totalSupplyAssets, totalSupplyShares, totalBorrowAssets,
 *        totalBorrowShares, lastUpdate, fee
 *
 * Derives (using the OFFICIAL Morpho Blue formula from
 * SharesMathLib.sol):
 *
 *   userSuppliedAssets =
 *       toAssetsDown(
 *         supplyShares,
 *         market.totalSupplyAssets,
 *         market.totalSupplyShares
 *       )
 *
 *   marketLiquidity =
 *       totalSupplyAssets - totalBorrowAssets
 *
 *   maxWithdrawableAssets =
 *       min(userSuppliedAssets, marketLiquidity)
 *
 * The shares↔assets conversion uses the official Morpho Blue
 * formula verbatim, including the VIRTUAL_ASSETS / VIRTUAL_SHARES
 * offsets (1 and 1e6 respectively).
 *
 * The stored `market[id].totalSupplyAssets` / `totalSupplyShares`
 * DO NOT include interest accrued since `lastUpdate`. This is
 * verbatim from IMorpho.sol docstrings. The hook exposes
 * `lastUpdate` so the UI can render an honest disclaimer.
 *
 * Read-consistency note:
 *   - position() and market() are read in parallel via
 *     Promise.all using the public RPC's `latest` block. They may
 *     be served from different nodes (public RPC), so there is a
 *     theoretical microsecond-scale skew. This is acceptable for
 *     UI display; F3B's simulateWrite will re-verify both at the
 *     pre-send guard.
 *   - No multicall is used here (no verified Multicall3 address
 *     on Robinhood Chain).
 *
 * State machine:
 *
 *   disconnected → loading → ready
 *                                 ↓
 *                              error (RPC failure)
 *
 * `ready` with zero supplyShares is a legitimate "no position"
 * state, NOT an error.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import {
  readMorphoPosition,
  type MorphoPosition,
} from "@/lib/markets/onchain/morpho-position"
import {
  readMorphoMarket,
  toAssetsDown,
  toAssetsUp,
  marketFreeLiquidity,
  maxWithdrawableAssets,
  type MorphoMarketState,
} from "@/lib/markets/onchain/morpho-market"

export type PositionView =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "market-unconfigured"; reason: "no-market-id" }
  | { kind: "loading" }
  | {
      kind: "ready"
      position: MorphoPosition | null
      market: MorphoMarketState | null
      userSuppliedAssets: bigint | null
      marketLiquidity: bigint | null
      maxWithdrawable: bigint | null
      /** Last onchain accrual timestamp (unix seconds). 0 if unknown. */
      lastUpdate: bigint
      /**
       * F5B — user's raw collateral balance (bigint, token-native
       * units, e.g. AAPL at 18 decimals). Comes directly from
       * `position(bytes32,address).collateral`. 0 is a valid state.
       * Null only when neither position nor market state has been
       * read yet.
       */
      collateral: bigint | null
      /**
       * F5B — user's raw borrowShares balance (bigint). Comes
       * directly from `position(bytes32,address).borrowShares`.
       * 0 is a valid state (no debt).
       */
      borrowShares: bigint | null
      /**
       * F5B — user's borrowedAssets (bigint, loan-token units).
       * Derived via the verified `toAssetsUp` formula — round-UP,
       * matching Morpho's internal `repay(shares>0)` and
       * `borrow(shares>0)` direction.
       *
       * Never equal to `borrowShares` directly.
       * `null` when borrowShares is 0 (no debt — nothing to convert)
       * OR when market state is unavailable.
       */
      borrowedAssets: bigint | null
      /**
       * F5B — collateral token metadata from the verified
       * `LendingMarket` row. `null` when the row lacks a
       * `collateralTokenAddress` (e.g. mock rows).
       *
       * `decimals` requires an onchain `decimals()` read; until
       * F5C/F5D the hook does NOT perform that read here (kept
       * F3A-equivalent in RPC footprint). Callers that need
       * decimals must read them via the existing `readErc20Info`
       * helper — never substitute `Number()` for `bigint`.
       */
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number | null
      } | null
    }
  | { kind: "error"; message: string }

export interface PositionViewInput {
  market: LendingMarket
  /** Optional bump counter to force a re-read (e.g. after F2C supply). */
  refreshTick?: number
}

export interface PositionViewOutput {
  view: PositionView
  /** True if the user has any supply position (supplyShares > 0). */
  hasPosition: boolean
  /** Raw supplyShares (bigint). null when not yet known. */
  supplyShares: bigint | null
  /** User's supplied assets (bigint, loan-token units). null when unknown. */
  userSuppliedAssets: bigint | null
  /** Max withdrawable assets (bigint, loan-token units). null when unknown. */
  maxWithdrawable: bigint | null
  /** Free liquidity in the market (bigint, loan-token units). null when unknown. */
  marketLiquidity: bigint | null
  /** Last onchain accrual timestamp (unix seconds). 0 if unknown. */
  lastUpdate: bigint
  /** F5B — user's raw collateral (bigint, token-native units). 0 = valid. */
  collateral: bigint | null
  /** F5B — user's raw borrowShares (bigint). 0 = valid. */
  borrowShares: bigint | null
  /** F5B — user's borrowedAssets (bigint, loan-token units) via `toAssetsUp`. 0 = valid. */
  borrowedAssets: bigint | null
}

const ZERO_BIGINT = BigInt(0)

export function usePositionView(input: PositionViewInput): PositionViewOutput {
  const wallet = useWallet()
  const { market, refreshTick } = input

  const morphoBlue = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`

  const [position, setPosition] = React.useState<MorphoPosition | null>(null)
  const [marketState, setMarketState] = React.useState<MorphoMarketState | null>(
    null,
  )
  const [error, setError] = React.useState<string | null>(null)

  const marketId = market.marketId

  React.useEffect(() => {
    let cancelled = false

    async function run() {
      if (
        wallet.status !== "connected" ||
        !wallet.address ||
        wallet.chainId !== ROBINHOOD_CHAIN_ID
      ) {
        return
      }
      if (!marketId) return
      setError(null)
      const opts = {
        chainId: wallet.chainId,
        timeoutMs: 5_000,
      } as const
      // Parallel reads — same `latest` block, but two separate
      // JSON-RPC calls. Documented in the file header.
      const [posRes, mktRes] = await Promise.all([
        readMorphoPosition(morphoBlue, marketId as `0x${string}`, wallet.address, opts),
        readMorphoMarket(morphoBlue, marketId as `0x${string}`, opts),
      ])
      if (cancelled) return
      // Treat null position as "no position" (zero supplyShares) — this
      // is the canonical Morpho behavior for an unauthorized address.
      // Per the IMorpho docstring: zero-share positions are valid.
      if (posRes === null) {
        setPosition({
          supplyShares: ZERO_BIGINT,
          borrowShares: ZERO_BIGINT,
          collateral: ZERO_BIGINT,
        })
      } else {
        setPosition(posRes)
      }
      setMarketState(mktRes)
      // We don't raise a hard error for market-state read failure —
      // the UI can still show raw supplyShares. Position is the
      // authoritative source. Surface a soft error string.
      if (posRes === null && mktRes === null) {
        setError("Could not read onchain position or market state.")
      } else {
        setError(null)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    wallet.status,
    wallet.address,
    wallet.chainId,
    morphoBlue,
    marketId,
    refreshTick,
  ])

  const view: PositionView = React.useMemo(() => {
    if (wallet.status === "connecting" || wallet.status === "initializing") {
      return { kind: "loading" }
    }
    if (wallet.status !== "connected") {
      return { kind: "disconnected" }
    }
    if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
      return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
    }
    if (!marketId) {
      return { kind: "market-unconfigured", reason: "no-market-id" }
    }
    if (position === null && marketState === null) {
      return { kind: "loading" }
    }
    if (error !== null) {
      return { kind: "error", message: error }
    }
    const userSuppliedAssets =
      position !== null && marketState !== null
        ? toAssetsDown(
            position.supplyShares,
            marketState.totalSupplyAssets,
            marketState.totalSupplyShares,
          )
        : null
    const liquidity =
      marketState !== null ? marketFreeLiquidity(marketState) : null
    const maxWithdraw =
      userSuppliedAssets !== null && marketState !== null
        ? maxWithdrawableAssets(userSuppliedAssets, marketState)
        : null

    // F5B — collateral & debt derivation. Both fields come directly
    // from `position(bytes32, address)`. `borrowedAssets` is
    // derived via the official Morpho `toAssetsUp` formula (round
    // UP — matches the borrow/repay direction).
    const collateralBigint = position !== null ? position.collateral : null
    const borrowSharesBigint =
      position !== null ? position.borrowShares : null
    const borrowedAssets =
      position !== null && marketState !== null && position.borrowShares > ZERO_BIGINT
        ? toAssetsUp(
            position.borrowShares,
            marketState.totalBorrowAssets,
            marketState.totalBorrowShares,
          )
        : position !== null && position.borrowShares === ZERO_BIGINT
          ? ZERO_BIGINT
          : null

    // F5B — collateral token metadata from the verified LendingMarket
    // row. Address is required; symbol/decimals are optional. We
    // do NOT perform an onchain `decimals()` read here (that would
    // expand RPC footprint beyond F3A's scope). Decimals remain
    // `null` until callers (F5C/F5D) read them via the existing
    // `readErc20Info` helper.
    const collateralAddress = market.collateralTokenAddress as
      | `0x${string}`
      | null
      | undefined
    const collateralToken =
      collateralAddress != null
        ? {
            address: collateralAddress as `0x${string}`,
            symbol: market.collateralAssetSymbol ?? null,
            decimals: null as number | null,
          }
        : null

    return {
      kind: "ready",
      position,
      market: marketState,
      userSuppliedAssets,
      marketLiquidity: liquidity,
      maxWithdrawable: maxWithdraw,
      lastUpdate: marketState?.lastUpdate ?? ZERO_BIGINT,
      collateral: collateralBigint,
      borrowShares: borrowSharesBigint,
      borrowedAssets,
      collateralToken,
    }
  }, [wallet.status, wallet.chainId, marketId, position, marketState, error, market.collateralTokenAddress, market.collateralAssetSymbol])

  const hasPosition =
    position !== null && position.supplyShares > ZERO_BIGINT

  return {
    view,
    hasPosition,
    supplyShares: position ? position.supplyShares : null,
    userSuppliedAssets:
      view.kind === "ready" ? view.userSuppliedAssets : null,
    maxWithdrawable: view.kind === "ready" ? view.maxWithdrawable : null,
    marketLiquidity: view.kind === "ready" ? view.marketLiquidity : null,
    lastUpdate: view.kind === "ready" ? view.lastUpdate : ZERO_BIGINT,
    collateral: view.kind === "ready" ? view.collateral : null,
    borrowShares: view.kind === "ready" ? view.borrowShares : null,
    borrowedAssets: view.kind === "ready" ? view.borrowedAssets : null,
  }
}
