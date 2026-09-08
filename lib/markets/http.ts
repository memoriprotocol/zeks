/**
 * ZEKS Markets — shared fetch configuration for Robinhood Stock
 * Token API access from the Next.js server.
 *
 * Centralized so:
 *
 *   1. Browser code never directly hits Robinhood endpoints (CORS,
 *      rate-limit, and config-exposure protection — spec §05).
 *   2. Every request carries a stable, polite User-Agent.
 *   3. Timeouts / retry behaviour are uniform across fetches.
 *   4. Future providers (Chainlink Data Streams, internal oracle)
 *      can plug in here without touching UI code.
 */

/** Base URL for Robinhood Stock Token read-only APIs. */
export const ROBINHOOD_API_BASE = "https://api.robinhood.com"

/** Polite browser-like User-Agent. Empty UA triggers 429 on /prices. */
export const ROBINHOOD_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

/** Default headers for any Robinhood API call. */
export function robinhoodHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": ROBINHOOD_USER_AGENT,
  }
}

/** Default fetch timeout (ms). Short enough to keep server responses snappy. */
export const ROBINHOOD_FETCH_TIMEOUT_MS = 8_000

/**
 * Fetch with timeout. Uses AbortController. We do NOT retry on 5xx
 * by default — Robinhood's read-only API is stable, and retries on
 * every component would amplify load. Callers decide.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = ROBINHOOD_FETCH_TIMEOUT_MS, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
