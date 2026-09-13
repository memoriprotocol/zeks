/**
 * ZEKS Markets — internal data types
 *
 * These are the NORMALIZED types the UI consumes. They are intentionally
 * decoupled from the raw Robinhood Stock Token API shape so:
 *
 *   1. The UI does not depend on upstream field names.
 *   2. Future providers (Chainlink Data Streams, internal oracle) can
 *      be slotted in behind the same surface.
 *   3. Bad / missing / malformed upstream data is sanitized at the
 *      boundary, not inside components.
 *
 * Phase 1 sources:
 *   - Asset metadata: Robinhood `/rhj/assets`
 *   - Quote data:     Robinhood `/rhj/prices/{symbol}`
 *
 * IMPORTANT SEMANTIC NOTE (see spec §02, §03):
 *
 *   Robinhood `/rhj/prices/{symbol}` returns the underlying-equity
 *   bid / ask. This is NOT an onchain execution price. We expose:
 *
 *     - bid                    (raw underlying bid)
 *     - ask                    (raw underlying ask)
 *     - referencePrice         (mid: (bid + ask) / 2, OR one-sided if the
 *                                other is missing; NEVER labelled as
 *                                executionPrice / swapPrice / onchainPrice)
 *
 *   Future phases may add `onchainOraclePrice` / `dexPrice` here
 *   without changing the UI surface.
 */

export const ROBINHOOD_CHAIN_ID = 4663 as const

/** Canonical lifecycle status of a Robinhood Stock Token asset. */
export type AssetLifecycleStatus =
  | "active"
  | "halted"
  | "delisted"
  | "unknown"

/** Canonical trading capability descriptor used in the Status column. */
export type TradingCapability =
  | "tradable"
  | "non-tradable"
  | "unknown"

/**
 * One normalized Stock Token entry from the Robinhood asset registry.
 * Only assets appropriate for Robinhood Chain (chainId === 4663) and
 * ACTIVE status are exposed in this shape.
 */
export interface MarketAsset {
  /** Stable upstream id, e.g. "0x000…c2425be3658540dd8e2424cbf3c5c649" */
  id: string
  /** Canonical ticker symbol, uppercase. */
  symbol: string
  /** Original `tokenName` from the upstream API. Preserved verbatim. */
  tokenNameRaw: string
  /**
   * Compact, human-friendly display name with product suffixes stripped
   * (e.g. "Apple" instead of "Apple • Robinhood Token").
   * See `lib/markets/display-name.ts` for the normalization rule.
   */
  displayName: string
  /**
   * Official logo URL from the Robinhood asset metadata.
   * Guaranteed to be an absolute https URL when present. We never
   * invent a corporate logo.
   */
  logoUrl: string | null
  /** Deployed contract on Robinhood Chain (chain 4663). */
  contractAddress: string
  chainId: typeof ROBINHOOD_CHAIN_ID
  /** Lifecycle status derived from upstream `status`. */
  status: AssetLifecycleStatus
  /** Whole-unit market trading capability. */
  tradingWhole: TradingCapability
  /** Fractional market trading capability. */
  tradingFractional: TradingCapability
  /** Current multiplier as a finite number, or null if absent / unparsable. */
  currentMultiplier: number | null
  /** Decimal places for the onchain token (commonly 18). */
  tokenDecimals: number | null
}

/**
 * Normalized quote for a single symbol. All numeric fields are
 * `number | null` — we NEVER coerce a malformed string to `NaN`; we
 * return `null` so the UI can render "—".
 */
export interface MarketQuote {
  symbol: string
  /** Raw underlying-equity bid. */
  bid: number | null
  /** Raw underlying-equity ask. */
  ask: number | null
  /**
   * Derived mid reference price (see spec §03).
   *   - (bid + ask) / 2  when both are valid finite numbers
   *   - one-sided value   when only one of bid / ask is valid
   *   - null              when neither side is usable
   *
   * Internally labelled `referencePrice` (never executionPrice).
   */
  referencePrice: number | null
  /** ISO currency code (typically "USD"). */
  currency: string | null
  /** Daily trading volume as a finite number, or null. */
  dailyTradingVolume: number | null
  /** Whether upstream reports this market as halted. */
  isTradingHalt: boolean
  /** ISO timestamp from upstream `generatedAt`, or null. */
  generatedAt: string | null
  /**
   * Previous closing reference price, used to derive 24h change %.
   * This is a Phase 1 stub — the real upstream may not provide it yet.
   * Until then, the Robinhood normalize layer will attempt to extract
   * it from the upstream response; if absent, set to null so the
   * UI renders "—" instead of a fabricated value.
   */
  previousClose: number | null
  /**
   * Pre-derived 24h change percentage: (price - previousClose) /
   * previousClose * 100. Computed once at the normalize layer so
   * the UI never has to redo the math and never sees NaN/Infinity.
   * `null` when previousClose is null or <= 0, or when price is
   * null / non-finite.
   */
  changePercent: number | null
  /**
   * ISO timestamp captured the moment the upstream price was
   * generated (`generatedAt` from Robinhood /rhj/prices). Falls
   * back to the local batch `fetchedAt` when upstream omits it.
   */
  updatedAt: string | null
  /** Provenance tag, useful for diagnostics and freshness labels. */
  source: "robinhood-prices"
}

/**
 * Container returned by the server-side quotes endpoint.
 * Holds the quote map plus the freshness metadata the UI uses for the
 * "Updated Xs ago" indicator (spec §19).
 */
export interface MarketQuoteSet {
  /** symbol -> MarketQuote (only present when upstream returned data). */
  quotes: Record<string, MarketQuote>
  /** ISO timestamp when the upstream fetch was issued. */
  fetchedAt: string
  /** Symbol set upstream failed to deliver (rate-limit, 4xx, etc). */
  failedSymbols: string[]
}

/**
 * The combined payload the Markets page hydrates from. Keeps the asset
 * universe and quote data in one typed blob so the UI can render
 * partial data (quotes missing) and stale data (asset list older than
 * quotes) without losing fidelity.
 */
export interface MarketsPayload {
  assets: MarketAsset[]
  quotes: MarketQuoteSet
  /**
   * Source freshness: when the asset universe was last fetched from
   * upstream. Used to render "Updated 12s ago".
   */
  assetsFetchedAt: string
}

/** Loading / error / stale state discriminated union. */
export type MarketsDataState =
  | { kind: "loading" }
  | { kind: "ok"; payload: MarketsPayload }
  | { kind: "error"; message: string }
  | { kind: "stale"; payload: MarketsPayload; reason: string }
