/**
 * ZEKS Asset Registry
 *
 * The shared ticker -> logo / metadata resolver used by every UI
 * surface (Markets, Borrow, Yield, Portfolio, future /app modules).
 *
 * Per spec §11:
 *
 *   "The ZEKS asset identity system must NOT be limited to:
 *    AAPL, TSLA, NVDA, ETH, USDG."
 *
 *   "The asset identity component should be ready for many symbols
 *    such as AAPL, TSLA, NVDA, MSFT, META, AMZN, GOOGL, and any
 *    other ACTIVE Robinhood Chain Stock Tokens returned by the
 *    official asset registry/API."
 *
 * This registry is intentionally:
 *
 *   1. Static-first — the known tickers in this repo are explicit.
 *   2. Compatible with a dynamic hydration phase — Robinhood's
 *      Stock Token metadata (tokenSymbol, tokenName, deployments,
 *      contractAddress, chainId, logoUrl, status) can flow into the
 *      same shape, and AssetLogo will pick up logoUrl values that
 *      contain http(s).
 *   3. Resolved locally by default (./assets/logos/{SYMBOL}.svg)
 *      so the site does NOT depend on a network call to render any
 *      known ticker.
 *
 * USDG is intentionally registered with `unresolved: true` because
 * the project does not yet pin a specific issuer / contract / metadata
 * source. Per the asset-identity spec §08, we MUST NOT invent a logo
 * before identity is confirmed — see /public/assets/logos/USDG.svg
 * for the neutral fallback that ships in the meantime.
 */

export type AssetKind = "stock-token" | "crypto" | "stablecoin" | "unknown"

export interface AssetRegistryEntry {
  /** Canonical ticker symbol (uppercase). */
  symbol: string
  /** Display name. */
  name: string
  /** Resolution kind — used by future modules (e.g. Markets tabs). */
  kind: AssetKind
  /** Local asset path, e.g. /assets/logos/AAPL.svg */
  logoUrl?: string
  /**
   * Unresolved = identity not yet verified in this project. The
   * UI surfaces `data-unresolved="true"` so the next phase can
   * replace the neutral fallback with a verified logo.
   */
  unresolved?: boolean
}

/**
 * The authoritative in-repo registry. Keep it small + explicit. Future
 * RH-Chain Stock Tokens should be hydrated into this shape from the
 * Robinhood-provided asset metadata endpoint without changing this
 * file's shape contract.
 */
const REGISTRY: Record<string, AssetRegistryEntry> = {
  // Stock Tokens — logo files in /public/assets/logos/
  AAPL: { symbol: "AAPL", name: "Apple",    kind: "stock-token", logoUrl: "/assets/logos/AAPL.png" },
  TSLA: { symbol: "TSLA", name: "Tesla",    kind: "stock-token", logoUrl: "/assets/logos/TSLA.png" },
  NVDA: { symbol: "NVDA", name: "NVIDIA",  kind: "stock-token", logoUrl: "/assets/logos/NVDA.png" },
  SPCX: { symbol: "SPCX", name: "SpaceX",   kind: "stock-token", logoUrl: "/assets/logos/SPCX.png" },
  GOOGL:{ symbol: "GOOGL", name: "Alphabet", kind: "stock-token", logoUrl: "/assets/logos/GOOGL.png" },
  AMZN: { symbol: "AMZN", name: "Amazon",    kind: "stock-token", logoUrl: "/assets/logos/AMZN.png" },
  MSFT: { symbol: "MSFT", name: "Microsoft", kind: "stock-token", logoUrl: "/assets/logos/MSFT.png" },
  META: { symbol: "META", name: "Meta",      kind: "stock-token", logoUrl: "/assets/logos/META.png" },

  // Crypto
  ETH:  { symbol: "ETH",  name: "Ethereum",    kind: "crypto",      logoUrl: "/assets/logos/ETH.svg" },

  // Stablecoins
  //
  // USDG identity is unresolved — multiple issuers use this ticker
  // and the ZEKS repo does not pin a specific contract / metadata
  // source. Until verified, we render a neutral fallback.
  USDG: { symbol: "USDG", name: "USDG",        kind: "stablecoin", logoUrl: "/assets/logos/USDG.svg", unresolved: true },
}

/**
 * Resolve a ticker symbol to a registry entry. Unknown tickers
 * return a synthetic entry so callers can still display a ticker-
 * initial fallback via the AssetLogo component.
 */
export function resolveAsset(symbol: string): AssetRegistryEntry {
  const key = String(symbol ?? "").trim().toUpperCase()
  const found = REGISTRY[key]
  if (found) return found
  return {
    symbol: key || "?",
    name: key || "Unknown",
    kind: "unknown",
    logoUrl: undefined,
    unresolved: true,
  }
}

/** True if a symbol's identity is not verified in the registry. */
export function isUnresolvedSymbol(symbol: string): boolean {
  const key = String(symbol ?? "").trim().toUpperCase()
  return Boolean(REGISTRY[key]?.unresolved)
}

/** Known registered tickers — used for tests and future listings. */
export function knownSymbols(): string[] {
  return Object.keys(REGISTRY)
}

/**
 * Slot a new entry into the registry at runtime. Used by the future
 * Robinhood-Chain Stock-Token hydration phase; the entry shape
 * matches `AssetRegistryEntry` and AssetLogo will pick up the
 * `logoUrl` whether it's a local path OR a remote URL.
 */
export function registerAsset(entry: AssetRegistryEntry): void {
  REGISTRY[entry.symbol.toUpperCase()] = entry
}
