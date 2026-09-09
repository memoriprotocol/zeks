/**
 * ZEKS Markets — Tiny block-head cache for the dashboard.
 *
 * `eth_blockNumber` is the cheapest possible RPC call. We still
 * cache it for 2 seconds and dedupe in-flight requests, so even
 * with hundreds of dashboards open we issue at most one upstream
 * call every 2 seconds.
 *
 * Server-only — the browser must NEVER call Robinhood RPC directly.
 */

import { ROBINHOOD_PUBLIC_RPC_URL } from "@/lib/markets/onchain/rpc"

export interface ChainHead {
  /** Current head block number (hex-parsed). */
  head: number | null
  /** When the head was fetched (ISO). */
  fetchedAt: string
  /** Optional upstream error. */
  errorMessage: string | null
}

const CACHE_TTL_MS = 2_000

let cache: { value: ChainHead; fetchedAtMs: number } | null = null
let inflight: Promise<ChainHead> | null = null

async function rpcHead(timeoutMs: number): Promise<ChainHead> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(ROBINHOOD_PUBLIC_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      return {
        head: null,
        fetchedAt: new Date().toISOString(),
        errorMessage: `HTTP ${res.status}`,
      }
    }
    const j = (await res.json()) as {
      result?: string
      error?: { message?: string }
    }
    if (j.error) {
      return {
        head: null,
        fetchedAt: new Date().toISOString(),
        errorMessage: j.error.message ?? "RPC error",
      }
    }
    if (typeof j.result === "string") {
      try {
        const n = parseInt(j.result, 16)
        return {
          head: Number.isFinite(n) ? n : null,
          fetchedAt: new Date().toISOString(),
          errorMessage: null,
        }
      } catch {
        return {
          head: null,
          fetchedAt: new Date().toISOString(),
          errorMessage: "Bad hex",
        }
      }
    }
    return {
      head: null,
      fetchedAt: new Date().toISOString(),
      errorMessage: "Missing result",
    }
  } catch (err) {
    return {
      head: null,
      fetchedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Returns a fresh chain head, cached for 2 seconds. Concurrency
 * is deduped via the in-flight promise.
 */
export async function getCachedChainHead(): Promise<ChainHead> {
  const now = Date.now()
  if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.value
  }
  if (inflight) {
    return inflight
  }
  inflight = (async () => {
    try {
      const v = await rpcHead(2_500)
      cache = { value: v, fetchedAtMs: Date.now() }
      return v
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Test-only — clear cache. */
export function _resetChainHeadCache(): void {
  cache = null
  inflight = null
}
