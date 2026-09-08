/**
 * ZEKS Loop — Domain types
 *
 * A "Loop" is a structured borrow-against-stocks strategy:
 *   1. Deposit stock as collateral  (LLTV capped)
 *   2. Borrow stablecoin           (borrow APY from Morpho market)
 *   3. Route stablecoin to yield   (yield venue APY)
 *   4. Net carry = venue APY − borrow APY − fees
 *
 * All numeric fields are `number | null` — missing data renders as "—".
 */

/** Curated stock collateral markets available for looping. */
export interface LoopMarket {
  symbol: string
  name: string
  logoUrl: string | null
  /** Morpho Blue market ID for this collateral stock. */
  marketId: string | null
  /** Loan-to-value cap as 0..1 decimal. */
  lltv: number | null
  /** Oracle price in USD. */
  oraclePrice: number | null
  /** Supply APY on Morpho (if the user supplies the stock). */
  supplyApy: number | null
  /** Borrow APY for borrowing the stablecoin. */
  borrowApy: number | null
  /** Source of borrow rate. */
  borrowApySource: "morpho" | "mock"
  /** Current utilization ratio (0..1). */
  utilization: number | null
  /** Whether real Morpho data is available for this market. */
  sourceMode: "real-morpho" | "real-morpho-unlisted" | "mock"
  /** Short address of the vault / Morpho vault contract. */
  contractAddress: string | null
  /**
   * Robinhood stock-token capital multiplier (1 stock token = N
   * underlying shares). Used to display "you hold X shares per token".
   * Null when unknown.
   */
  rhMultiplier: number | null
  /** Available liquidity in USD for this Morpho market. */
  availableLiquidityUsd: number | null
  /** Total supply in USD for this Morpho market. */
  totalSupplyUsd: number | null
}

/** A destination where borrowed stablecoin can be deployed for yield. */
export interface YieldVenue {
  /** Stable, unique venue identifier. */
  id: string
  /** Display name (e.g. "USDG Supply"). */
  name: string
  /** Underlying asset symbol (e.g. "USDG"). */
  asset: string | null
  /** APY in percent (e.g. 4.32 means 4.32%). */
  apy: number | null
  /** Total deposits in USD. */
  tvl: number | null
  /** Available withdrawable supply in USD. */
  liquidity: number | null
  /** APY data source. */
  source: "morpho-supply" | "mock"
  /** Lifecycle / freshness status. */
  status:
    | "live"
    | "stale"
    | "unlisted"
    | "unavailable"
    | "mock"
  /** Risk tier (admin-defined venue meta, not derived from onchain). */
  risk: "low" | "medium" | "high"
  /** Short descriptor shown under the name. */
  tagline: string
  /** Morpho market id (null when mock). */
  marketId: string | null
  /** Underlying asset address (null when mock). */
  assetAddress: string | null
  /** True when the underlying Morpho market is in the listed set. */
  listed: boolean | null
  /** ISO timestamp of last refresh. */
  fetchedAt: string
}

/** Snapshot of a configured loop (not yet persisted onchain). */
export interface LoopPosition {
  /** Which stock is used as collateral. */
  market: LoopMarket
  /** Which yield venue the borrowed stablecoin is routed into. */
  venue: YieldVenue
  /** Collateral amount (in token units, e.g. 10 AAPL). */
  collateralAmount: number | null
  /** Loan amount (in stablecoin units). */
  loanAmount: number | null
  /** Estimated LTV after the loop is opened: loan / (collateral × price). */
  estimatedLtv: number | null
}

/**
 * Net carry breakdown for a configured loop.
 *
 * Positive carry means the yield venue earns more than borrow costs.
 * When fees / costs are unavailable we surface them separately so
 * the UI can display "fees — unknown" rather than fabricating
 * a precise net number.
 */
export interface NetCarry {
  /** Yield venue APY in percent. */
  venueApy: number | null
  /** Borrow APY in percent. */
  borrowApy: number | null
  /**
   * Carry before fees: venueApy − borrowApy.
   * Null when either APY is missing.
   */
  gross: number | null
  /** Estimated fees in percent (open/close + spread). May be null. */
  fees: number | null
  /** True when fee data is unavailable; UI shows a "fees unknown" badge. */
  feesUnknown: boolean
  /** True when any required field is missing. */
  incomplete: boolean
  /**
   * Net carry: venueApy − borrowApy − fees.
   * Null when fees are unknown or either APY is missing — we do NOT
   * fabricate a precise number when fees are unavailable.
   */
  net: number | null
  /** Whether the loop has a positive carry (only meaningful when net !== null). */
  profitable: boolean
}

/**
 * Computes net carry breakdown from a loop position.
 *
 * When `feesPercent` is null we treat fees as unavailable:
 *   - `feesUnknown` = true
 *   - `net` = null (cannot be inferred without fee basis)
 *
 * `gross` is computed regardless of fees — used for the
 * "before fees" view when fees are unknown.
 */
export function computeNetCarry(
  position: LoopPosition,
  feesPercent: number | null = 0.15,
): NetCarry {
  const venueApy = position.venue.apy ?? null
  const borrowApy = position.market.borrowApy ?? null
  const fees = feesPercent
  const feesUnknown = fees == null

  const incomplete =
    venueApy == null || borrowApy == null || feesUnknown

  const gross =
    venueApy != null && borrowApy != null ? venueApy - borrowApy : null

  let net: number | null = null
  if (
    !incomplete &&
    fees != null &&
    venueApy != null &&
    borrowApy != null
  ) {
    net = venueApy - borrowApy - fees
  }

  return {
    venueApy,
    borrowApy,
    gross,
    fees,
    feesUnknown,
    incomplete,
    net,
    profitable: net != null ? net > 0 : false,
  }
}

/** Risk status for a given estimated LTV vs LLTV. */
export type LoopRiskStatus = "safe" | "warning" | "danger" | "unknown"

export function assessLoopRisk(
  estimatedLtv: number | null,
  lltv: number | null,
): LoopRiskStatus {
  if (estimatedLtv == null || lltv == null) return "unknown"
  const ratio = estimatedLtv / lltv
  if (ratio <= 0.5) return "safe"
  if (ratio <= 0.8) return "warning"
  return "danger"
}
