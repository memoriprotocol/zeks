/**
 * ZEKS Markets — Centralized Robinhood Chain RPC client.
 *
 * All onchain reads for the lending markets domain route through this
 * module. We never scatter `https://rpc...` URLs across components.
 *
 * Two transports are supported:
 *
 *   1. **Wallet provider** (preferred when available) — uses the user's
 *      connected wallet's EIP-1193 provider via `eth_call`. This is
 *      more reliable for users because it routes through the wallet's
 *      RPC (often a paid/private endpoint with better SLAs), and it
 *      avoids any CORS / domain-allowlist restrictions on the public
 *      endpoint.
 *
 *   2. **Public RPC** (fallback / server-side) — when the wallet is
 *      disconnected, or when called from a non-browser environment.
 *      Uses the same URL the wallet configuration exposes:
 *      https://rpc.mainnet.chain.robinhood.com
 *
 * Both transports expose the SAME `ethCall` shape so callers don't
 * need to branch on transport. Errors are normalized into the
 * `RpcReadError` discriminated union so the UI can render clean
 * disconnected / wrong-network / unavailable / unsupported-token
 * states.
 *
 * No secrets. No paid infrastructure. No `robinhoodRPC.io`.
 */

import type { EIP1193Provider } from "@/lib/wallet/types"

export const ROBINHOOD_PUBLIC_RPC_URL =
  "https://rpc.mainnet.chain.robinhood.com"

export const ROBINHOOD_CHAIN_ID_HEX = "0x1237"
export const ROBINHOOD_CHAIN_ID_DEC = 4663

/**
 * Minimal RPC error surface. We never throw raw `Error` strings to
 * the UI — every error path returns one of these discriminated
 * cases so the UI can render a deterministic, user-friendly state.
 */
export type RpcReadError =
  | { kind: "no-provider" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "rpc-unavailable"; message: string }
  | { kind: "unsupported-token"; token: string }
  | { kind: "no-data"; token: string }
  | { kind: "malformed-response"; raw: string }
  | { kind: "timeout"; ms: number }

export type RpcReadResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "error"; error: RpcReadError }

/** EIP-1474 minimal eth_call request. */
interface EthCallArgs {
  to: `0x${string}`
  data: `0x${string}`
}

interface JsonRpcResponse<T> {
  jsonrpc?: string
  id?: number
  result?: T
  error?: { code?: number; message?: string }
}

/**
 * EIP-1193 eth_call via the user's wallet provider.
 *
 *   - `eth_call` is read-only — it never asks the wallet for a
 *     signature or triggers a popup.
 *   - If the wallet's RPC is in a different chain, we surface
 *     `wrong-network` and do not retry.
 *   - On RPC errors / timeouts we surface `rpc-unavailable`.
 */
export async function walletEthCall<T = string>(
  provider: EIP1193Provider,
  args: EthCallArgs,
  options: { timeoutMs?: number } = {},
): Promise<RpcReadResult<T>> {
  const { timeoutMs = 5_000 } = options

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)

    // The wallet's EIP-1193 provider doesn't expose AbortController;
    // we use a race-on-timeout via Promise.
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new Error("timeout"))
      })
    })

    const callPromise = (async () => {
      const res = (await provider.request({
        method: "eth_call",
        params: [args, "latest"],
      })) as JsonRpcResponse<T>["result"]

      if (typeof res !== "string") {
        throw new Error("malformed-response")
      }
      return res
    })()

    let result: string
    try {
      result = await Promise.race([callPromise, timeoutPromise])
    } finally {
      clearTimeout(t)
    }

    return { kind: "ok", value: result as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/timeout/i.test(message)) {
      return {
        kind: "error",
        error: { kind: "timeout", ms: timeoutMs },
      }
    }
    if (/malformed-response/i.test(message)) {
      return {
        kind: "error",
        error: { kind: "malformed-response", raw: message },
      }
    }
    return {
      kind: "error",
      error: { kind: "rpc-unavailable", message },
    }
  }
}

/**
 * Public RPC eth_call. Used when there is no wallet, OR when the
 * wallet is on the wrong chain (so we still get fresh data without
 * asking the user to switch).
 */
export async function publicEthCall<T = string>(
  args: EthCallArgs,
  options: { rpcUrl?: string; timeoutMs?: number } = {},
): Promise<RpcReadResult<T>> {
  const {
    rpcUrl = ROBINHOOD_PUBLIC_RPC_URL,
    timeoutMs = 5_000,
  } = options

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [args, "latest"],
        id: 1,
      }),
      signal: controller.signal,
    })
    clearTimeout(t)

    if (!res.ok) {
      return {
        kind: "error",
        error: { kind: "rpc-unavailable", message: `HTTP ${res.status}` },
      }
    }
    const j = (await res.json()) as JsonRpcResponse<T>
    if (j.error) {
      return {
        kind: "error",
        error: {
          kind: "rpc-unavailable",
          message: j.error.message ?? "RPC error",
        },
      }
    }
    if (typeof j.result !== "string") {
      return {
        kind: "error",
        error: { kind: "malformed-response", raw: String(j.result) },
      }
    }
    return { kind: "ok", value: j.result as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/abort/i.test(message)) {
      return { kind: "error", error: { kind: "timeout", ms: timeoutMs } }
    }
    return {
      kind: "error",
      error: { kind: "rpc-unavailable", message },
    }
  }
}

