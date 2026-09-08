/**
 * ZEKS — Robinhood Chain (mainnet) config.
 *
 * ZEKS is Robinhood Chain ONLY. There is intentionally no chain
 * selector, no multi-chain support, and no other networks added
 * to the product. If you need another chain, you are in the
 * wrong product.
 *
 * Values match the official Robinhood Chain public config
 * (chainId 4663, native currency ETH, public RPC, Blockscout
 * block explorer).
 */

export const ROBINHOOD_CHAIN_ID_HEX = "0x1237" // 4663
export const ROBINHOOD_CHAIN_ID_DEC = 4663

export const ROBINHOOD_CHAIN_CONFIG = {
  chainId: ROBINHOOD_CHAIN_ID_HEX,
  chainName: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  infoUrls: ["https://robinhood.com"],
} as const

export const ROBINHOOD_BLOCKSCOUT_BASE =
  "https://robinhoodchain.blockscout.com"
