/**
 * ZEKS Markets — raw → normalized pure normalizers
 *
 * Everything that turns upstream Robinhood responses into our
 * internal `MarketAsset` / `MarketQuote` shapes lives here.
 *
 * Validation strategy (spec §30):
 *
 *   - Treat external API data as UNTRUSTED input.
 *   - Validate expected shapes before rendering.
 *   - Bad / missing fields become null or filtered, never thrown.
 *   - 0x-address format is verified with a tight regex.
 *   - Numeric fields are parsed with `Number()` only when they pass
 *     a finite-number sanity check; otherwise we return null.
 *   - URLs are restricted to https.
 *
 * No I/O. No fetch. Pure functions only — easy to unit test, easy
 * to swap providers.
 */

import {
  ROBINHOOD_CHAIN_ID,
  type AssetLifecycleStatus,
  type MarketAsset,
  type MarketQuote,
  type TradingCapability,
} from "./types"
import { normalizeDisplayName } from "./display-name"

const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

function isHexAddress(value: unknown): value is string {
  return typeof value === "string" && HEX_ADDRESS_RE.test(value)
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Decide whether an upstream `logoUrl` should be propagated to the UI
 * as an asset-specific logo, or treated as a generic upstream
 * placeholder and discarded.
 *
 * AUDIT FINDING (Phase 1 visual audit):
 *
 *   For Robinhood Chain (chainId 4663) Stock Tokens, the upstream
 *   `/rhj/assets` endpoint returns a `logoUrl` that points at
 *   `https://cdn.robinhood.com/ncw_assets/logos/{contractAddress}.png`.
 *
 *   A spot-check of AAPL / NVDA / MSFT / META / CRM / TSLA / AMZN / GOOGL
 *   showed that EVERY one of those URLs returns the SAME 4058-byte
 *   PNG — a generic "Robinhood Chain Token" mark (chevron-up logo).
 *   In other words the URL changes per asset, but the rendered image
 *   is the same upstream placeholder for every row.
 *
 *   If we render that placeholder for every asset, the Markets table
 *   shows the same lime Robinhood-style icon for AAPL, MSFT, CRM, …
 *   which is misleading (looks like an official corporate logo) and
 *   not what ZEKS ships.
 *
 * RULE (this function):
 *
 *   For Robinhood-Chain assets specifically, ANY `logoUrl` hosted on
 *   `cdn.robinhood.com/ncw_assets/logos/` is treated as the generic
 *   upstream placeholder and discarded. The UI then falls through to
 *   the local ZEKS AssetRegistry entries (per-symbol local SVGs in
 *   /public/assets/logos/) and finally to the deterministic
 *   ticker-initial fallback.
 *
 *   Any other https `logoUrl` (a per-asset official logo from a
 *   different host) IS preserved and surfaced as `logoUrl`.
 *
 *   This is a SEMANTIC classification (per the audited upstream
 *   behavior), not a hash-based rule, so it stays robust even if
 *   upstream changes the image bytes.
 */
function shouldKeepLogoUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  if (!isHttpsUrl(raw)) return false
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    // Robinhood Chain Stock Token generic placeholder host/path.
    // All audited rows hit this exact path. Discarded.
    if (host === "cdn.robinhood.com" && path.startsWith("/ncw_assets/logos/")) {
      return false
    }
    // Any other https logo URL is treated as asset-specific.
    return true
  } catch {
    return false
  }
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeTradingCapability(raw: unknown): TradingCapability {
  if (typeof raw !== "string") return "unknown"
  if (raw === "TRADING_STATUS_TRADABLE") return "tradable"
  if (raw === "TRADING_STATUS_NON_TRADABLE") return "non-tradable"
  if (raw === "TRADING_STATUS_HALTED") return "non-tradable"
  return "unknown"
}

function normalizeStatus(raw: unknown): AssetLifecycleStatus {
  if (raw === "ASSET_STATUS_ACTIVE") return "active"
  if (raw === "ASSET_STATUS_HALTED") return "halted"
  if (raw === "ASSET_STATUS_DELISTED") return "delisted"
  return "unknown"
}

/**
 * Normalize one raw asset record from `/rhj/assets`.
 *
 * Returns `null` when the record is unsuitable for our Markets surface:
 *
 *   - missing / malformed symbol
 *   - no deployment on Robinhood Chain (chainId === 4663)
 *   - asset status not "active"
 *   - deployment lacks a valid 0x address
 *
 * Callers should `filter(Boolean)` the array.
 */
