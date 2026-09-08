/**
 * ZEKS Markets — Protocol contract registry.
 *
 * Hosts the addresses the supply flow needs to send real write
 * transactions on Robinhood Chain. EVERY entry must be sourced
 * from a verified, build-time-checked source — never guessed.
 *
 * Source priority (high → low):
 *
 *   1. `NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_<chainId>` env var
 *      (e.g. `NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_4663`).
 *
 *   2. Bundled JSON snapshot at `lib/markets/protocol/addresses.json`
 *      (committed only when sourced from the official Morpho Blue
 *      deployment registry at the time of commit).
 *
 *   3. Hardcoded verifier may embed known-canonical addresses ONLY
 *      after explicit commit-time confirmation. There is currently
 *      NO such address for the supply spender on Robinhood Chain,
 *      and the registry returns `null` for `morphoBlueAddress`.
 *
 * The supply flow NEVER attempts to send a transaction when this
 * registry returns null. Instead it surfaces a clean
 * `protocol-not-configured` state so the user knows exactly which
 * contract address is missing.
 */

import type { Address } from "@/lib/wallet/types-common"

export const ROBINHOOD_CHAIN_ID_DEC = 4663

export interface ProtocolContracts {
  /** Chain ID these addresses are for. */
  chainId: number
  /**
   * Morpho Blue protocol core contract on this chain.
   * The contract users call `supply(...)` on.
   * Null when not verified.
   */
  morphoBlueAddress: Address | null
  /**
   * Human-readable source — what verified this address. Null when
   * no address is configured.
   */
  morphoBlueSource: string | null
  /**
   * Morpho Blue `supply()` function selector (4 bytes). Standard
   * across deployments.
   * Reference:
   *   supply(MarketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
   *   supplyCollateral(MarketParams, uint256 assets, address onBehalf, address receiver)
   *   Note: actual selectors depend on the deployed bytecode. We
   *   do NOT hardcode them here — they are verified at the same
   *   time as the address.
   */
  morphoBlueSupplySelector: `0x${string}` | null
  /** Where ABI comes from for the supply flow. */
  morphoBlueAbiSource: string | null
}

const ENV_KEY = `NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_${ROBINHOOD_CHAIN_ID_DEC}`

function readEnvAddress(): Address | null {
  // process.env.NEXT_PUBLIC_* is inlined at build time by Next.js.
  const raw = process.env[ENV_KEY]
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null
  return trimmed as Address
}

/**
 * Resolve the protocol contract registry for Robinhood Chain.
 *
 * Returns a fully-typed record whose fields are all `null` when
 * no address is configured. The supply flow uses this to gate
 * transactional actions; nothing else in the app should depend on
 * it.
 */
export function resolveProtocolContractsForChain(
  chainId: number,
): ProtocolContracts {
  if (chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return emptyContractSet(chainId)
  }
  const envAddr = readEnvAddress()
  if (envAddr) {
    return {
      chainId,
      morphoBlueAddress: envAddr,
      morphoBlueSource: `${ENV_KEY}`,
      // Until the env var entry is paired with explicit verification
      // of the bytecode, we leave selectors and ABI null so the
      // flow cannot construct calldata.
      morphoBlueSupplySelector: null,
      morphoBlueAbiSource: null,
    }
  }
  return emptyContractSet(chainId)
}

function emptyContractSet(chainId: number): ProtocolContracts {
  return {
    chainId,
    morphoBlueAddress: null,
    morphoBlueSource: null,
    morphoBlueSupplySelector: null,
    morphoBlueAbiSource: null,
  }
}

/**
 * Diagnostic dump for dev logs.
 */
export function describeProtocolContracts(c: ProtocolContracts): string {
  if (!c.morphoBlueAddress) {
    return (
      `No verified protocol contract address configured for ` +
      `chainId=${c.chainId}. Set ${ENV_KEY} to the canonical ` +
      `Morpho Blue deployment and document the source.`
    )
  }
  return (
    `chainId=${c.chainId} morphoBlue=${c.morphoBlueAddress} ` +
    `source=${c.morphoBlueSource ?? "?"} supplySelector=` +
    `${c.morphoBlueSupplySelector ?? "—"}`
  )
}
