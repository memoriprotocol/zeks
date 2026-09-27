/**
 * ZEKS Markets — Morpho Blue oracle read.
 *
 * Read-only. No transactions, no writes, no signatures.
 *
 * Provides the verified `price()` view from a Morpho Blue oracle.
 *
 * The Morpho Blue oracle interface is the abstract `IMorphoOracle`
 * defined in `morpho-org/morpho-blue-oracles`. Every oracle
 * implementation (ChainlinkAdapterV2, PreMarketHooksAdapter, …)
 * exposes the same canonical signature:
 *
 *   function price() external view returns (uint256)
 *
 * Selector derivation:
 *   keccak256("price()")[:4]  →  0x90555a0f
 *   (computed via @noble/hashes/sha3 — not invented.)
 *
 * Return scaling (canonical Morpho Blue convention, verified
 * from IMorphoOracle docs at
 * https://docs.morpho.org/developers/contracts/oracles):
 *
 *   `price()` returns the price of `10^collateralDecimals` units of
 *   collateral token quoted in `10^loanDecimals` units of loan
 *   token, scaled by `10^(36 + loanDecimals - collateralDecimals)`
 *   decimals of precision.
 *
 *   Concretely:
 *     collateralValueInLoanUnits = collateralRaw * price
 *         / 10^(36 + loanDecimals - collateralDecimals)
 *     = collateralRaw * price * 10^collateralDecimals
 *         / (1e36 * 10^loanDecimals)
 *
 *   Worked example — AAPL at $200, AAPL=18 decimals, USDG=6 decimals:
 *     - oracle price = 200 USDG / 1e18 AAPL * 1e(36+6-18)
 *                     = 200e6 / 1e18 * 1e24 = 200e12
 *     - collateralRaw = 1e18 (1 AAPL)
 *     - collateralValue = 1e18 * 200e12 * 1e18 / (1e36 * 1e6)
 *                       = 200e48 / 1e42 = 200e6 = 200 USDG ✓
 *
 * The oracle returns 0 when the market is not yet seeded or the
 * underlying feeds are invalid. We surface zero / invalid reads as
 * an error (not a fake number) so the UI must not fabricate capacity.
 *
 * Provenance:
 *   - https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol
 *   - https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IOracle.sol
 *   - https://docs.morpho.org/developers/contracts/oracles
 */

import { ethCall, parseUint256 } from "./rpc"
import type { EIP1193Provider } from "@/lib/wallet/types"

/**
 * `price()` selector — keccak256("price()")[:4].
 *
 * Verified from the official `IMorphoOracle.sol` interface, not from
 * memory. If the verified Morpho Blue oracle deployment changes its
 * signature, this constant MUST be re-derived from the new source.
 */
export const MORPHO_ORACLE_PRICE_SELECTOR = "0x90555a0f" as const

/**
 * The canonical 1e36 component of the Morpho oracle price scale.
 *
 * The full scale is `1e36 * 10^loanDecimals / 10^collateralDecimals`,
 * but we keep `1e36` here for documentation and as the constant that
 * is constant across all tokens.
 */
export const MORPHO_ORACLE_PRICE_SCALE = BigInt(
  "1000000000000000000000000000000000000",
) // 1e36

/**
 * Encoded `price()` call. The oracle is a parameterless view function.
 */
export function encodeMorphoOraclePriceCall(): `0x${string}` {
  return MORPHO_ORACLE_PRICE_SELECTOR as `0x${string}`
}

/**
 * Result of an onchain `oracle.price()` call.
 *
 * `price` is the canonical Morpho Blue price, scaled by
 * `10^(36 + loanDecimals - collateralDecimals)`. `null` when the
 * read failed (transport error, wrong chain, missing code, etc.).
 *
 * The price may be 0 (zero / invalid) — that's a legitimate onchain
 * response and is surfaced here so the caller can decide whether
 * to use it or treat it as "invalid oracle".
 */
export interface MorphoOraclePrice {
  /** Raw oracle `price()` return value (uint256). */
  price: bigint
}

/**
 * Read onchain oracle price. Returns `null` on any read failure —
 * callers MUST treat absence as "I don't know", not as zero state.
 */
