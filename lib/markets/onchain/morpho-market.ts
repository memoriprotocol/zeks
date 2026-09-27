/**
 * ZEKS Markets — Morpho Blue market read.
 *
 * Read-only. No transactions, no writes, no signatures.
 *
 * Provides:
 *   - canonical `market(bytes32)` view of Morpho Blue
 *   - exact shares↔assets conversion from the official Morpho Blue
 *     library source (SharesMathLib.sol + MathLib.sol)
 *   - free liquidity derivation for the verified withdrawable cap
 *
 * Provenance:
 *   https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol
 *   https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol
 *   https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol
 *
 * Selector derivation:
 *   keccak256("market(bytes32)")[:4]
 *   → 0x5c60e39a (computed via @noble/hashes/sha3 — not invented).
 *
 * ABI return tuple (from IMorpho.sol, IMorphoStaticTyping.market):
 *   (uint128 totalSupplyAssets,
 *    uint128 totalSupplyShares,
 *    uint128 totalBorrowAssets,
 *    uint128 totalBorrowShares,
 *    uint128 lastUpdate,
 *    uint128 fee)
 *
 * CRITICAL NOTE (verbatim from IMorpho.sol docstrings):
 *   "totalSupplyAssets does not contain the accrued interest since
 *    the last interest accrual."
 *   "totalSupplyShares does not contain the additional shares
 *    accrued by feeRecipient since the last interest accrual."
 *
 * Therefore the values returned by this reader reflect the LAST
 * onchain accrual. They are honest representations of the canonical
 * stored state but DO NOT include interest accrued since
 * `lastUpdate`. The UI must surface this.
 */

import { ethCall, parseUint256 } from "./rpc"
import type { EIP1193Provider } from "@/lib/wallet/types"

const SELECTOR_MARKET = "0x5c60e39a" as const

export interface MorphoMarketState {
  /** Raw onchain totalSupplyAssets (uint128). */
  totalSupplyAssets: bigint
  /** Raw onchain totalSupplyShares (uint128). */
  totalSupplyShares: bigint
  /** Raw onchain totalBorrowAssets (uint128). */
  totalBorrowAssets: bigint
  /** Raw onchain totalBorrowShares (uint128). */
  totalBorrowShares: bigint
  /** Last interest-accrual timestamp (uint128, unix seconds). */
  lastUpdate: bigint
  /** Protocol fee (uint128, WAD-scaled). 0 on most markets. */
  fee: bigint
}

/**
 * Encode `market(bytes32 id)` calldata. `id` is the keccak256
 * MarketParams id exposed by the LendingMarket row.
 */
export function encodeMorphoMarketCall(
  marketId: `0x${string}`,
): `0x${string}` {
  const id = marketId.replace(/^0x/, "").toLowerCase()
  if (id.length !== 64) {
    throw new Error("market: marketId must be a 32-byte hex string")
  }
  return (SELECTOR_MARKET + id) as `0x${string}`
}

/**
 * Read onchain market state. Returns `null` on any read failure —
 * callers MUST treat absence as "I don't know", not as zero state.
 */
