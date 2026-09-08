/**
 * ZEKS Markets — Robinhood Stock Token Metadata Service
 *
 * Thin wrapper around the existing Robinhood asset registry fetcher.
 * Provides a lending-domain-friendly view of Robinhood Stock Token
 * metadata for use in the lending service layer.
 *
 * Sources:
 *   GET https://api.robinhood.com/rhj/assets
 *
 * No API key required. Public endpoint with 5-minute TTL cache.
 *
 * The `normalizeAsset` from `lib/markets/normalize.ts` handles all
 * per-field validation and the Robinhood-Chain (4663) filter.
 */

import { fetchRobinhoodAssets } from "../markets/robinhood-assets"
import type { MarketAsset } from "../markets/types"

/** Per-symbol metadata for a Robinhood Stock Token on chain 4663. */
export interface StockTokenMetadata {
  symbol: string
  name: string
  /** Token symbol as the Robinhood API returns it (uppercase). */
  tokenSymbol: string
  /** Deployed ERC-20 contract on Robinhood Chain (4663). */
  contractAddress: string
  /** Current onchain multiplier (as decimal, e.g. 1.000566). */
  currentMultiplier: number | null
  /** Token decimal places (commonly 18). */
  tokenDecimals: number | null
  /** ISIN if available. */
  isin: string | null
  /** Trading capabilities for whole and fractional units. */
  tradingWhole: "tradable" | "non-tradable" | "unknown"
  tradingFractional: "tradable" | "non-tradable" | "unknown"
  /** Whether the Robinhood API reports this asset as active. */
  status: "active" | "halted" | "delisted" | "unknown"
  /**
   * Logo URL from Robinhood. May be null if the asset doesn't have a
   * per-symbol logo (Robinhood returns a generic placeholder for many
   * assets; the normalize layer discards known-placeholder paths).
   * Fall back to local /public/assets/logos/ or the ticker-initial
   * deterministic fallback.
   */
  logoUrl: string | null
  /** Source tag for diagnostics. */
  source: "robinhood-asset-registry"
}

/**
 * Fetch stock token metadata for the given symbols (case-insensitive).
 * Symbols not in the Robinhood universe are absent from the result map.
 *
 * The underlying fetcher filters to chainId 4663 + ACTIVE status, so
 * all returned entries are live Robinhood Chain Stock Tokens.
 */
export async function fetchStockTokenMetadata(
  symbols: readonly string[],
): Promise<Map<string, StockTokenMetadata>> {
  const assets = await fetchRobinhoodAssets()
  const targetSet = new Set(symbols.map((s) => s.toUpperCase()))
  const result = new Map<string, StockTokenMetadata>()

  for (const asset of assets) {
    if (!targetSet.has(asset.symbol)) continue
    result.set(asset.symbol, fromMarketAsset(asset))
  }

  return result
}

/**
 * Fetch stock token metadata for all known active Robinhood Chain tokens.
 */
export async function fetchAllStockTokenMetadata(): Promise<
  Map<string, StockTokenMetadata>
> {
  const assets = await fetchRobinhoodAssets()
  const result = new Map<string, StockTokenMetadata>()
  for (const asset of assets) {
    result.set(asset.symbol, fromMarketAsset(asset))
  }
  return result
}

function fromMarketAsset(a: MarketAsset): StockTokenMetadata {
  return {
    symbol: a.symbol,
    name: a.displayName,
    tokenSymbol: a.symbol,
    contractAddress: a.contractAddress,
    currentMultiplier: a.currentMultiplier,
    tokenDecimals: a.tokenDecimals,
    isin: null,
    tradingWhole: a.tradingWhole,
    tradingFractional: a.tradingFractional,
    status: a.status,
    logoUrl: a.logoUrl,
    source: "robinhood-asset-registry",
  }
}
