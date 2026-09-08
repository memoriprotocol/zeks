/**
 * ZEKS Markets — Chainlink Oracle Service
 *
 * Reads the latest onchain price from Chainlink oracle feeds on
 * Robinhood Chain (chainId 4663) using `eth_call` to the
 * AggregatorV3Interface proxy address.
 *
 *   RPC:        https://rpc.mainnet.chain.robinhood.com  (public, no auth)
 *   ABI call:   latestRoundData()  →  (roundId, answer, startedAt, updatedAt, answeredInRound)
 *   Selector:   0xfeaf968c
 *   Decimals:  8 (divide raw value by 1e8 to get USD price)
 *
 * Sources:
 *   - Feed addresses:  chainlink-feeds.ts  (from Chainlink reference-data-directory)
 *   - RPC:             Robinhood public RPC
 *   - Price data:      live onchain (confirmed real for all ZEKS symbols)
 *
 * Never fabricate prices. When the RPC fails or the feed is unavailable,
 * returns null for the price and does NOT fall back to Robinhood REST.
 */

import {
  resolveChainlinkFeed,
  type ChainlinkFeed,
  LATEST_ROUND_DATA_SELECTOR,
} from "./chainlink-feeds"

export const ROBINHOOD_RPC_URL =
  "https://rpc.mainnet.chain.robinhood.com"

export interface OracleReading {
  symbol: string
  /** Onchain USD price from the Chainlink aggregator. */
  price: number | null
  /** Chainlink feed that produced this reading. */
  feed: ChainlinkFeed | null
  /** ISO timestamp of the onchain round update. */
  updatedAt: string | null
  /**
   * Whether the reading was sourced from Chainlink onchain data.
   * When false, the oracle fell back to null.
   */
  isLive: boolean
  /** Error context if the read failed. */
  errorMessage: string | null
}

/**
 * Read the latest onchain price for one symbol from its Chainlink
 * feed on Robinhood Chain.
 *
 * Returns `OracleReading` where `price` is null and `isLive` is false
 * if the RPC call fails. Does NOT fall back to Robinhood REST prices —
 * those are a separate `referenceMarket` field in the data model.
 */
export async function readOraclePrice(
  symbol: string,
  options: { rpcUrl?: string; timeoutMs?: number; debug?: boolean } = {},
): Promise<OracleReading> {
  const { rpcUrl = ROBINHOOD_RPC_URL, timeoutMs = 5_000, debug = false } = options
  const upper = symbol.toUpperCase()

  const feed = await resolveChainlinkFeed(upper, { debug })
  if (!feed) {
    if (debug) {
      console.warn(`[oracle] no Chainlink feed for ${upper}`)
    }
    return {
      symbol: upper,
      price: null,
      feed: null,
      updatedAt: null,
      isLive: false,
      errorMessage: "No Chainlink feed registered for this symbol.",
    }
  }

  let result: OracleReading
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: feed.proxyAddress, data: LATEST_ROUND_DATA_SELECTOR }, "latest"],
        id: 1,
      }),
      signal: controller.signal,
    })
    clearTimeout(t)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const j = (await res.json()) as { result?: string; error?: { message?: string } }
    if (j.error) {
      throw new Error(j.error.message ?? "RPC error")
    }
    if (!j.result) {
      throw new Error("Empty result")
    }

    const raw = j.result as string
    if (raw === "0x" || raw === "0x0") {
      throw new Error("Zero result from aggregator")
    }

    const stripped = raw.startsWith("0x") ? raw.slice(2) : raw
    // answer: offset 64, 32 bytes
    const answer = BigInt("0x" + stripped.slice(64, 128))
    // updatedAt: offset 192, 32 bytes
    const updatedAtRaw = BigInt("0x" + stripped.slice(192, 256))

    const price = Number(answer) / Number(feed.multiply)
    const updatedAt =
      updatedAtRaw > BigInt(0)
        ? new Date(Number(updatedAtRaw) * 1000).toISOString()
        : null

    result = {
      symbol: upper,
      price,
      feed,
      updatedAt,
      isLive: true,
      errorMessage: null,
    }
  } catch (err) {
    if (debug) {
      console.warn(
        `[oracle] failed to read ${upper} from ${feed.proxyAddress}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    result = {
      symbol: upper,
      price: null,
      feed,
      updatedAt: null,
      isLive: false,
      errorMessage:
        err instanceof Error ? err.message : "Oracle read failed",
    }
  }

  return result
}

/**
 * Batch-read oracle prices for multiple symbols. Reads are issued
 * concurrently; the overall batch is bounded by `concurrency`.
 */
export async function readOraclePrices(
  symbols: readonly string[],
  options: { concurrency?: number; rpcUrl?: string; timeoutMs?: number; debug?: boolean } = {},
): Promise<Map<string, OracleReading>> {
  const { concurrency = 4, timeoutMs = 5_000, debug = false } = options

  const run = async <T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const total = items.length
    const lanes = Math.min(limit, total)
    await Promise.all(
      Array.from({ length: lanes }, async () => {
        while (cursor < total) {
          const idx = cursor++
          results[idx] = await fn(items[idx])
        }
      }),
    )
    return results
  }

  const symbolsArr: string[] = Array.from(symbols)
  const readings: OracleReading[] = await run(symbolsArr, concurrency, (sym) =>
    readOraclePrice(sym, { timeoutMs, debug }),
  )

  const map = new Map<string, OracleReading>()
  for (let i = 0; i < symbolsArr.length; i++) {
    map.set(symbolsArr[i].toUpperCase(), readings[i])
  }
  return map
}
