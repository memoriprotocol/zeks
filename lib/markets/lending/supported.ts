/**
 * Supported Earn Universe
 *
 * The Earn surface only renders markets for these curated Robinhood
 * Chain Stock Tokens. Filtering is by SYMBOL (whitelisted tickers) —
 * NOT by logo URL. Real Morpho rows commonly have `logoUrl: null`
 * because the lending service writes logos in a separate pass; the
 * AssetLogo resolver renders logos from the local registry /
 * upstream metadata regardless.
 *
 * Pipeline order (do not change):
 *
 *   raw Morpho markets
 *     → normalize asset identity
 *     → filter to SUPPORTED_EARN_SYMBOLS (this file)
 *     → calculate Earn statistics
 *     → sort / filter / search
 *     → render
 *
 * This list is the single source of truth — the SSR fetch path
 * AND the client memo both consult it so the UI is consistent
 * even if the upstream cache returns unrelated rows.
 */

export const SUPPORTED_EARN_SYMBOLS: readonly string[] = [
  "AAPL",
  "SPCX",
  "TSLA",
  "NVDA",
  "GOOGL",
  "AMZN",
  "MSFT",
  "META",
] as const

const SUPPORTED_EARN_SET: ReadonlySet<string> = new Set(
  SUPPORTED_EARN_SYMBOLS.map((s) => s.trim().toUpperCase()),
)

/** Normalize a symbol for comparison. */
export function normalizeSymbol(symbol: string | null | undefined): string {
  return (symbol ?? "").trim().toUpperCase()
}

/** True when `symbol` matches one of the supported Earn tickers. */
export function isSupportedEarnSymbol(symbol: string | null | undefined): boolean {
  return SUPPORTED_EARN_SET.has(normalizeSymbol(symbol))
}

/**
 * Type guard for LendingMarket-like objects. The shape we look at
 * here is just `symbol`; callers pass in the full row and we only
 * consult the supported set.
 */
export interface SupportedMarketLike {
  symbol: string
}

export function isSupportedEarnMarket<T extends SupportedMarketLike>(
  market: T,
): boolean {
  return isSupportedEarnSymbol(market.symbol)
}

/** Filter an array of `LendingMarket`-like rows to the supported set. */
export function filterToSupportedEarnMarkets<T extends SupportedMarketLike>(
  markets: readonly T[],
): T[] {
  return markets.filter(isSupportedEarnMarket)
}
