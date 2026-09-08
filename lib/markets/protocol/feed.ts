/**
 * ZEKS Markets — Protocol-wide vault activity feed.
 *
 * Server-side `eth_getLogs` over the verified Loopr vaults on
 * Robinhood Chain. Read-only. No signing, no popup.
 *
 *   · Scans the last ~50,000 blocks per poll.
 *   · Subscribes to the ERC-20 `Transfer(address,address,uint256)`
 *     topic on each verified vault.
 *   · Classifies:
 *        from == 0x0              → IN
 *        to   == 0x0              → OUT
 *        otherwise                → TRANSFER
 *   · Resolves the receiving/wallet address to short label only
 *     (we do not persist or fetch ENS).
 *   · Resolves timestamp via `eth_getBlockByNumber` for each
 *     distinct block, cached per poll.
 *
 * Returns a sorted (newest-first), deduped (txHash,logIndex) list
 * capped at `limit` entries. The caller never sees raw RPC shapes.
 */

import {
  ERC20_TRANSFER_TOPIC,
  PROTOCOL_FEED_BLOCK_WINDOW,
  PROTOCOL_FEED_CHAIN_ID,
  VERIFIED_LOOPR_VAULTS,
  type VerifiedVault,
} from "@/lib/markets/protocol/verified-vaults"
import {
  ROBINHOOD_PUBLIC_RPC_URL,
  parseUint256,
} from "@/lib/markets/onchain/rpc"

export type ProtocolFeedKind = "in" | "out" | "transfer"

export interface ProtocolFeedEvent {
  /** Stable identifier `"<txHash>-<logIndex>"`. */
  id: string
  txHash: `0x${string}`
  logIndex: number
  blockNumber: number
  /** Unix epoch seconds (UTC). null when block lookup failed. */
  timestamp: number | null
  /** ERC-20 share-token address. */
  vault: `0x${string}`
  /** Display venue label. */
  venue: VerifiedVault["venue"]
  /** Display label (e.g. "Steakhouse USDG"). */
  label: string
  /** Transfer direction from the vault-protocol's perspective. */
  kind: ProtocolFeedKind
  /** Sender (`from`) in the Transfer. */
  from: `0x${string}`
  /** Recipient (`to`) in the Transfer. */
  to: `0x${string}`
  /** Raw token amount as a decimal string, e.g. "1234.560000". */
  amountRaw: bigint
  /** Formatted USDG string (used verbatim in UI). */
  amountUsdg: string
  /** Vault-decimals count (always 18 today). */
  decimals: number
}

export interface ProtocolFeedResult {
  /** Newest first. Capped at `limit`. */
  events: ProtocolFeedEvent[]
  /** Block number at which the scan was anchored. */
  scannedHead: number | null
  /** ISO timestamp the scan was issued at. */
  fetchedAt: string
  /** Human-readable error from the upstream RPC. null on success. */
  errorMessage: string | null
  /** Whether the upstream returned an error (events may be partial). */
  partial: boolean
  /** Block range that was scanned. */
  fromBlock: number | null
  toBlock: number | null
  /** Vaults actually polled (after filtering). */
  vaults: VerifiedVault[]
}

interface RpcResponse<T> {
  jsonrpc?: string
  id?: number
  result?: T
  error?: { code?: number; message?: string }
}

const ZERO = "0x0000000000000000000000000000000000000000" as const

/** Default cap to keep payloads small. */
const DEFAULT_LIMIT = 60
/** Default per-call timeout. */
const DEFAULT_TIMEOUT_MS = 6_000
/** Each vault's getLogs may take its own time. */
const PER_VAULT_TIMEOUT_MS = 5_000

async function rpcCall<T>(
  body: unknown,
  timeoutMs: number,
): Promise<RpcResponse<T>> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(ROBINHOOD_PUBLIC_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      return {
        error: { message: `HTTP ${res.status}` },
      }
    }
    return (await res.json()) as RpcResponse<T>
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    }
  } finally {
    clearTimeout(t)
  }
}

interface DecodedTransferLog {
  address: `0x${string}`
  blockNumber: number
  transactionHash: `0x${string}`
  logIndex: number
  from: `0x${string}`
  to: `0x${string}`
  valueRaw: bigint
}

function bigIntPow10(decimals: number): bigint {
  let v = BigInt(1)
  for (let i = 0; i < decimals; i++) v *= BigInt(10)
  return v
}

function hexToDecBigInt(hex: string | null | undefined): bigint {
  if (!hex || hex === "0x" || hex === "0x0") return BigInt(0)
  return BigInt(hex)
}

