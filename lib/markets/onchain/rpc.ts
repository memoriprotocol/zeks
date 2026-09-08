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
 *   - Wallet provider available + correct chain → wallet RPC.
 *   - Wallet provider available + wrong chain   → public RPC.
 *   - No wallet                                 → public RPC.
 *
 * This is the single entry point components should use. No raw
 * fetch / window.ethereum in component code.
 */
export async function ethCall<T = string>(
  args: EthCallArgs,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<RpcReadResult<T>> {
  const { provider, chainId } = options
  const useWallet =
    provider && (chainId == null || chainId === ROBINHOOD_CHAIN_ID_DEC)
  if (useWallet && provider) {
    return walletEthCall<T>(provider, args, {
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

/** Parse a fixed-length hex string returned by `name()` / `symbol()`. */
export function parseShortString(hex: string, byteOffset: number): string {
  if (!hex || hex === "0x") return ""
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex
  if (stripped.length < (byteOffset + 32) * 2) return ""
  // The string is right-padded with zeros. Read until the first
  // zero byte or end of slot.
  const slice = stripped.slice(byteOffset * 2, (byteOffset + 32) * 2)
  let out = ""
  for (let i = 0; i < slice.length; i += 2) {
    const code = parseInt(slice.slice(i, i + 2), 16)
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out
}
