"use client"

/**
 * useBorrowCapacity — read-only borrow-capacity and risk view.
 *
 * Phase F6A. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: surface the verified risk metrics a future F6B Borrow
 * transaction needs:
 *
 *   - current collateral value (in loan-token units)
 *   - current borrowedAssets (single source of truth = F5B)
 *   - LLTV-derived max debt allowed
 *   - market liquidity (verified free-liquidity source)
 *   - final availableBorrowCapacity = min(riskAvailable, marketLiquidity)
 *
 * Reuses the verified F3A/F5B read architecture: a single
 * `usePositionView` call provides the collateral raw amount,
 * borrowShares, and borrowedAssets. A second read (`market()`)
 * provides the onchain market state used for free-liquidity.
 * F6A adds a third read: `oracle.price()`.
 *
 * Provenance:
 *
 *   Morpho Blue oracle:
 *     - interface: morpho-org/morpho-blue IMorphoOracle
 *     - signature: price() returns uint256 (scale = 1e36)
 *     - verified via @/lib/markets/onchain/morpho-oracle.ts
 *
 *   Collateral valuation:
 *     collateralValueInLoanAssets =
 *       (collateralRaw * oraclePrice) /
 *           (1e36 * 10^collateralDecimals / 10^loanDecimals)
 *     [ROUND DOWN — conservative direction for risk math]
 *
 *   Borrow limit (LLTV):
 *     maxDebtAllowed = collateralValueInLoanAssets * lltv / 1e18
 *     [ROUND DOWN — conservative direction for risk math]
 *
 *   Risk available:
 *     riskAvailableBorrow = max(0, maxDebtAllowed - borrowedAssets)
 *
 *   Final available capacity:
 *     availableBorrowCapacity =
 *         min(riskAvailableBorrow, marketFreeLiquidity)
 *
 *   Zero / invalid states:
 *     - collateral == 0       → collateralValue = 0, all capacity = 0
 *     - borrowedAssets == 0    → riskAvailable = maxDebtAllowed
 *     - oraclePrice == 0       → collateralValue = 0 (treated as invalid;
 *                                 caller must surface this)
 *     - marketLiquidity == 0   → availableCapacity = 0
 *     - borrowedAssets >= maxDebt → riskAvailable = 0
 *
 *   Refresh:
 *     This hook accepts the same `refreshTick` mechanism as
 *     `usePositionView`. Bumping refreshTick re-reads position,
 *     market state, and oracle price.
 */

import * as React from "react"
import type { EIP1193Provider } from "@/lib/wallet/types"
import { useWallet } from "@/components/app/wallet/use-wallet"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"
import {
  readErc20Info,
} from "@/lib/markets/onchain/erc20"
import {
  readMorphoOraclePrice,
  collateralValueInLoanAssets,
  MORPHO_ORACLE_PRICE_SCALE,
  type MorphoOraclePrice,
} from "@/lib/markets/onchain/morpho-oracle"

/* ------------------------------------------------------ */
/* Borrow capacity view                                    */
/* ------------------------------------------------------ */

export type BorrowCapacity =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "loading"; subkind: "decimals" | "oracle" | "position" }
  | {
      kind: "ready"
      /** Raw collateral (token-native units, bigint). 0 = valid. */
      collateralRaw: bigint
      /** Collateral value in loan-token units (bigint). 0 = valid. */
      collateralValueInLoanAssets: bigint
      /** Raw oracle price (1e36 scale, bigint). */
      oraclePrice: bigint
      /** LLTV as raw uint256 WAD (bigint). e.g. 86% = 86 * 1e16. */
      lltv: bigint
      /** Borrow limit = collateralValueInLoanAssets * lltv / 1e18 (bigint). */
      maxDebtAllowed: bigint
      /** Current borrowed assets (bigint, loan-token units). 0 = valid. */
      borrowedAssets: bigint
      /** maxDebtAllowed - borrowedAssets, clamped to >= 0 (bigint). */
      riskAvailableBorrow: bigint
      /** Market free liquidity (bigint, loan-token units). 0 = valid. */
      marketAvailableLiquidity: bigint
      /** min(riskAvailableBorrow, marketAvailableLiquidity) (bigint). */
      availableBorrowCapacity: bigint
      /** True iff borrowedAssets >= maxDebtAllowed (over-borrowed). */
      isAtOrOverLiquidationThreshold: boolean
      /** True iff collateralValue == 0 due to invalid oracle. */
      invalidOracle: boolean
    }
  | {
      kind: "invalid-amount"
      reason: "no-collateral-token" | "no-oracle" | "no-loan-decimals"
    }

