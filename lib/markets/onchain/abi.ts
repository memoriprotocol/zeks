/**
 * ZEKS Markets — ABI encoders (read & write).
 *
 * Every encoder here must be backed by a verified source. Two
 * distinct trust tiers live in this file:
 *
 *   1. CANONICAL TOKEN STANDARDS (always safe).
 *      - ERC20 `allowance`, `approve`, `balanceOf`
 *      - ERC4626 `deposit`, `previewDeposit`
 *      These are universal token-standard interfaces defined by
 *      EIPs (20 / 4626). Their 4-byte selectors are mathematically
 *      deterministic and the same on every EVM deployment.
 *      Encoders for these are inlined directly.
 *
 *   2. PROTOCOL-SPECIFIC FUNCTIONS (registry-gated).
 *      - Morpho Blue `supply`, `supplyCollateral`, `borrow`,
 *        `withdraw`, `withdrawCollateral`, `repay`
 *      These encoders DO NOT hardcode a selector. They read the
 *      selector from the verified `ProtocolContracts` registry.
 *      If the registry has not been wired for Robinhood Chain
 *      (4663), these encoders throw `protocol-not-configured`
 *      before any calldata is constructed.
 *
 * NO address or selector is ever invented in this file. When a
 * protocol function is added, the selector and ABI layout must
 * come from the same verified source (deployment registry,
 * explicit bytecode check, or committed addresses snapshot).
 */

/* ------------------------------------------------------ */
/* Address + scalar encoding primitives                     */
/* ------------------------------------------------------ */

function padAddress(addr: string): string {
  const cleaned = addr.startsWith("0x") ? addr.slice(2) : addr
  if (!/^[a-fA-F0-9]{40}$/.test(cleaned)) {
    throw new Error(`Invalid address: ${addr}`)
  }
  return cleaned.toLowerCase().padStart(64, "0")
}

function padUint256(n: bigint): string {
  if (n < BigInt(0)) {
    throw new Error(`Negative amount: ${n.toString()}`)
  }
  return n.toString(16).padStart(64, "0")
}

export function encodeUint256(n: bigint): string {
  return padUint256(n)
}

export function encodeAddress(addr: string): string {
  return padAddress(addr)
}

/* ------------------------------------------------------ */
/* ERC20 — canonical token standard (EIP-20)               */
/* ------------------------------------------------------ */

/**
 * keccak256("balanceOf(address)")[:4] — universal.
 */
export const ERC20_SELECTORS = {
  balanceOf: "0x70a08231" as const,
  allowance: "0xdd62ed3e" as const,
  approve: "0x095ea7b3" as const,
} as const

/**
 * Maximum uint256 — used for unlimited ERC20 approvals.
 */
export const MAX_UINT256: bigint = (BigInt(1) << BigInt(256)) - BigInt(1)

/**
 * `balanceOf(address)` → returns uint256.
 */
export function encodeErc20BalanceOf(owner: string): `0x${string}` {
  return `${ERC20_SELECTORS.balanceOf}${padAddress(owner)}` as `0x${string}`
}

/**
 * `allowance(address owner, address spender)` → returns uint256.
 */
export function encodeErc20Allowance(
  owner: string,
  spender: string,
): `0x${string}` {
  return `${ERC20_SELECTORS.allowance}${padAddress(owner)}${padAddress(
    spender,
  )}` as `0x${string}`
}

/**
 * `approve(address spender, uint256 amount)` — standard ERC20.
 */
export function encodeErc20Approve(
  spender: string,
  amount: bigint,
): `0x${string}` {
  return `${ERC20_SELECTORS.approve}${padAddress(spender)}${padUint256(
    amount,
  )}` as `0x${string}`
}

/* ------------------------------------------------------ */
/* ERC4626 — canonical vault standard (EIP-4626)            */
/* ------------------------------------------------------ */

/**
 * keccak256("deposit(uint256,address)")[:4] — universal.
 *
 * `deposit(uint256 assets, address receiver)` → returns uint256.
 */
export const ERC4626_SELECTORS = {
  deposit: "0x6e553f65" as const,
} as const

export function encodeErc4626Deposit(
  assets: bigint,
  receiver: string,
): `0x${string}` {
  return `${ERC4626_SELECTORS.deposit}${padUint256(assets)}${padAddress(
    receiver,
  )}` as `0x${string}`
}

/* ------------------------------------------------------ */
/* Morpho Blue — registry-gated                             */
/* ------------------------------------------------------ */

import type { Address } from "@/lib/wallet/types-common"
import type { ProtocolContracts } from "../protocol/registry"
import { ROBINHOOD_CHAIN_ID_DEC } from "../protocol/registry"

/**
 * The canonical Morpho Blue MarketParams struct, as it appears
 * in the onchain ABI tuple `(address loanToken, address
 * collateralToken, address oracle, address irm, uint256 lltv)`.
 *
 * `lltv` is encoded as the raw WAD value the protocol expects
 * (e.g. 86% LLTV = 0.86 * 1e18 = 860000000000000000).
 */
export interface MorphoMarketParams {
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  /** LLTV as raw uint256 WAD (e.g. 86% = 86 * 1e16). */
  lltv: bigint
}

/**
 * Convert a ZEKS `LendingMarket` (with the audit-required fields
 * populated from real Morpho data) into the canonical onchain
 * `MarketParams` tuple.
 *
 * Throws `protocol-not-configured` when any required piece is
 * missing — caller must treat this as a no-op and surface the
 * block in the UI.
 */
