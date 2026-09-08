/**
 * ZEKS Markets — Robinhood Reference Market Price Service
 *
 * Reads from:
 *
 *   GET https://api.robinhood.com/rhj/prices/{symbol}
 *
 * This returns the UNDERLYING-EQUITY bid / ask, which is a different
 * signal from the Chainlink oracle price (which reflects the onchain
 * ERC-20 token value on Robinhood Chain, including the multiplier).
 *
 * We keep these SEPARATE in the data model:
 *
 *   - `oraclePrice`  → Chainlink onchain feed (via oracle/service.ts)
 *                     The authoritative lending oracle value.
 *
 *   - `referenceMarket` → Robinhood REST prices (via this service)
 *                        A reference-level underlying-equity bid/ask.
 *
 * For the lending use case, `referenceMarket` is informational only —
 * it is NOT used as the oracle value. The oracle is Chainlink.
 *
 * No API key required. Public endpoint with per-symbol 15-second TTL
 * in the existing `fetchRobinhoodQuotes` fetcher.
 */

import { fetchRobinhoodQuotes } from "./robinhood-prices"
import type { MarketQuote } from "./types"

/** A reference-level bid/ask from the Robinhood REST price feed. */
export interface ReferenceMarketPrice {
  symbol: string
  /** Underlying-equity bid (raw, before multiplier adjustment). */
  bid: number | null
  /** Underlying-equity ask (raw, before multiplier adjustment). */
  ask: number | null
  /**
   * Midpoint reference price: (bid + ask) / 2 when both sides present,
   * one-sided when only one side is available.
   * This is NOT the oracle value used for lending.
   */
  referencePrice: number | null
  currency: string | null
  /** ISO timestamp of the upstream quote generation. */
  generatedAt: string | null
  /** Whether the market is halted. */
  isTradingHalt: boolean
  source: "robinhood-reference-market"
}

/**
 * Fetch reference market prices for multiple symbols from Robinhood.
 * Returns a map of symbol -> ReferenceMarketPrice.
 *
 * Failed symbols are absent from the result map. Callers should handle
 * empty results gracefully.
 */
export async function fetchReferenceMarketPrices(
  symbols: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<Map<string, ReferenceMarketPrice>> {
  const result = await fetchRobinhoodQuotes(symbols, options)
  const map = new Map<string, ReferenceMarketPrice>()

  for (const sym of symbols.map((s) => s.toUpperCase())) {
    const q = result.quotes[sym]
    if (!q) continue
    map.set(sym, fromMarketQuote(q))
  }

  return map
}

/**
 * Fetch the reference market price for a single symbol.
 */
export async function fetchReferenceMarketPrice(
  symbol: string,
): Promise<ReferenceMarketPrice | null> {
  const result = await fetchRobinhoodQuotes([symbol])
  const q = result.quotes[symbol.toUpperCase()]
  return q ? fromMarketQuote(q) : null
}

function fromMarketQuote(q: MarketQuote): ReferenceMarketPrice {
  return {
    symbol: q.symbol,
    bid: q.bid,
    ask: q.ask,
    referencePrice: q.referencePrice,
    currency: q.currency,
    generatedAt: q.generatedAt,
    isTradingHalt: q.isTradingHalt,
    source: "robinhood-reference-market",
  }
}
