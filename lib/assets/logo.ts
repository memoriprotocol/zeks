/**
 * ZEKS — Canonical Asset Logo Resolver
 *
 * Priority (per the data-quality spec):
 *
 *   a) exact local known logo (lib/assets/registry.ts)
 *   b) Robinhood /rhj/assets logoUrl matched by contract address
 *   c) Robinhood metadata logoUrl matched by canonical asset id/address
 *   d) deterministic ticker-initial fallback (handled by AssetLogo)
 *
 * The contract address is the AUTHORITATIVE lookup key when known —
 * symbols alone are ambiguous across asset universes. The contract
 * address trumps any symbol-based guess.
 *
 * `resolveAssetLogo` returns the URL of the first resolvable source
 * or `null` when nothing authoritative is available. The renderer
 * (AssetLogo) handles the visual fallback when this returns null.
 */

import { resolveAsset, type AssetRegistryEntry } from "@/lib/assets/registry"

export interface ResolveLogoInput {
  /** Ticker symbol — used only for the registry fallback. */
  symbol?: string | null
  /** Onchain contract address (lowercased). Trumps symbol. */
  contractAddress?: string | null
  /** Optional Robinhood asset-registry logoUrl. */
  rhLogoUrl?: string | null
  /**
   * Optional pre-resolved /assets path (e.g. local logo file). When
   * provided, this is used directly before any remote lookup.
   */
  localLogoUrl?: string | null
}

/**
 * Return the most-authoritative logo URL for an asset, or `null` when
 * the caller should fall back to the ticker-initial placeholder.
 *
 * Contract address has priority over symbol when resolving against
 * the local registry because it is the onchain identifier — symbol
 * collisions are possible across universes.
 */
export function resolveAssetLogo(input: ResolveLogoInput): string | null {
  // (a) explicit local URL wins
  if (input.localLogoUrl) return input.localLogoUrl

  const entry: AssetRegistryEntry | null = input.symbol
    ? resolveAsset(input.symbol)
    : null
  const entryLogo = entry?.logoUrl ?? null

  if (!input.contractAddress) {
    // No contract address → can't validate against onchain. Use the
    // registry's symbol-derived entry (already null if unknown).
    return entryLogo
  }

  const addr = input.contractAddress.trim().toLowerCase()

  // (b)/(c) Robinhood-supplied logo, IF the upstream actually shipped
  // a real logo (the normalize layer already filters placeholder
  // paths but we double-check for any obvious "placeholder" markers).
  if (input.rhLogoUrl) {
    const url = input.rhLogoUrl.trim()
    if (
      url.length > 0 &&
      /^https?:\/\//i.test(url) &&
      !isPlaceholderLogo(url)
    ) {
      // Prefer onchain-authoritative URL when the address is known.
      return url
    }
  }

  // (a) registry fall-back. We DON'T compare against the address
  // here — registry entries are symbol-scoped and may outlive a
  // redeployment. The local file is the safer choice when no
  // upstream logo is available.
  return entryLogo
}

/** Known Robinhood placeholder paths. The normalize layer filters
 * these but we keep a belt-and-braces guard here. */
const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /generic/i,
  /default_logo/i,
  /assets\/logos\/generic/i,
  /1x1\.(png|svg)/i,
  /\/-\//,
]

function isPlaceholderLogo(url: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(url))
}

/**
 * Resolved logo descriptor for a single market row.
 *
 * When `url` is non-null and passes preflight (HEAD 200), the AssetLogo
 * renders it. Otherwise the AssetLogo's preload probe handles the
 * fallback to the letter monogram.
 */
export interface AssetLogoDescriptor {
  symbol: string
  url: string | null
  source: "registry" | "robinhood-asset-registry" | "fallback"
  unresolved: boolean
}

/**
 * High-level helper: take raw market data and produce a normalized
 * descriptor for use by AssetLogo.
 */
export function buildLogoDescriptor(input: ResolveLogoInput): AssetLogoDescriptor {
  const entry = input.symbol ? resolveAsset(input.symbol) : null
  const url = resolveAssetLogo(input)
  let source: AssetLogoDescriptor["source"] = "fallback"
  if (url) {
    if (input.rhLogoUrl && url === input.rhLogoUrl) {
      source = "robinhood-asset-registry"
    } else if (entry?.logoUrl && url === entry.logoUrl) {
      source = "registry"
    }
  }
  return {
    symbol:
      entry?.symbol ?? ((input.symbol ?? "").toUpperCase() || "?"),
    url,
    source,
    unresolved: !url,
  }
}