export function marketParamsFromLendingMarket(input: {
  loanTokenAddress: Address | null
  collateralTokenAddress: Address | null
  oracleAddress: string | null
  irmAddress: string | null
  /** ZEKS-normalized 0..1 fraction (e.g. 0.86). */
  lltvFraction: number | null
}): MorphoMarketParams {
  if (!input.loanTokenAddress) throw missing("loan-token-address")
  if (!input.collateralTokenAddress) throw missing("collateral-token-address")
  if (!input.oracleAddress) throw missing("oracle-address")
  if (!input.irmAddress) throw missing("irm-address")
  if (input.lltvFraction == null || !Number.isFinite(input.lltvFraction))
    throw missing("lltv")
  // WAD = 1e18
  const lltvWad = BigInt(
    Math.round(input.lltvFraction * 1e18),
  )
  return {
    loanToken: input.loanTokenAddress,
    collateralToken: input.collateralTokenAddress,
    oracle: input.oracleAddress as Address,
    irm: input.irmAddress as Address,
    lltv: lltvWad,
  }
}

function missing(field: string): Error {
  return new Error(
    `protocol-not-configured: missing ${field} on LendingMarket. ` +
      `Cannot construct Morpho calldata without verified market params.`,
  )
}

/**
 * ABI-encode the Morpho Blue MarketParams tuple in canonical
 * order — `(address, address, address, address, uint256)`.
 *
 * This is protocol-level structural encoding and is identical
 * across all Morpho Blue deployments; it does NOT require a
 * verified selector (selector comes from the registry at call
 * site).
 */
export function encodeMorphoMarketParams(p: MorphoMarketParams): string {
  return (
    padAddress(p.loanToken) +
    padAddress(p.collateralToken) +
    padAddress(p.oracle) +
    padAddress(p.irm) +
    padUint256(p.lltv)
  )
}

/**
 * Morpho Blue function selectors. NO value here is hard-coded —
 * they are read from the verified `ProtocolContracts` registry.
 * If the registry has no verified selector for a given function,
 * the corresponding encoder throws `protocol-not-configured`.
 *
 * ABI signatures (for the bytecode verifier's reference only —
 * we never emit them in calldata):
 *   supply(MarketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
 *   supplyCollateral(MarketParams, uint256 assets, address onBehalf, address receiver)
 *   borrow(MarketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
 */
export interface MorphoSelectors {
  supply: `0x${string}` | null
  supplyCollateral: `0x${string}` | null
  borrow: `0x${string}` | null
}

export function readMorphoSelectors(
  contracts: ProtocolContracts,
): MorphoSelectors {
  // Today the registry exposes only `morphoBlueSupplySelector`.
  // supplyCollateral / borrow stay null until the same registry
  // entry is extended with bytecode-verified selectors.
  return {
    supply: contracts.morphoBlueSupplySelector,
    supplyCollateral: null,
    borrow: null,
  }
}

/**
 * Build Morpho Blue `supply(MarketParams, assets, shares,
 * onBehalf, receiver)` calldata. Refuses to construct calldata
 * unless the registry carries a verified selector AND ABI source
 * for Robinhood Chain.
 */
export function encodeMorphoSupply(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  assets: bigint
  shares: bigint
  onBehalf: Address
  receiver: Address
}): `0x${string}` {
  if (input.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    throw new Error(
      `protocol-not-configured: Morpho writes are pinned to chain ` +
        `${ROBINHOOD_CHAIN_ID_DEC}; got ${input.chainId}.`,
    )
  }
  if (!input.contracts.morphoBlueAddress) {
    throw new Error(
      "protocol-not-configured: Morpho Blue core address is not " +
        "verified for Robinhood Chain.",
    )
  }
  if (!input.contracts.morphoBlueSupplySelector) {
    throw new Error(
      "protocol-not-configured: Morpho Blue supply() selector is " +
        "not verified for Robinhood Chain.",
    )
  }
  if (!input.contracts.morphoBlueAbiSource) {
    throw new Error(
      "protocol-not-configured: Morpho Blue ABI source is not " +
        "configured for Robinhood Chain.",
    )
  }
  return (
    `${input.contracts.morphoBlueSupplySelector}` +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padUint256(input.shares) +
    padAddress(input.onBehalf) +
    padAddress(input.receiver)
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `supplyCollateral(MarketParams, assets,
 * onBehalf, receiver)` calldata. Same gating as supply().
 *
 * NOTE: selector source is intentionally NOT bundled here. Until
 * `supplyCollateralSelector` is verified on the registry, this
 * helper refuses to construct calldata.
 */
export function encodeMorphoSupplyCollateral(_input: {
  contracts: ProtocolContracts
  chainId: number
}): `0x${string}` {
  if (_input.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    throw new Error(
      `protocol-not-configured: Morpho writes are pinned to chain ` +
        `${ROBINHOOD_CHAIN_ID_DEC}.`,
    )
  }
  // The registry does not currently expose a verified
  // supplyCollateral selector for Robinhood Chain. Refusing to
  // emit calldata is the safe default.
  throw new Error(
    "protocol-not-configured: Morpho Blue supplyCollateral() " +
      "selector is not verified for Robinhood Chain.",
  )
}

/**
 * Build Morpho Blue `borrow(MarketParams, assets, shares,
 * onBehalf, receiver)` calldata. Same gating as supply().
 *
 * NOTE: borrow selector is not yet verified on the registry.
 */
export function encodeMorphoBorrow(_input: {
  contracts: ProtocolContracts
  chainId: number
}): `0x${string}` {
  if (_input.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    throw new Error(
      `protocol-not-configured: Morpho writes are pinned to chain ` +
        `${ROBINHOOD_CHAIN_ID_DEC}.`,
    )
  }
  throw new Error(
    "protocol-not-configured: Morpho Blue borrow() selector is " +
      "not verified for Robinhood Chain.",
  )
}