function pad32(addr: string): `0x${string}` {
  const lower = addr.toLowerCase()
  if (lower.startsWith("0x")) return ("0x" + lower.slice(2).padStart(64, "0")) as `0x${string}`
  return ("0x" + lower.padStart(64, "0")) as `0x${string}`
}

function classify(from: string, to: string): ProtocolFeedKind {
  if (from.toLowerCase() === ZERO) return "in"
  if (to.toLowerCase() === ZERO) return "out"
  return "transfer"
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === BigInt(0)) return "0"
  if (decimals === 0) return raw.toString()
  const base = bigIntPow10(decimals)
  const whole = raw / base
  const frac = raw % base
  if (whole === BigInt(0)) {
    // very small amounts → show fraction only
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
    return fracStr ? `0.${fracStr}` : "0"
  }
  const fracStr = frac.toString().padStart(decimals, "0")
  // Trim trailing zeros on the fractional part for readability.
  const trimmed = fracStr.replace(/0+$/, "")
  return trimmed.length > 0 ? `${whole.toString()}.${trimmed}` : whole.toString()
}

/**
 * Fetch the protocol-wide activity feed.
 *
 * @param options.vaults        Subset of `VERIFIED_LOOPR_VAULTS` to scan.
 *                              Defaults to all verified vaults.
 * @param options.limit         Maximum number of events to return.
 *                              Defaults to 60.
 * @param options.blockWindow   Number of trailing blocks to scan.
 *                              Defaults to 50_000.
 * @param options.timeoutMs     Overall timeout (per-vault sub-timeout
 *                              is capped at 5s).
 */
