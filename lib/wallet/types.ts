/**
 * Minimal EIP-1193 types for the ZEKS wallet connector.
 *
 * We intentionally do NOT depend on viem or wagmi. The only surface
 * area ZEKS needs is:
 *
 *   - eth_requestAccounts     (open wallet popup)
 *   - eth_accounts            (silent re-check on mount)
 *   - wallet_switchEthereumChain
 *   - wallet_addEthereumChain
 *   - chainId / accountsChanged / disconnect events
 *
 * Everything else is out of scope at this stage.
 */

import type { Address, Hex } from "./types-common"

export type {
  Address,
  Hex,
}

export interface EIP1193RequestArgs {
  method: string
  params?: unknown[] | Record<string, unknown>
}

export interface EIP1193Provider {
  request(args: EIP1193RequestArgs): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

/** EIP-1193 standard error shape (subset). */
export interface EIP1193RpcError extends Error {
  code: number
  data?: unknown
}
