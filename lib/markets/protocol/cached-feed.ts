/**
 * ZEKS Markets — Cached, request-coalesced activity feed.
 *
 * Wraps `fetchProtocolFeed` from `./feed` with:
 *
 *   · Module-level in-memory cache (TTL 10s).
 *   · In-flight promise dedupe — concurrent callers share one upstream scan.
 *   · Incremental scanning — only the *trailing* ~1,000 blocks are
 *     re-fetched on warm refresh; cold refresh does the full
 *     50,000-block scan.
 *
 * This file is SERVER-ONLY. The browser never imports it.
 */

import {
  fetchProtocolFeed,
  type ProtocolFeedResult,
} from "@/lib/markets/protocol/feed"

const CACHE_TTL_MS = 10_000
const TRAILING_BLOCKS = 1_000 // warm-window on top of the cached head

interface CacheEntry {
  result: ProtocolFeedResult
  /** Epoch ms when the cached result was fetched. */
  fetchedAtMs: number
  /** Block number the scan was anchored to. */
  head: number | null
}

let cache: CacheEntry | null = null
let inflight: Promise<ProtocolFeedResult> | null = null

function isFresh(entry: CacheEntry, now: number): boolean {
  if (!Number.isFinite(entry.fetchedAtMs)) return false
  return now - entry.fetchedAtMs < CACHE_TTL_MS
}

/**
 * Returns a recent ProtocolFeedResult.
 *
 *   · If a fresh cached result exists (TTL ≤ 10s) → return it.
 *   · Otherwise → kick off an upstream scan. While one scan is in
 *     flight, all concurrent callers receive the SAME promise.
 *   · On warm refresh (cached head present), fetch only the trailing
 *     ~1,000 blocks and merge with the cached events.
 */
export async function getCachedProtocolFeed(): Promise<ProtocolFeedResult> {
  const now = Date.now()

  if (cache && isFresh(cache, now)) {
    return cache.result
  }
  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    try {
      const cold = cache == null
      const head = cache?.head ?? null

      let scanWindow: number
      if (cold || head == null) {
        scanWindow = 50_000
      } else {
        // Warm: only the trailing window on top of the cached head.
        scanWindow = TRAILING_BLOCKS
      }

      const fetched = await fetchProtocolFeed({
        limit: 60,
        blockWindow: scanWindow,
        timeoutMs: 6_000,
      })

      let merged: ProtocolFeedResult
      if (cold || cache == null) {
        merged = fetched
      } else {
        merged = mergeProtocolFeedResults(cache.result, fetched)
      }

      const newHead =
        fetched.scannedHead ??
        (cache ? cache.head : null) ??
        merged.scannedHead

      cache = {
        result: merged,
        fetchedAtMs: Date.now(),
        head: newHead,
      }
      return merged
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Merge a fresh `incoming` scan on top of the existing `existing`
 * result, deduplicating by `(txHash, logIndex)`. Newest wins on
 * classification. Newest-first ordering is preserved.
 */
function mergeProtocolFeedResults(
  existing: ProtocolFeedResult,
  incoming: ProtocolFeedResult,
): ProtocolFeedResult {
  const seen = new Map<string, ProtocolFeedResult["events"][number]>()

  for (const e of existing.events) seen.set(e.id, e)
  for (const e of incoming.events) seen.set(e.id, e)

  const events = Array.from(seen.values()).sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber
    return b.logIndex - a.logIndex
  })

  // Take the larger head.
  let scannedHead = existing.scannedHead
  if (
    incoming.scannedHead != null &&
    (scannedHead == null || incoming.scannedHead > scannedHead)
  ) {
    scannedHead = incoming.scannedHead
  }

  // Aggregate error / partial: keep the more informative of the two.
  const partial =
    (existing.partial && incoming.events.length > 0) ||
    (incoming.partial && events.length > 0) ||
    (incoming.partial && existing.partial)
  const errorMessage =
    incoming.errorMessage ?? existing.errorMessage ?? null

  return {
    events: events.slice(0, 60),
    scannedHead,
    fetchedAt: incoming.fetchedAt,
    errorMessage,
    partial,
    fromBlock:
      incoming.fromBlock != null
        ? Math.min(existing.fromBlock ?? incoming.fromBlock, incoming.fromBlock)
        : existing.fromBlock,
    toBlock:
      scannedHead ??
      incoming.toBlock ??
      existing.toBlock ??
      null,
    vaults: incoming.vaults.length > 0 ? incoming.vaults : existing.vaults,
  }
}

/** Test-only / observability — clear cache. */
export function _resetProtocolFeedCache(): void {
  cache = null
  inflight = null
}

/** Returns `true` if a recent cached entry exists. */
export function _hasFreshProtocolFeedCache(): boolean {
  return cache != null && isFresh(cache, Date.now())
}
