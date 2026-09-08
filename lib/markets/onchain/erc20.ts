/**
 * ZEKS Markets — ERC20 onchain reads.
 *
 * Read-only calls against the standard ERC20 interface:
 *
 *   balanceOf(address)   -> 0x70a08231
 *   allowance(owner, spender) -> 0xdd62ed3e
 *   decimals()           -> 0x313ce567
 *   symbol()             -> 0x95d89b41
 *   name()               -> 0x06fdde03
 *   totalSupply()        -> 0x18160ddd
 *
 * All numbers are returned as bigint (raw, undecoded). The UI / format
 * layer applies decimals to derive a human-readable string. We never
 * fabricate balances: every value comes from a successful eth_call.
 */

import { ethCall, parseUint256, parseShortString } from "./rpc"
import type { EIP1193Provider } from "@/lib/wallet/types"

const SELECTOR = {
  balanceOf: "0x70a08231" as const,
  allowance: "0xdd62ed3e" as const,
  decimals: "0x313ce567" as const,
  symbol: "0x95d89b41" as const,
  name: "0x06fdde03" as const,
  totalSupply: "0x18160ddd" as const,
}

/** Pads a 20-byte address to 32 bytes for ABI encoding. */
function padAddress(addr: string): string {
  const cleaned = addr.startsWith("0x") ? addr.slice(2) : addr
  if (cleaned.length !== 40) return cleaned.padStart(64, "0")
  return cleaned.padStart(64, "0")
}

function padUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0")
}

function encodeBalanceOf(holder: `0x${string}`): `0x${string}` {
  return `${SELECTOR.balanceOf}${padAddress(holder)}` as `0x${string}`
}

function encodeAllowance(
  owner: `0x${string}`,
  spender: `0x${string}`,
): `0x${string}` {
  return `${SELECTOR.allowance}${padAddress(owner)}${padAddress(
    spender,
  )}` as `0x${string}`
}

function encodeDecimals(): `0x${string}` {
  return SELECTOR.decimals
}

function encodeSymbol(): `0x${string}` {
  return SELECTOR.symbol
}

function encodeName(): `0x${string}` {
  return SELECTOR.name
}

function encodeTotalSupply(): `0x${string}` {
  return SELECTOR.totalSupply
}

export interface Erc20Info {
  symbol: string
  name: string
  decimals: number
  totalSupply: bigint
}

export interface Erc20UserPosition {
  /** Raw bigint balance, no decimals applied. */
  balance: bigint
  /** Raw bigint allowance to `spender`. `null` if not requested. */
  allowance: bigint | null
}

/** ERC20 metadata — symbol, name, decimals, totalSupply. */
export async function readErc20Info(
  token: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
) {
  const sym = await ethCall<string>(
    { to: token, data: encodeSymbol() },
    options,
  )
  if (sym.kind === "error") {
    return sym
  }
  const nam = await ethCall<string>(
    { to: token, data: encodeName() },
    options,
  )
  if (nam.kind === "error") {
    return nam
  }
  const decRes = await ethCall<string>(
    { to: token, data: encodeDecimals() },
    options,
  )
  if (decRes.kind === "error") {
    return decRes
  }
  const dec = Number(parseUint256(decRes.value, 0))
  if (!Number.isFinite(dec) || dec < 0 || dec > 255) {
    return {
      kind: "error" as const,
      error: { kind: "unsupported-token" as const, token },
    }
  }
  const tsRes = await ethCall<string>(
    { to: token, data: encodeTotalSupply() },
    options,
  )
  const totalSupply =
    tsRes.kind === "ok" ? parseUint256(tsRes.value, 0) : BigInt(0)

  const symbol = parseShortString(sym.value, 0)
  const name = parseShortString(nam.value, 0)
  if (!symbol) {
    return {
      kind: "error" as const,
      error: { kind: "unsupported-token" as const, token },
    }
  }

  return {
    kind: "ok" as const,
    value: {
      symbol,
      name,
      decimals: dec,
      totalSupply,
    } satisfies Erc20Info,
  }
}

/** ERC20 balance for one (holder, token). */
export async function readErc20Balance(
  token: `0x${string}`,
  holder: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
) {
  const res = await ethCall<string>(
    { to: token, data: encodeBalanceOf(holder) },
    options,
  )
  if (res.kind === "error") return res
  return {
    kind: "ok" as const,
    value: parseUint256(res.value, 0),
  }
}

/** ERC20 allowance for (owner → spender). */
export async function readErc20Allowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
) {
  const res = await ethCall<string>(
    { to: token, data: encodeAllowance(owner, spender) },
    options,
  )
  if (res.kind === "error") return res
  return {
    kind: "ok" as const,
    value: parseUint256(res.value, 0),
  }
}

/**
 * Combined read: balance + optional allowance. Used by the
 * preflight layer.
 */
export async function readErc20UserPosition(
  token: `0x${string}`,
  holder: `0x${string}`,
  options: {
    spender?: `0x${string}`
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
) {
  const balanceRes = await readErc20Balance(token, holder, options)
  if (balanceRes.kind === "error") {
    return balanceRes
  }
  let allowance: bigint | null = null
  if (options.spender) {
    const aRes = await readErc20Allowance(
      token,
      holder,
      options.spender,
      options,
    )
    if (aRes.kind === "ok") {
      allowance = aRes.value
    }
  }
  return {
    kind: "ok" as const,
    value: {
      balance: balanceRes.value,
      allowance,
    } satisfies Erc20UserPosition,
  }
}

/**
 * Batch-read ERC20 metadata for multiple tokens. Used by the position
 * service to resolve symbol/decimals in parallel.
 */
export async function readErc20InfoBatch(
  tokens: readonly `0x${string}`[],
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<Map<string, Erc20Info>> {
  const map = new Map<string, Erc20Info>()
  const all = await Promise.all(
    tokens.map(async (t) => {
      const r = await readErc20Info(t, options)
      return [t, r] as const
    }),
  )
  for (const [token, r] of all) {
    if (r.kind === "ok") {
      map.set(token, r.value)
    }
  }
  return map
}