export interface BorrowCapacityInput {
  market: LendingMarket
  /** Verified collateral token decimals (from F5B `collateralToken` or a fresh read). */
  collateralDecimals: number | null
  /** Verified loan token decimals (from `LendingMarket.loanTokenDecimals` or fresh read). */
  loanDecimals: number | null
  /** LLTV as raw uint256 WAD (from `marketParamsFromLendingMarket` or directly from MarketParams). */
  lltv: bigint | null
  /** Oracle address. Required to read oracle price. */
  oracleAddress: `0x${string}` | null
  /** Collateral raw amount from F5B (`usePositionView.view.collateral`). */
  collateralRaw: bigint | null
  /** Borrowed assets from F5B (`usePositionView.view.borrowedAssets`). */
  borrowedAssets: bigint | null
  /** Market free liquidity from F3A (`marketFreeLiquidity(marketState)`). */
  marketFreeLiquidity: bigint | null
  /** Refresh tick — bump to re-read oracle + position. */
  refreshTick?: number
}

/* ------------------------------------------------------ */
/* Helpers                                                  */
/* ------------------------------------------------------ */

/**
 * LLTV WAD scale — 1e18.
 *
 *   LLTV is encoded by the Morpho protocol as a uint256 WAD value
 *   in [0, 1e18] (e.g. 86% = 86 * 1e16 = 860_000_000_000_000_000).
 *
 *   maxDebtAllowed = collateralValueInLoanAssets * lltv / WAD
 */
export const LLTV_WAD = BigInt("1000000000000000000") // 1e18

/**
 * Compute `maxDebtAllowed = collateralValueInLoanAssets * lltv / 1e18`.
 *
 * Rounding direction: ROUND DOWN.
 *
 *   Why DOWN: this is a SAFETY / risk-bound computation. Rounding
 *   DOWN means we slightly UNDERSTATE the borrow limit, making the
 *   reported available capacity slightly TIGHTER than the protocol's
 *   own calculation. This is the conservative direction.
 *
 * Edge cases:
 *   - collateralValue == 0  → maxDebtAllowed = 0
 *   - lltv == 0              → maxDebtAllowed = 0 (no risk tolerance)
 */
function computeMaxDebtAllowed(
  collateralValue: bigint,
  lltvWad: bigint,
): bigint {
  if (collateralValue <= BigInt(0)) return BigInt(0)
  if (lltvWad <= BigInt(0)) return BigInt(0)
  return (collateralValue * lltvWad) / LLTV_WAD
}

/**
 * Subtract two bigints, clamping the result to >= 0.
 *
 *   riskAvailable = max(0, maxDebt - debt)
 */
function subClampToZero(a: bigint, b: bigint): bigint {
  if (a <= b) return BigInt(0)
  return a - b
}

/**
 * min(a, b) for bigints.
 */
function bigMin(a: bigint, b: bigint): bigint {
  return a <= b ? a : b
}

/* ------------------------------------------------------ */
/* Hook                                                     */
/* ------------------------------------------------------ */

