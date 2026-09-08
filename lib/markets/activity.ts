/**
 * ZEKS Markets — Read-only activity model.
 *
 * Pulls recent transactions for a wallet via the public Robinhood
 * Chain Blockscout explorer API. We deliberately do NOT scan onchain
 * logs locally because:
 *
 *   - The Morpho Blue contract on Robinhood Chain has zero bytecode
 *     (verified in the supply-flow audit). There is no canonical
 *     event log address to scan.
 *   - The wallet RPC may not index historical logs past a small
 *     window on this chain.
 *   - A full indexer is out of scope for this phase.
 *
 * The Blockscout API returns the canonical, chain-confirmed list of
 * transactions for a wallet — that is the most reliable read-only
 * surface available today.
 */

import type { Address } from "@/lib/wallet/types-common"
import { ROBINHOOD_BLOCKSCOUT_BASE } from "@/lib/wallet/robinhood-chain"

export interface ActivityItem {
  hash: string
  /** Block number (decimal). null when pending. */
  blockNumber: number | null
  /** ISO timestamp. */
  timestamp: string | null
  /** Direction of value flow from the wallet's perspective. */
  from: Address
  to: Address | null
  /** Wei value transferred (raw bigint). */
  valueRaw: bigint
  /** Whether the tx reverted on-chain. */
  reverted: boolean
  /** Gas used. null when not yet indexed. */
  gasUsed: number | null
}

export interface ActivityResult {
  items: ActivityItem[]
  fetchedAt: string
  /** True when the upstream returned an error; items may be partial. */
  partial: boolean
  errorMessage: string | null
  /** True when this chain does not surface a reliable activity feed. */
  unsupported: boolean
}

interface BlockscoutTx {
  hash: string
  block_number?: number | string | null
  from?: { hash?: string }
  to?: { hash?: string | null } | null
  value?: string | null
  timestamp?: string | null
  gas_used?: string | null
  has_error_in_internal_txs?: boolean
  method?: string | null
  result?: { status?: string } | string | null
}

interface BlockscoutResponse {
  message?: string
  result?: BlockscoutTx[] | string
}

const SUPPORTED_ACTIVITY_CHAINS = new Set<number>([4663])

/**
 * Fetch recent transactions for `wallet` on Robinhood Chain via the
 * Blockscout REST API. Returns at most 25 transactions.
 *
 * Limitations we surface explicitly:
 *
 *   - On chains without a reliable explorer API we mark the result
 *     `unsupported: true`. ZEKS is Robinhood Chain only, but the
 *     function is still safe to call from any wallet context.
 *
 *   - When the explorer returns an error or non-JSON, we surface
 *     `partial: true` with the raw message. The UI shows an info
 *     chip rather than fake rows.
 */
export async function fetchWalletActivity(
  wallet: Address,
  options: { chainId?: number; timeoutMs?: number } = {},
): Promise<ActivityResult> {
  const fetchedAt = new Date().toISOString()
  const chainId = options.chainId ?? 4663

  if (!SUPPORTED_ACTIVITY_CHAINS.has(chainId)) {
    return {
      items: [],
      fetchedAt,
      partial: false,
      errorMessage: null,
      unsupported: true,
    }
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), options.timeoutMs ?? 6_000)
  const url = `${ROBINHOOD_BLOCKSCOUT_BASE}/api?module=account&action=txlist&address=${wallet}&page=1&offset=25`
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(t)
    if (!res.ok) {
      return {
        items: [],
        fetchedAt,
        partial: true,
        errorMessage: `HTTP ${res.status}`,
        unsupported: false,
      }
    }
    const j = (await res.json()) as BlockscoutResponse
    if (j.message && j.message !== "OK") {
      return {
        items: [],
        fetchedAt,
        partial: true,
        errorMessage: j.message,
        unsupported: false,
      }
    }
    const raw = Array.isArray(j.result) ? j.result : []
    const items: ActivityItem[] = []
    for (const r of raw) {
      if (!r || typeof r.hash !== "string") continue
      const blockNumber =
        typeof r.block_number === "string"
          ? Number(r.block_number)
          : typeof r.block_number === "number"
            ? r.block_number
            : null
      items.push({
        hash: r.hash,
        blockNumber,
        timestamp: r.timestamp ?? null,
        from: (r.from?.hash ?? "0x0") as Address,
        to: (r.to?.hash ?? null) as Address | null,
        valueRaw: r.value ? BigInt(r.value) : BigInt(0),
        reverted: Boolean(r.has_error_in_internal_txs),
        gasUsed: r.gas_used ? Number(r.gas_used) : null,
      })
    }
    return {
      items,
      fetchedAt,
      partial: false,
      errorMessage: null,
      unsupported: false,
    }
  } catch (err) {
    clearTimeout(t)
    return {
      items: [],
      fetchedAt,
      partial: true,
      errorMessage: err instanceof Error ? err.message : String(err),
      unsupported: false,
    }
  }
}