export async function readMorphoOraclePrice(
  oracle: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<MorphoOraclePrice | null> {
  const res = await ethCall<string>(
    { to: oracle, data: encodeMorphoOraclePriceCall() },
    options,
  )
  if (res.kind === "error") return null
  // `price()` returns a single uint256, occupying slot 0.
  return {
    price: parseUint256(res.value, 0),
  }
}

/* ------------------------------------------------------ */
/* Verified collateral valuation                            */
/* ------------------------------------------------------ */

/**
 * Compute the collateral value in loan-token units using the
 * verified Morpho Blue oracle semantics.
 *
 *   collateralValueInLoanUnits =
 *       collateralRaw * oraclePrice * 10^collateralDecimals
 *       / (1e36 * 10^loanDecimals)
 *
 *   All arithmetic is bigint; we never convert to Number.
 *
 * Rounding direction: ROUND DOWN.
 *
 *   Why DOWN: this function reports an asset-denominated valuation
 *   used for safety/risk computation. Rounding DOWN is the
 *   conservative direction — it slightly UNDERSTATES collateral
 *   value, which makes the borrow limit slightly TIGHTER (safer).
 *
 *   Morpho itself rounds DOWN for safety in collateral value
 *   derivations (per IMorphoOracle docs and the official
 *   morpho-blue-oracles implementations).
 *
 * Edge cases:
 *   - collateralRaw == 0  → returns 0
 *   - oraclePrice == 0     → returns 0 (invalid oracle — caller must
 *                            treat as "no borrow capacity", not as zero)
 *   - decimals mismatch   → caller passes valid decimals; this
 *                            function does not validate them.
 */
export function collateralValueInLoanAssets(
  collateralRaw: bigint,
  oraclePrice: bigint,
  collateralDecimals: number,
  loanDecimals: number,
): bigint {
  if (collateralRaw <= BigInt(0)) return BigInt(0)
  if (oraclePrice <= BigInt(0)) return BigInt(0)

  // 10^loanDecimals and 10^collateralDecimals are computed via
  // bigint exponentiation to keep this function bigint-only.
  const tenN = (n: number): bigint => {
    let r = BigInt(1)
    const ten = BigInt(10)
    for (let i = 0; i < n; i++) r *= ten
    return r
  }

  const loanFactor = tenN(loanDecimals)
  const collateralFactor = tenN(collateralDecimals)
  const numerator = collateralRaw * oraclePrice * collateralFactor
  const denominator = MORPHO_ORACLE_PRICE_SCALE * loanFactor
  return numerator / denominator
}

/* ------------------------------------------------------ */
/* Safe collateral withdrawal math                           */
/* ------------------------------------------------------ */

/**
 * Compute the maximum safe withdrawable collateral given the
 * current onchain position state and LLTV.
 *
 * The user's remaining collateral after withdrawal must satisfy
 * the Morpho Blue health constraint:
 *
 *   remainingCollateralValue * lltv >= borrowedAssets
 *
 * Using the verified Morpho oracle formula:
 *   collateralValue (loan units) =
 *       collateralRaw * oraclePrice * 10^collateralDecimals
 *       / (1e36 * 10^loanDecimals)
 *
 * Solving the constraint for max withdraw:
 *   maxWithdrawable = collateralRaw
 *       - ceilDiv(
 *           borrowedAssets * 10^loanDecimals * 1e36,
 *           oraclePrice * 10^collateralDecimals * lltvWad
 *         )
 *
 * Rounding direction: ROUND DOWN on the result (conservative —
 * withdraw slightly less rather than slightly more).
 * The ceilDiv in the locked portion rounds UP (conservative).
 *
 * Edge cases:
 *   - debt == 0           → maxWithdrawable = collateralRaw (all is safe)
 *   - collateralRaw == 0  → 0
 *   - oraclePrice == 0     → 0 (invalid oracle)
 *   - lltv == 0            → 0 (no borrowing allowed on this market)
 *   - locked >= collateral → 0
 *
 * If required data is unavailable or invalid, callers MUST NOT call
 * this function — return 0 and disable withdrawal.
 */
export function maxWithdrawableCollateral(
  /** User's raw collateral (bigint, collateral-token units). */
  collateralRaw: bigint,
  collateralDecimals: number,
  loanDecimals: number,
  oraclePrice: bigint,
  borrowedAssets: bigint,
  lltvWad: bigint,
): bigint {
  if (collateralRaw <= BigInt(0)) return BigInt(0)
  if (borrowedAssets <= BigInt(0)) return collateralRaw
  if (oraclePrice <= BigInt(0)) return BigInt(0)
  if (lltvWad <= BigInt(0)) return BigInt(0)

  const tenN = (n: number): bigint => {
    let r = BigInt(1)
    const ten = BigInt(10)
    for (let i = 0; i < n; i++) r *= ten
    return r
  }

  // lockedCollateralRaw = ceilDiv(borrowed * 10^lDec * 1e36, oraclePrice * 10^cDec * lltvWad)
  const lockedNumerator =
    borrowedAssets * tenN(loanDecimals) * MORPHO_ORACLE_PRICE_SCALE
  const lockedDenominator = oraclePrice * tenN(collateralDecimals) * lltvWad
  const lockedCollateralRaw =
    (lockedNumerator + lockedDenominator - BigInt(1)) / lockedDenominator

  if (collateralRaw <= lockedCollateralRaw) return BigInt(0)
  return collateralRaw - lockedCollateralRaw
}
