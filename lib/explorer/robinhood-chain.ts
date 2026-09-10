/**
 * ZEKS — Robinhood Chain mainnet explorer helpers
 *
 * Robinhood Chain mainnet (chainId 4663) is exposed via Blockscout at
 * `https://robinhoodchain.blockscout.com`. All transaction, address,
 * and block deep-links throughout the app MUST be derived from this
 * helper so the URL never drifts between components.
 *
 * No business logic here — pure URL composition.
 */

/** Public Blockscout explorer for Robinhood Chain mainnet (chainId 4663). */
export const ROBINHOOD_CHAIN_EXPLORER_BASE =
  "https://robinhoodchain.blockscout.com"

export function explorerTxUrl(txHash: string): string {
  return `${ROBINHOOD_CHAIN_EXPLORER_BASE}/tx/${txHash}`
}

export function explorerAddressUrl(address: string): string {
  return `${ROBINHOOD_CHAIN_EXPLORER_BASE}/address/${address}`
}

export function explorerBlockUrl(blockNumber: number | string): string {
  return `${ROBINHOOD_CHAIN_EXPLORER_BASE}/block/${blockNumber}`
}