export async function readMorphoMarket(
  morphoBlue: `0x${string}`,
  marketId: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<MorphoMarketState | null> {
  const res = await ethCall<string>(
    { to: morphoBlue, data: encodeMorphoMarketCall(marketId) },
    options,
  )
  if (res.kind === "error") return null
  // Six contiguous uint128 fields — each fits in 32 bytes, so we read
  // them as 32-byte slots and narrow to 128 bits per the IMorpho
  // typedef. This is consistent with how Morpho's storage layout
  // exposes these values: each uint128 occupies a full storage slot.
  return {
    totalSupplyAssets: parseUint256(res.value, 0),
    totalSupplyShares: parseUint256(res.value, 1),
    totalBorrowAssets: parseUint256(res.value, 2),
    totalBorrowShares: parseUint256(res.value, 3),
    lastUpdate: parseUint256(res.value, 4),
    fee: parseUint256(res.value, 5),
  }
}

/* ------------------------------------------------------ */
/* Shares ↔ assets conversion                              */
/* ------------------------------------------------------ */

/**
 * Virtual constants used by Morpho Blue's share math, taken
 * verbatim from SharesMathLib.sol:
 *
 *   uint256 internal constant VIRTUAL_SHARES = 1e6;
 *   uint256 internal constant VIRTUAL_ASSETS = 1;
 *
 * The virtual-offset approach mitigates ERC4626-style share-price
 * manipulation attacks. We replicate it locally so our offchain
 * conversion matches exactly what Morpho's `withdraw(shares>0)`
 * and `supply(assets>0)` compute internally.
 */
const VIRTUAL_SHARES_BIG = BigInt(1_000_000)
const VIRTUAL_ASSETS_BIG = BigInt(1)

/**
 * mulDivDown(x, y, d) = (x * y) / d  — from MathLib.sol.
 * Pure bigint division. No Number conversion. Truncates toward zero.
 */
function mulDivDown(x: bigint, y: bigint, d: bigint): bigint {
  if (d === BigInt(0)) return BigInt(0)
  return (x * y) / d
}

/**
 * mulDivUp(x, y, d) = ceil((x * y) / d) — from MathLib.sol.
 * Computed as (x * y + d - 1) / d. Pure bigint. No Number conversion.
 *
 * Edge case: d == 0 → returns 0 (caller treats as "unknown").
 */
function mulDivUp(x: bigint, y: bigint, d: bigint): bigint {
  if (d === BigInt(0)) return BigInt(0)
  return (x * y + d - BigInt(1)) / d
}

/**
 * Convert `shares` to asset-equivalent using the EXACT official
 * Morpho Blue formula:
 *
 *   toAssetsDown(shares, totalAssets, totalShares) =
 *       shares * (totalAssets + VIRTUAL_ASSETS)
 *             / (totalShares + VIRTUAL_SHARES)
 *
 * This is the round-down variant — what `Morpho.withdraw(shares>0)`
 * would yield for the user. Rounding direction matches the
 * protocol: user gets slightly less than the fair share price
 * when they withdraw, which protects the protocol.
 *
 * Edge cases:
 *   - shares == 0           → returns 0
 *   - totalShares == 0      → returns 0 (empty market, cannot derive)
 *   - market state is null  → returns null (caller treats as "unknown")
 *
 * IMPORTANT: this uses the RAW `market[id].totalSupplyAssets` /
 * `totalSupplyShares` from storage. It does NOT include interest
 * accrued since `market[id].lastUpdate`. The UI must surface that
 * limitation explicitly.
 */
export function toAssetsDown(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
): bigint {
  if (shares <= BigInt(0)) return BigInt(0)
  if (totalShares <= BigInt(0)) return BigInt(0)
  return mulDivDown(
    shares,
    totalAssets + VIRTUAL_ASSETS_BIG,
    totalShares + VIRTUAL_SHARES_BIG,
  )
}

/**
 * Convert `shares` to asset-equivalent using the EXACT official
 * Morpho Blue formula, ROUND UP:
 *
 *   toAssetsUp(shares, totalAssets, totalShares) =
 *       ceil(shares * (totalAssets + VIRTUAL_ASSETS)
 *                  / (totalShares + VIRTUAL_SHARES))
 *
 * This is the round-UP variant — what the protocol charges a
 * borrower when repaying shares, and what `Morpho.borrow(shares>0)`
 * would yield for the borrower. Rounding direction matches the
 * protocol: borrower pays slightly more than the fair share price,
 * which protects the protocol.
 *
 * Edge cases:
 *   - shares == 0           → returns 0
 *   - totalShares == 0      → returns 0 (empty market, cannot derive)
 *
 * IMPORTANT: uses RAW `market[id].totalBorrowAssets` /
 * `totalBorrowShares` from storage. Does NOT include interest
 * accrued since `market[id].lastUpdate`.
 *
 * F5B — used by `usePositionView` to derive `borrowedAssets` from
 * `borrowShares`. NEVER use `toAssetsDown` for the borrow side:
 * the direction matters.
 */
export function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
): bigint {
  if (shares <= BigInt(0)) return BigInt(0)
  if (totalShares <= BigInt(0)) return BigInt(0)
  return mulDivUp(
    shares,
    totalAssets + VIRTUAL_ASSETS_BIG,
    totalShares + VIRTUAL_SHARES_BIG,
  )
}

/**
 * Free liquidity of a Morpho Blue market:
 *
 *   liquidity = totalSupplyAssets - totalBorrowAssets
 *
 * This is exactly what `Morpho.withdraw(assets>0)` would deduct
 * before checking the `INSUFFICIENT_LIQUIDITY` invariant:
 *
 *   require(market[id].totalBorrowAssets <= market[id].totalSupplyAssets - assets, ...)
 *
 * i.e. a withdraw of up to `liquidity` is guaranteed to satisfy the
 * invariant, and any withdraw strictly larger than `liquidity`
 * would revert. Returns 0 if the market is fully borrowed.
 *
 * As with `toAssetsDown`, the value reflects stored state — it
 * does NOT include interest accrued since `lastUpdate`.
 */
export function marketFreeLiquidity(market: MorphoMarketState): bigint {
  if (market.totalBorrowAssets >= market.totalSupplyAssets) {
    return BigInt(0)
  }
  return market.totalSupplyAssets - market.totalBorrowAssets
}

/**
 * Maximum withdrawable assets for a given user supply position.
 *
 * The verified constraint from `Morpho.withdraw` is:
 *
 *   require(market[id].totalBorrowAssets <= market[id].totalSupplyAssets - assets, ...)
 *
 * For asset-based withdraw this caps `assets` at
 * `market[id].totalSupplyAssets - market[id].totalBorrowAssets`.
 *
 * For shares-based withdraw (which F3B will use to avoid rounding),
 * the user can withdraw up to their full `supplyShares` — the
 * contract then computes the asset amount using `toAssetsDown`.
 * Morpho's doc explicitly advises using the shares input when
 * withdrawing the FULL position to avoid conversion roundings.
 *
 * Therefore the maximum user-withdrawable ASSETS is:
 *
 *   min(userSuppliedAssets, marketFreeLiquidity(market))
 *
 * When `userSuppliedAssets <= marketFreeLiquidity`, the user can
 * withdraw their entire position without liquidity constraints.
 * When `userSuppliedAssets > marketFreeLiquidity`, the withdraw is
 * capped at `marketFreeLiquidity`. In that case, the F3B UI MUST
 * let the user withdraw by SHARES (not assets) for the full
 * position, or by assets up to the cap.
 *
 * Returns null when we lack enough verified state to compute it
 * (e.g. market state could not be read). Callers must surface this
 * as "withdrawable amount unknown" rather than zero.
 */
export function maxWithdrawableAssets(
  userSuppliedAssets: bigint,
  market: MorphoMarketState | null,
): bigint | null {
  if (market === null) return null
  const liquidity = marketFreeLiquidity(market)
  if (userSuppliedAssets <= liquidity) return userSuppliedAssets
  return liquidity
}
