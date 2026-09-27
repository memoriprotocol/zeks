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
 *
 * ── F11 carve-out (LOCKED) ─────────────────────────────────────
 *
 *   USDe/USDG is the only currently-executable Morpho market on
 *   Robinhood Chain whose on-chain LLTV matches the Morpho GraphQL
 *   indexer (91.5%). The 8 stock-token collateral markets above
 *   (AAPL / TSLA / NVDA / GOOGL / AMZN / MSFT / META / SPCX) have
 *   on-chain LLTV = 1% (deployment default) and would revert at
 *   `simulateWrite`. F11 deliberately keeps them in the supported
 *   universe so the page chrome and the F12 lifecycle chip can
 *   display their status, but the locked F1–F11 transaction paths
 *   do not gate on this list — they gate on `chainId + marketId +
 *   sourceMode` as before.
 *
 * ── F12 follow-up (this list is unchanged) ─────────────────────
 *
 *   F12 introduces a per-market `lifecycle` field on
 *   `LendingMarket` (`active | provisional | inactive | unknown`).
 *   When ALL of the 8 stock-token markets reach `lifecycle ===
 *   "active"` on-chain, this list can be simplified; F12 does NOT
 *   remove the F11 carve-out. The 8 stock-token markets stay in
 *   the supported list — only their on-chain LLTV / MarketParams
 *   status is what changes.
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
  // F11 — dedicated test market. USDe/USDG (Morpho Blue market
  // 0xc845da65a020ddca5f132efa8fea79676d8edfdea504226a4c01e7a9e34cddd6
  // on Robinhood Chain 4663) is the only currently-executable
  // Morpho market on this chain whose on-chain LLTV matches the
  // Morpho GraphQL indexer (91.5%).
  //
  // F12 — see F12-B (`lib/markets/lending/verify.ts`). The 8
  // stock-token collateral markets above have on-chain LLTV = 1%
  // (deployment default) and are surfaced to the UI as
  // `lifecycle: "inactive"` until they are upgraded on-chain.
  // Do NOT remove them from this list — F12 verifies each market
  // and surfaces its lifecycle via `LendingMarket.lifecycle`.
  // When a market flips to `lifecycle: "active"`, F12 makes it
  // transaction-eligible automatically; this list stays the same.
  "USDE",
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
