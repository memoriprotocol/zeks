/**
 * ZEKS Markets — Verified loopr vaults on Robinhood Chain (chainId 4663).
 *
 * Addresses verified by:
 *   1. Bytecode check (`eth_getCode !== "0x"`).
 *   2. ERC-20 Transfer (`0xddf252ad…`) topic subscription through
 *      `eth_getLogs` returning at least one log within the last
 *      ~50,000 blocks (relative to the recorded head).
 *
 * DO NOT add addresses here unless both checks have been performed
 * and the source is documented below.
 *
 * Sources:
 *   - https://docs.loopr.fund/
 *   - https://app.loopr.fund/stats
 *
 * The first entry (`PRIMARY_VAULT_ADDRESS`) is the active feed the
 * dashboard surfaces. The remaining entries are included in the same
 * RPC scan so users see activity from any verified vault without
 * being misled by silence from inactive ones.
 */

import { ROBINHOOD_CHAIN_ID_DEC } from "@/lib/markets/onchain/rpc"

export type VaultVenue = "steakhouse" | "ethena-steakhouse" | "grove-steakhouse"

export interface VerifiedVault {
  /** ERC-20 share-token address (these are vaults but expose ERC-20 events). */
  address: `0x${string}`
  /** Display venue label. */
  venue: VaultVenue
  /** Human-readable label, used in the feed. */
  label: string
  /** ERC-20 token decimals. Loopr USDG vaults use 18. */
  decimals: number
  /** Source citation kept for documentation. */
  source: string
}

/**
 * Primary vault — always polled. The dashboard's "active feed"
 * defaults to this venue.
 */
export const PRIMARY_VAULT_ADDRESS: `0x${string}` =
  "0xBeEff033F34C046626B8D0A041844C5d1A5409dd"

export const VERIFIED_LOOPR_VAULTS: readonly VerifiedVault[] = [
  {
    address: PRIMARY_VAULT_ADDRESS,
    venue: "steakhouse",
    label: "Steakhouse USDG",
    decimals: 18,
    source: "https://docs.loopr.fund/",
  },
  {
    address: "0xbEeFF0fb1Dc19344A87b8479dAb60A2e16160737",
    venue: "ethena-steakhouse",
    label: "Ethena × Steakhouse USDG",
    decimals: 18,
    source: "https://docs.loopr.fund/",
  },
  {
    address: "0xBEEff039907422219Fb367e525954DDC092854d9",
    venue: "grove-steakhouse",
    label: "Grove × Steakhouse USDG",
    decimals: 18,
    source: "https://docs.loopr.fund/",
  },
]

/** Required chain for these vaults. */
export const PROTOCOL_FEED_CHAIN_ID = ROBINHOOD_CHAIN_ID_DEC

/**
 * Event topic for ERC-20 `Transfer(address,address,uint256)`.
 * Used as the topic0 filter for `eth_getLogs`.
 * (keccak256("Transfer(address,address,uint256)"))
 */
export const ERC20_TRANSFER_TOPIC: `0x${string}` =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

/** Topics for the "zero address" sentinel used to classify IN vs OUT. */
export const ZERO_ADDRESS_TOPIC: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000"

/** Number of recent blocks to scan on each poll. ~50,000 ≈ 20h on Robinhood Chain. */
export const PROTOCOL_FEED_BLOCK_WINDOW = 50_000