export async function fetchProtocolFeed(
  options: {
    vaults?: VerifiedVault[]
    limit?: number
    blockWindow?: number
    timeoutMs?: number
  } = {},
): Promise<ProtocolFeedResult> {
  const fetchedAt = new Date().toISOString()
  const vaults =
    options.vaults && options.vaults.length > 0
      ? options.vaults
      : (VERIFIED_LOOPR_VAULTS as readonly VerifiedVault[]).slice()
  const limit = options.limit ?? DEFAULT_LIMIT
  const window = options.blockWindow ?? PROTOCOL_FEED_BLOCK_WINDOW
  const overallTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Anchored head read.
  const headRes = await Promise.race([
    rpcCall<`0x${string}`>(
      {
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      },
      4_000,
    ),
    new Promise<RpcResponse<`0x${string}`>>((resolve) =>
      setTimeout(
        () => resolve({ error: { message: "head-timeout" } }),
        Math.min(4_000, overallTimeoutMs),
      ),
    ),
  ])

  let scannedHead: number | null = null
  let fromBlock: number | null = null
  let toBlock: number | null = null
  if ("result" in headRes && typeof headRes.result === "string") {
    const n = Number(hexToDecBigInt(headRes.result))
    scannedHead = Number.isFinite(n) ? n : null
  }
  if (scannedHead != null) {
    fromBlock = Math.max(0, scannedHead - window)
    toBlock = scannedHead
  }

  // Per-vault getLogs (single anchored round).
  const logPromises = vaults.map((v) =>
    rpcCall<DecodedTransferLog[]>(
      {
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [
          {
            fromBlock:
              fromBlock != null ? `0x${fromBlock.toString(16)}` : "earliest",
            toBlock:
              toBlock != null ? `0x${toBlock.toString(16)}` : "latest",
            address: v.address,
            topics: [ERC20_TRANSFER_TOPIC],
          },
        ],
        id: 2,
      },
      PER_VAULT_TIMEOUT_MS,
    ).then((res) => ({ vault: v, res })),
  )

  const logResults = await Promise.all(logPromises)

  const errorMessages: string[] = []
  const allLogs: Array<{ vault: VerifiedVault; log: DecodedTransferLog }> = []

  for (const { vault, res } of logResults) {
    if (res.error) {
      errorMessages.push(`${vault.label}: ${res.error.message ?? "RPC error"}`)
      continue
    }
    if (!Array.isArray(res.result)) continue
    for (const raw of res.result) {
      if (!raw) continue
      const log = decodeLog(raw, vault)
      if (log) allLogs.push({ vault, log })
    }
  }

  // Dedupe by (txHash, logIndex) across vaults — never trust a single
  // source blindly when duplicates can occur.
  const seen = new Map<string, { vault: VerifiedVault; log: DecodedTransferLog }>()
  for (const item of allLogs) {
    const key = `${item.log.transactionHash.toLowerCase()}-${item.log.logIndex}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, item)
      continue
    }
    // Prefer the most-precise vault (first in registration order).
    if (
      vaults.indexOf(item.vault) < vaults.indexOf(existing.vault)
    ) {
      seen.set(key, item)
    }
  }

  const deduped = Array.from(seen.values())

  // Sort newest-first by block number, then logIndex.
  deduped.sort((a, b) => {
    if (a.log.blockNumber !== b.log.blockNumber) {
      return b.log.blockNumber - a.log.blockNumber
    }
    return b.log.logIndex - a.log.logIndex
  })

  const top = deduped.slice(0, limit)

  // Block timestamp lookup (per distinct block).
  const tsCache = new Map<number, number | null>()
  const events: ProtocolFeedEvent[] = []
  for (const { vault, log } of top) {
    let ts: number | null = null
    if (!tsCache.has(log.blockNumber)) {
      tsCache.set(log.blockNumber, null)
    }
    ts = tsCache.get(log.blockNumber) ?? null
    if (ts == null) {
      const tsRes = await rpcCall<{ timestamp: `0x${string}` } | null>(
        {
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [`0x${log.blockNumber.toString(16)}`, false],
          id: 3,
        },
        PER_VAULT_TIMEOUT_MS,
      )
      if (tsRes && "result" in tsRes && tsRes.result && typeof tsRes.result.timestamp === "string") {
        ts = Number(hexToDecBigInt(tsRes.result.timestamp))
        tsCache.set(log.blockNumber, ts)
      }
    }
    events.push({
      id: `${log.transactionHash.toLowerCase()}-${log.logIndex}`,
      txHash: log.transactionHash as `0x${string}`,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      timestamp: ts,
      vault: vault.address as `0x${string}`,
      venue: vault.venue,
      label: vault.label,
      kind: classify(log.from, log.to),
      from: log.from as `0x${string}`,
      to: log.to as `0x${string}`,
      amountRaw: log.valueRaw,
      amountUsdg: formatTokenAmount(log.valueRaw, vault.decimals),
      decimals: vault.decimals,
    })
  }

  const partial = errorMessages.length > 0 && events.length > 0
  const errorMessage =
    errorMessages.length > 0 ? errorMessages.join("; ") : null

  return {
    events,
    scannedHead,
    fetchedAt,
    errorMessage,
    partial,
    fromBlock,
    toBlock,
    vaults,
  }
}

function decodeLog(
  raw: unknown,
  vault: VerifiedVault,
): DecodedTransferLog | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const address =
    typeof r.address === "string"
      ? (r.address as `0x${string}`)
      : null
  const blockHex =
    typeof r.blockNumber === "string"
      ? (r.blockNumber as `0x${string}`)
      : null
  const txHash =
    typeof r.transactionHash === "string"
      ? (r.transactionHash as `0x${string}`)
      : null
  const data =
    typeof r.data === "string" ? (r.data as `0x${string}`) : null
  const topics = Array.isArray(r.topics)
    ? (r.topics as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : []

  if (
    !address ||
    !blockHex ||
    !txHash ||
    !data ||
    topics.length < 3
  )
    return null

  if (typeof r.logIndex !== "string" && typeof r.logIndex !== "number")
    return null
  const logIndex =
    typeof r.logIndex === "string"
      ? parseInt(r.logIndex, 16)
      : Number(r.logIndex)
  if (!Number.isFinite(logIndex) || logIndex < 0) return null

  // topics[0] = event signature (Transfer)
  // topics[1] = from (indexed)
  // topics[2] = to   (indexed)
  // data   = value (uint256)
  const fromTopic = topics[1] as string
  const toTopic = topics[2] as string
  const fromAddr =
    fromTopic.slice(0, 2) + (fromTopic.length > 42 ? fromTopic.slice(-40) : fromTopic.slice(2))
  const toAddr =
    toTopic.slice(0, 2) + (toTopic.length > 42 ? toTopic.slice(-40) : toTopic.slice(2))

  // `parseUint256` is the project's canonical extractor — reuse it.
  const valueRaw = parseUint256(data as `0x${string}`, 0)

  return {
    address,
    blockNumber: Number(hexToDecBigInt(blockHex)),
    transactionHash: txHash,
    logIndex,
    from: fromAddr as `0x${string}`,
    to: toAddr as `0x${string}`,
    valueRaw,
  }
}

/**
 * Convenience: returns just the protocol-feed for the dashboard.
 * Server-rendered (no React state).
 */
export const PROTOCOL_FEED_CHAIN = PROTOCOL_FEED_CHAIN_ID