export function useBorrowCapacity(
  input: BorrowCapacityInput,
): BorrowCapacity {
  const wallet = useWallet()

  // Effective input resolution
  const collateralAddress = input.market.collateralTokenAddress as
    | `0x${string}`
    | null
  const loanAddress = input.market.loanTokenAddress as
    | `0x${string}`
    | null
  const oracleAddress = input.oracleAddress

  const collateralDecimals = input.collateralDecimals
  const loanDecimals = input.loanDecimals
  const lltv = input.lltv
  const collateralRaw = input.collateralRaw
  const borrowedAssets = input.borrowedAssets
  const marketFreeLiquidity = input.marketFreeLiquidity

  // ── Read oracle price via `price()` ────────────────────────────────
  const [oraclePrice, setOraclePrice] = React.useState<bigint | null>(null)
  const [oracleInvalid, setOracleInvalid] = React.useState<boolean>(false)

  // Track refreshTick for re-fetch trigger.
  const [tick, setTick] = React.useState(0)
  const prevRefreshTick = React.useRef(input.refreshTick ?? 0)

  React.useEffect(() => {
    const t = input.refreshTick ?? 0
    if (t !== prevRefreshTick.current) {
      prevRefreshTick.current = t
      setTick((n) => n + 1)
    }
  }, [input.refreshTick])

  // Capture wallet context at the time of the read
  const wa = wallet.address
  const cha = wallet.chainId

  React.useEffect(() => {
    if (wa == null || oracleAddress == null) return
    if (cha != null && cha !== ROBINHOOD_CHAIN_ID) return

    const oa = oracleAddress as `0x${string}`
    const cId = cha

    let cancelled = false

    void (async () => {
      const res = await readMorphoOraclePrice(oa, {
        chainId: cId,
        timeoutMs: 5_000,
      })
      if (cancelled) return
      if (res === null) {
        setOraclePrice(null)
        setOracleInvalid(true)
        return
      }
      // The Morpho Blue oracle can return 0 when the underlying feed
      // is invalid. Surface this as `invalidOracle` rather than 0.
      setOraclePrice(res.price)
      setOracleInvalid(res.price === BigInt(0))
    })()

    return () => {
      cancelled = true
    }
  }, [wa, cha, oracleAddress, tick])

  // ── Derive the BorrowCapacity view ─────────────────────────────────
  if (wallet.status !== "connected") {
    return { kind: "disconnected" }
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
  }
  if (!collateralAddress) {
    return { kind: "invalid-amount", reason: "no-collateral-token" }
  }
  if (!oracleAddress) {
    return { kind: "invalid-amount", reason: "no-oracle" }
  }
  if (loanDecimals === null) {
    return { kind: "invalid-amount", reason: "no-loan-decimals" }
  }

  // Wait for oracle + collateral + borrowed reads.
  if (
    oraclePrice === null ||
    collateralRaw === null ||
    borrowedAssets === null
  ) {
    return { kind: "loading", subkind: "oracle" }
  }
  if (marketFreeLiquidity === null) {
    return { kind: "loading", subkind: "position" }
  }
  if (collateralDecimals === null) {
    return { kind: "loading", subkind: "decimals" }
  }
  if (lltv === null || lltv === BigInt(0)) {
    // F6A refuses to fabricate a borrow limit when LLTV is unknown.
    return { kind: "invalid-amount", reason: "no-oracle" }
  }

  // 1. Collateral value in loan-token units (round down — conservative)
  const collateralValue = collateralValueInLoanAssets(
    collateralRaw,
    oraclePrice,
    collateralDecimals,
    loanDecimals,
  )

  // 2. Max debt allowed (round down — conservative)
  const maxDebtAllowed = computeMaxDebtAllowed(collateralValue, lltv)

  // 3. Risk-available borrow (clamped to >= 0)
  const riskAvailable = subClampToZero(maxDebtAllowed, borrowedAssets)

  // 4. Final capacity = min(risk, market)
  const availableBorrowCapacity = bigMin(riskAvailable, marketFreeLiquidity)

  // 5. Over-borrowed flag — only meaningful when borrowedAssets > 0
  const isAtOrOverLiquidationThreshold =
    borrowedAssets > BigInt(0) && borrowedAssets >= maxDebtAllowed

  return {
    kind: "ready",
    collateralRaw,
    collateralValueInLoanAssets: collateralValue,
    oraclePrice,
    lltv,
    maxDebtAllowed,
    borrowedAssets,
    riskAvailableBorrow: riskAvailable,
    marketAvailableLiquidity: marketFreeLiquidity,
    availableBorrowCapacity,
    isAtOrOverLiquidationThreshold,
    invalidOracle: oracleInvalid,
  }
}

/* ------------------------------------------------------ */
/* Loan-decimals helper (F6A exposes this for callers)    */
/* ------------------------------------------------------ */

/**
 * Read the loan token decimals via the existing `readErc20Info` helper.
 *
 * Returns null on any read failure. Callers should treat null as
 * "I don't know" rather than zero.
 *
 * Reuses the verified ERC20 `decimals()` selector
 * (`0x313ce567`) already defined in `lib/markets/onchain/erc20.ts`.
 */
export async function readLoanTokenDecimals(
  loanTokenAddress: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<number | null> {
  const res = await readErc20Info(loanTokenAddress, options)
  if (res.kind === "error") return null
  return res.value.decimals
}
