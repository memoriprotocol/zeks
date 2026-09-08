/**
 * Curated stock collateral markets + yield venue constants for the Loop product.
 *
 * Stocks are ordered by market cap priority (highest first).
 * Yield venues are derived from live Morpho market data on Robinhood Chain
 * (see lib/markets/loop/service.ts). The static list below provides:
 *   - venue display configuration (name, risk tier, tagline)
 *   - the loan asset symbol that the loop service looks up in Morpho
 */

import type { LoopMarket } from "./types"
import type { YieldVenue } from "./types"

/** Stocks eligible for the Loop product (Robinhood Chain). */
export const CURATED_STOCKS = [
  "AAPL",
  "SPCX",
  "TSLA",
  "NVDA",
  "GOOGL",
  "AMZN",
  "MSFT",
  "META",
] as const

export type CuratedStock = (typeof CURATED_STOCKS)[number]

/**
 * Stablecoin identifiers the Loop product currently supports.
 * These are *loan asset symbols* — borrowed funds are denominated in them
 * and routed to a matching Morpho supply market for yield.
 */
export const SUPPORTED_LOAN_ASSETS = ["USDG", "USDC", "USDT"] as const
export type SupportedLoanAsset = (typeof SUPPORTED_LOAN_ASSETS)[number]

/**
 * Static display configuration per yield venue.
 * APY, TVL, liquidity, status come from live Morpho data; risk and
 * tagline are admin-defined metadata.
 */
export const YIELD_VENUE_CONFIG: Record<
  SupportedLoanAsset,
  Omit<YieldVenue,
    "apy" | "tvl" | "liquidity" | "source" | "status" | "fetchedAt" |
    "marketId" | "assetAddress" | "listed"
  >
> = {
  USDG: {
    id: "morpho-usdg-supply",
    name: "USDG Supply",
    asset: "USDG",
    risk: "low",
    tagline: "Native Morpho USDG market",
  },
  USDC: {
    id: "morpho-usdc-supply",
    name: "USDC Supply",
    asset: "USDC",
    risk: "low",
    tagline: "Morpho USDC market",
  },
  USDT: {
    id: "morpho-usdt-supply",
    name: "USDT Supply",
    asset: "USDT",
    risk: "medium",
    tagline: "Morpho USDT market",
  },
}

/** Ordered list (used by UI to render venue chips). */
export const YIELD_VENUE_ORDER: SupportedLoanAsset[] = ["USDG", "USDC", "USDT"]

/**
 * Capital multiplier — the per-token multiplier shown in stock
 * collateral cards. Robinhood stock tokens carry a "shares per token"
 * multiplier (e.g. one AAPL token = 1 share). The UI surfaces this
 * prominently on each stock collateral card.
 */
export const STOCK_TOKEN_CAPITAL_LABEL = "SHARES PER TOKEN"

/**
 * Fee estimate for opening + closing a loop.
 *
 * These are intentionally coarse. Until onchain fee telemetry is
 * wired into the ledger, the UI surfaces this number with a
 * "fees unknown" caveat; callers should treat it as a hint, not
 * a precise quote.
 */
export const LOOP_ESTIMATED_FEES_PERCENT = 0.15