export function normalizeAsset(raw: unknown): MarketAsset | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const symbol =
    typeof r.tokenSymbol === "string" ? r.tokenSymbol.trim().toUpperCase() : ""
  if (!symbol) return null

  const tokenNameRaw =
    typeof r.tokenName === "string" ? r.tokenName : symbol

  const deploymentsRaw = Array.isArray(r.deployments) ? r.deployments : []
  // Find the deployment on Robinhood Chain (chainId === 4663).
  const rhc = deploymentsRaw.find((d) => {
    if (!d || typeof d !== "object") return false
    const dd = d as Record<string, unknown>
    return Number(dd.chainId) === ROBINHOOD_CHAIN_ID
  }) as Record<string, unknown> | undefined
  if (!rhc) return null

  if (!isHexAddress(rhc.contractAddress)) return null

  const status = normalizeStatus(r.status)
  // Spec §01: only ACTIVE assets are part of the market universe.
  if (status !== "active") return null

  const tcRaw =
    r.tradingCapabilities && typeof r.tradingCapabilities === "object"
      ? (r.tradingCapabilities as Record<string, unknown>)
      : null
  const marketCap = tcRaw?.market
  const marketObj =
    marketCap && typeof marketCap === "object"
      ? (marketCap as Record<string, unknown>)
      : null

  // Use the upstream `logoUrl` only when it is BOTH an https URL
// AND not the known generic upstream placeholder (see shouldKeepLogoUrl).
// Otherwise fall back to `null` so the UI renders the local ZEKS
// AssetRegistry SVG or the deterministic ticker-initial fallback.
const logoUrl: string | null = shouldKeepLogoUrl(r.logoUrl)
  ? (r.logoUrl as string)
  : null

  return {
    id: typeof r.id === "string" ? r.id : symbol,
    symbol,
    tokenNameRaw,
    displayName: normalizeDisplayName(tokenNameRaw, symbol),
    logoUrl,
    contractAddress: rhc.contractAddress,
    chainId: ROBINHOOD_CHAIN_ID,
    status,
    tradingWhole: normalizeTradingCapability(marketObj?.whole),
    tradingFractional: normalizeTradingCapability(marketObj?.fractional),
    currentMultiplier: safeNumber(r.currentMultiplier),
    tokenDecimals:
      typeof r.tokenDecimals === "number" ? r.tokenDecimals : null,
  }
}

/**
 * Normalize one quote element from `/rhj/prices/{symbol}`.
 *
 * Returns `null` if the quote is structurally unusable. The
 * `isTradingHalt` and `bid/ask` are independent: a halted quote may
 * still carry valid bid / ask, and we surface that.
 */
export function normalizeQuote(raw: unknown): MarketQuote | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const symbol =
    typeof r.tokenSymbol === "string" ? r.tokenSymbol.trim().toUpperCase() : ""
  if (!symbol) return null

  const bid = safeNumber(r.bid)
  const ask = safeNumber(r.ask)

  let referencePrice: number | null = null
  if (bid !== null && ask !== null) {
    referencePrice = (bid + ask) / 2
  } else if (bid !== null) {
    referencePrice = bid
  } else if (ask !== null) {
    referencePrice = ask
  }

  const dailyTradingVolume = safeNumber(r.dailyTradingVolume)
  const isTradingHalt = r.isTradingHalt === true

  const generatedAt =
    typeof r.generatedAt === "string" &&
    // Loose ISO sanity check — we don't try to fully parse here.
    /^\d{4}-\d{2}-\d{2}T/.test(r.generatedAt)
      ? r.generatedAt
      : null

  const currency = typeof r.currency === "string" ? r.currency : null

  // Attempt to extract previous close for 24h change derivation.
  // Try common upstream field names; fall back to null if absent.
  const previousClose =
    safeNumber(
      r.previousClose ?? r.previous_close ?? r.adjusted_close ?? r.close,
    )

  return {
    symbol,
    bid,
    ask,
    referencePrice,
    currency,
    dailyTradingVolume,
    isTradingHalt,
    generatedAt,
    previousClose,
    source: "robinhood-prices",
  }
}
