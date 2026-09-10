/**
 * ZEKS Markets — Protocol contract registry.
 *
 * Hosts the addresses the write flows need to send real
 * transactions on Robinhood Chain (4663). EVERY entry must be
 * sourced from a verified, build-time-checked source — never
 * guessed.
 *
 * Source priority (high → low):
 *
 *   1. `NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_<chainId>` env var
 *      (e.g. `NEXT_PUBLIC_MORPHO_BLUE_ADDRESS_4663`). Used as a
 *      per-deployment override.
 *
 *   2. Bundled JSON snapshot at
 *      `lib/markets/protocol/addresses.json`. This is the
 *      authoritative source for the current commit. The snapshot
 *      is verified at commit-time against:
 *        - `eth_chainId` returning 0x1237
 *        - `eth_getCode(core)` returning non-empty bytecode
 *        - `idToMarketParams(marketId)` returning the onchain
 *          MarketParams tuple matching Morpho GraphQL data
 *        - `eth_call(supply/supplyCollateral/borrow)` reaching
 *          protocol logic (rather than selector/encoding errors)
 *
 * Function selectors are NOT loaded from this snapshot. They are
 * derived once at module load from canonical `IMorpho.sol`
 * interface signatures via `keccak256` in `lib/markets/onchain/abi.ts`.
 *
 * The write flows NEVER attempt to send a transaction when this
 * registry returns `morphoBlueAddress: null`.
 */

import type { Address } from "@/lib/wallet/types-common"

// Snapshot type — kept minimal; only verified deployment is committed.
interface AddressSnapshot {
  chainId: number
  morphoBlue: {
    core: Address
    irm: Address
    oracleFactory: Address
  }
  provenance: {
    core: string
    interface: string
    verificationSteps: readonly string[]
    abiSource: string
  }
  verifiedAt: string
  verifiedBy: string
  notes: string
}

export const ROBINHOOD_CHAIN_ID_DEC = 4663

export interface ProtocolContracts {
  /** Chain ID these addresses are for. */
  chainId: number
  /**
   * Morpho Blue protocol core contract on this chain.
   * The contract users call `supply(...)` on. Null when not
   * verified.
   */
  morphoBlueAddress: Address | null
  /** Human-readable source — what verified this address. */
  morphoBlueSource: string | null
  /**
   * IRM contract used in onchain MarketParams. Null when no
   * verified deployment is configured.
   */
  morphoBlueIrmAddress: Address | null
  /** Adaptive Curve IRM source citation. */
  morphoBlueIrmSource: string | null
  /**
   * Chainlink oracle factory referenced in deployment docs. Null
   * when no verified deployment is configured.
   */
  morphoBlueOracleFactory: Address | null
  /**
   * Source citation for the oracle factory.
   */
  morphoBlueOracleFactorySource: string | null
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
 * Load the bundled address snapshot (addresses.json). Tolerant to
 * build environments where the snapshot has not been generated —
 * returns null in that case.
 */
function loadAddressSnapshot(): AddressSnapshot | null {
  // Bypass webpack's JSON require so the snapshot stays a static
  // JSON asset. If the JSON is missing in the bundle, we fall
  // through to "no snapshot" instead of throwing.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw = require("./addresses.json") as AddressSnapshot
    if (
      raw &&
      typeof raw === "object" &&
      raw.morphoBlue &&
      typeof raw.morphoBlue.core === "string" &&
      /^0x[a-fA-F0-9]{40}$/.test(raw.morphoBlue.core)
    ) {
      return raw
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolve the protocol contract registry for Robinhood Chain.
 *
 * Returns a fully-typed record. When the bundled snapshot is
 * present for chain 4663, the canonical Morpho Blue address is
 * returned with provenance. Otherwise, the registry falls back
 * to the env var and ultimately returns `null`.
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
      morphoBlueIrmAddress: null,
      morphoBlueIrmSource: null,
      morphoBlueOracleFactory: null,
      morphoBlueOracleFactorySource: null,
    }
  }
  const snap = loadAddressSnapshot()
  if (!snap) {
    return emptyContractSet(chainId)
  }
  return {
    chainId: snap.chainId,
    morphoBlueAddress: snap.morphoBlue.core,
    morphoBlueSource: `${snap.provenance.core} (snapshot ${snap.verifiedAt})`,
    morphoBlueIrmAddress: snap.morphoBlue.irm,
    morphoBlueIrmSource: snap.provenance.core,
    morphoBlueOracleFactory: snap.morphoBlue.oracleFactory,
    morphoBlueOracleFactorySource: snap.provenance.core,
  }
}

function emptyContractSet(chainId: number): ProtocolContracts {
  return {
    chainId,
    morphoBlueAddress: null,
    morphoBlueSource: null,
    morphoBlueIrmAddress: null,
    morphoBlueIrmSource: null,
    morphoBlueOracleFactory: null,
    morphoBlueOracleFactorySource: null,
  }
}

/**
 * Diagnostic dump for dev logs.
 */
export function describeProtocolContracts(c: ProtocolContracts): string {
  if (!c.morphoBlueAddress) {
    return (
      `No verified protocol contract address configured for ` +
      `chainId=${c.chainId}. Set ${ENV_KEY} or commit a ` +
      `snapshot at lib/markets/protocol/addresses.json.`
    )
  }
  return (
    `chainId=${c.chainId} morphoBlue=${c.morphoBlueAddress} ` +
    `source=${c.morphoBlueSource ?? "?"}`
  )
}