/**
 * Adapter: pick the right transport.
 *
 * Routing logic:
 *   - When `preferWalletRpc` is true (legacy behaviour) AND the wallet
 *     is on Robinhood Chain, use the wallet's eth_call.
 *   - Otherwise always use the public RPC URL:
 *     https://rpc.mainnet.chain.robinhood.com
 *
 * Rationale for defaulting to public RPC:
 *   The Robinhood Wallet browser extension (and potentially other
 *   wallets) may route `eth_call` through an internal endpoint that
 *   serves requests for other chains. Using the explicit public RPC
 *   URL ensures all reads are served by the canonical, chain-validated
 *   Robinhood Chain endpoint already used throughout ZEKS.
 *
 * This is a read-only operation — no signatures, no popups.
 */
export async function ethCall<T = string>(
  args: EthCallArgs,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
    /**
     * When true, attempt the wallet's own eth_call endpoint first
     * (legacy behaviour). When false (default), always use the public
     * RPC URL — the correct canonical endpoint for Robinhood Chain.
     */
    preferWalletRpc?: boolean
  } = {},
): Promise<RpcReadResult<T>> {
  const { preferWalletRpc = false } = options
  const useWallet =
    preferWalletRpc &&
    options.provider &&
    (options.chainId == null || options.chainId === ROBINHOOD_CHAIN_ID_DEC)
  if (useWallet && options.provider) {
    return walletEthCall<T>(options.provider, args, {
      timeoutMs: options.timeoutMs,
    })
  }
  return publicEthCall<T>(args, { timeoutMs: options.timeoutMs })
}

/**
 * Parse a hex-encoded uint256 / uint128 / uint64 from an `eth_call`
 * result. Returns bigint (zero when the result is "0x" or zero bytes).
 */
export function parseUint256(hex: string, byteOffset: number): bigint {
  if (!hex || hex === "0x") return BigInt(0)
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex
  if (stripped.length < (byteOffset + 32) * 2) return BigInt(0)
  const slice = stripped.slice(byteOffset * 2, (byteOffset + 32) * 2)
  if (!/^[0-9a-fA-F]+$/.test(slice)) return BigInt(0)
  return BigInt("0x" + slice)
}

/**
 * Parse a hex-encoded string returned by `name()` / `symbol()`.
 *
 * Solidity's `string` ABI returns dynamic data with the layout
 *   [offset=0x20][length][bytes...]
 * where `offset` is a uint256 in the first 32-byte slot, `length`
 * is the byte length of the string, and the bytes themselves live
 * at `offset * 1` (relative to the start of the return data).
 *
 * Concrete example — AAPL token `symbol()` returns 96 bytes:
 *   slot0:  0x...0020       (offset = 32)
 *   slot1:  0x...0004       (length = 4)
 *   slot2:  0x4141504c...   ("AAPL")
 *
 * Strings are decoded as UTF-8 (not Latin-1) because ERC20 `name()`
 * commonly contains multi-byte glyphs (e.g. "Apple • Robinhood Token"
 * where `•` is three bytes: `e2 80 a2`).
 *
 * Robustness:
 *   - If the first slot is non-zero AND in the plausible offset
 *     range [0x20, 0xffff], treat it as the dynamic-string offset
 *     and re-read the length + bytes from there.
 *   - Otherwise fall back to reading bytes at the given `byteOffset`
 *     (legacy behaviour for fixed strings).
 *   - Strings longer than 32 bytes are followed across multiple
 *     32-byte slots until the declared length is consumed.
 */
export function parseShortString(hex: string, byteOffset: number): string {
  if (!hex || hex === "0x") return ""
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex
  if (stripped.length < (byteOffset + 32) * 2) return ""

  // Decode the offset slot at the caller's position. Use BigInt to
  // avoid precision loss on 32-byte values (parseInt caps at 53 bits).
  const offsetSlotHex = stripped.slice(byteOffset * 2, (byteOffset + 32) * 2)
  let offsetValue = 0
  try {
    offsetValue = Number(BigInt("0x" + offsetSlotHex))
  } catch {
    return ""
  }

  let stringStartByte = byteOffset
  let stringByteLen: number | null = null
  if (
    Number.isFinite(offsetValue) &&
    offsetValue >= 0x20 &&
    offsetValue <= 0xffff &&
    stripped.length >= (byteOffset + offsetValue + 32) * 2
  ) {
    const lenHex = stripped.slice(
      (byteOffset + offsetValue) * 2,
      (byteOffset + offsetValue + 32) * 2,
    )
    let len = 0
    try {
      len = Number(BigInt("0x" + lenHex))
    } catch {
      len = -1
    }
    if (Number.isFinite(len) && len >= 0 && len <= 1024) {
      stringStartByte = byteOffset + offsetValue + 32
      stringByteLen = len
    }
  }

  // Read the byte range (either the declared dynamic-string bytes,
  // or one fixed-size 32-byte slot at the caller's offset).
  const byteCount = stringByteLen ?? 32
  const hexByteLen = byteCount * 2
  const startHexIdx = stringStartByte * 2
  const dataHex = stripped.slice(startHexIdx, startHexIdx + hexByteLen)

  // UTF-8 decode (browser + node). We deliberately do NOT decode
  // char-by-char as Latin-1; ERC20 names commonly include glyphs
  // such as `•` whose UTF-8 representation is three bytes.
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(dataHex, "hex").toString("utf8").replace(/\0+$/, "")
    }
    if (typeof TextDecoder !== "undefined") {
      const bytes = new Uint8Array(dataHex.length / 2)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(dataHex.substr(i * 2, 2), 16)
      }
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
      return decoded.replace(/\0+$/, "")
    }
  } catch {
    return ""
  }
  return ""
}
