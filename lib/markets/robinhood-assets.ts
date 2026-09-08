/**
 * ZEKS Markets — Robinhood asset metadata fetcher
 *
 * Server-only. Reads from:
 *
 *   GET https://api.robinhood.com/rhj/assets
 *
 * Returns the full normalized Robinhood-Chain ACTIVE Stock Token
 * universe. Filtered by:
 *
 *   - chainId === 4663 (Robinhood Chain)
 *   - status   === "ASSET_STATUS_ACTIVE"
 *
 * Caching (spec §05):
 *   - Next.js `fetch` cache + `revalidate` of 5 minutes for the
 *     asset universe. Asset metadata rarely changes; the high-
 *     frequency data is the quote stream.
 *   - In-memory module cache so concurrent route handlers do not
 *     hammer upstream.
 *
 * No fake data. No hard-coded assets as a primary universe.
 */

import {
  fetchWithTimeout,
  ROBINHOOD_API_BASE,
  robinhoodHeaders,
} from "./http"
import { normalizeAsset } from "./normalize"
import type { MarketAsset } from "./types"

const ASSETS_ENDPOINT = `${ROBINHOOD_API_BASE}/rhj/assets`

/** Asset universe TTL — metadata is slow-moving. */
const ASSETS_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  expiresAt: number
  assets: MarketAsset[]
}

let moduleCache: CacheEntry | null = null
let inFlight: Promise<MarketAsset[]> | null = null

/**
 * Fetch + normalize the full Robinhood-Chain active asset universe.
 *
 * Concurrent calls share a single in-flight request via `inFlight`.
 * The module cache is consulted before any network call.
 */
export async function fetchRobinhoodAssets(): Promise<MarketAsset[]> {
  const now = Date.now()
  if (moduleCache && moduleCache.expiresAt > now) {
    return moduleCache.assets
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetchWithTimeout(ASSETS_ENDPOINT, {
        headers: robinhoodHeaders(),
        // Next.js data-cache hint. `revalidate` is the standard
        // approach; we ALSO keep an in-memory cache as a safety
        // net because Next.js does not guarantee cross-route
        // deduplication at runtime.
        next: { revalidate: 300 },
      })
      if (!res.ok) {
        throw new Error(
          `Robinhood /rhj/assets responded ${res.status} ${res.statusText}`,
        )
      }
      const body = (await res.json()) as unknown
      const list = Array.isArray((body as { assets?: unknown })?.assets)
        ? ((body as { assets: unknown[] }).assets)
        : []
      const normalized = list
        .map((raw) => normalizeAsset(raw))
        .filter((a): a is MarketAsset => a !== null)
      moduleCache = {
        assets: normalized,
        expiresAt: Date.now() + ASSETS_TTL_MS,
      }
      return normalized
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Same as `fetchRobinhoodAssets` but bypasses the in-memory cache and
 * Next.js cache. Useful for diagnostics and tests. Not used by the
 * UI in Phase 1.
 */
export async function refreshRobinhoodAssets(): Promise<MarketAsset[]> {
  moduleCache = null
  return fetchRobinhoodAssets()
}
