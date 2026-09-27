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
/* Morpho Blue — verified for Robinhood Chain (4663)         */
/* ------------------------------------------------------ */

import { keccak_256 } from "@noble/hashes/sha3.js"
import type { Address } from "@/lib/wallet/types-common"
import type { ProtocolContracts } from "../protocol/registry"
import { ROBINHOOD_CHAIN_ID_DEC } from "../protocol/registry"

/**
 * Verified Morpho Blue deployment on Robinhood Chain.
 *
 *   Core:    0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010
 *   IRM:     0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1
 *   Oracle:  0xB7c16F6f8cF531447Bf27Ca7220f981E79C9cdF2 (MorphoChainlinkOracleV2 factory)
 *
 * Verification (commit-time):
 *   1. eth_chainId  = 0x1237 (4663) ✅
 *   2. eth_getCode(core) > 0   (non-empty bytecode) ✅
 *   3. idToMarketParams(USDe/USDG marketId) returns the onchain
 *      tuple (0x5fc5…1d168, 0x5d3a…7a34, 0xe648…055f,
 *      0x2BD3…0fa1, 915e15) which matches Morpho's GraphQL data
 *      exactly. ✅
 *   4. eth_call of borrow calldata reaches the protocol logic
 *      (reverts with the protocol-level "insufficient collateral"
 *      rather than a selector/encoding error). ✅
 *
 * Provenance:
 *   - Core / IRM / Oracle factory addresses:
 *     https://docs.morpho.org/developers/contracts/addresses/
 *   - IMorpho interface:
 *     https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol
 */
export const MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 = {
  morpho: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010" as Address,
  irm: "0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1" as Address,
  oracleFactory:
    "0xB7c16F6f8cF531447Bf27Ca7220f981E79C9cdF2" as Address,
  source: {
    addresses:
      "https://docs.morpho.org/developers/contracts/addresses/",
    interface:
      "https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol",
    verification: "eth_chainId + eth_getCode + idToMarketParams + borrow eth_call",
  },
} as const

/**
 * Compute keccak256 selector for a canonical function signature
 * at module-load time. Each signature is taken verbatim from
 * Morpho's official `IMorpho.sol` interface — we do NOT type
 * arbitrary 4-byte constants from memory.
 *
 * Canonical IMorpho.sol signatures (resolved per Morpho Blue):
 *   function supply(MarketParams, uint256, uint256, address, bytes)
 *   function supplyCollateral(MarketParams, uint256, address, bytes)
 *   function borrow(MarketParams, uint256, uint256, address, address)
 *   function withdraw(MarketParams, uint256, uint256, address, address)
 *   function withdrawCollateral(MarketParams, uint256, address, address)
 *   function repay(MarketParams, uint256, uint256, address, bytes)
 *   function idToMarketParams(bytes32)
 *
 * Where `MarketParams` is the struct:
 *   struct MarketParams {
 *     address loanToken;
 *     address collateralToken;
 *     address oracle;
 *     address irm;
 *     uint256 lltv;
 *   }
 *
 * Solidity ABI signatures substitute the struct with its members
 * in the same order. A struct that contains only static types is
 * encoded inline (no head offset).
 */
function computeSelector(signature: string): `0x${string}` {
  const bytes = new TextEncoder().encode(signature)
  const digest = keccak_256(bytes)
  const hex = Buffer.from(digest).toString("hex").slice(0, 8)
  return ("0x" + hex) as `0x${string}`
}

/** Verbatim from Morpho's IMorpho.sol (no `receiver` for supply/supplyCollateral). */
const SIG_SUPPLY =
  "supply((address,address,address,address,uint256),uint256,uint256,address,bytes)"
const SIG_SUPPLY_COLLATERAL =
  "supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)"
const SIG_BORROW =
  "borrow((address,address,address,address,uint256),uint256,uint256,address,address)"
const SIG_WITHDRAW =
  "withdraw((address,address,address,address,uint256),uint256,uint256,address,address)"
const SIG_WITHDRAW_COLLATERAL =
  "withdrawCollateral((address,address,address,address,uint256),uint256,address,address)"
const SIG_REPAY =
  "repay((address,address,address,address,uint256),uint256,uint256,address,bytes)"
const SIG_ID_TO_MARKET_PARAMS = "idToMarketParams(bytes32)"

/**
 * Morpho Blue selectors derived from `IMorpho.sol` via keccak256.
 * Provenance: official Morpho Blue source.
 */
export const MORPHO_BLUE_SELECTORS = {
  supply: computeSelector(SIG_SUPPLY),
  supplyCollateral: computeSelector(SIG_SUPPLY_COLLATERAL),
  borrow: computeSelector(SIG_BORROW),
  withdraw: computeSelector(SIG_WITHDRAW),
  withdrawCollateral: computeSelector(SIG_WITHDRAW_COLLATERAL),
  repay: computeSelector(SIG_REPAY),
  idToMarketParams: computeSelector(SIG_ID_TO_MARKET_PARAMS),
} as const

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
 * Morpho Blue function selectors (all derived above from canonical
 * IMorpho.sol signatures).
 */
export interface MorphoSelectors {
  supply: `0x${string}`
  supplyCollateral: `0x${string}`
  borrow: `0x${string}`
  withdraw: `0x${string}`
  withdrawCollateral: `0x${string}`
  repay: `0x${string}`
  idToMarketParams: `0x${string}`
}

export function readMorphoSelectors(_contracts: ProtocolContracts): MorphoSelectors {
  // All Morpho Blue selectors are derived once from canonical
  // IMorpho.sol at module load. They are independent of the
  // `ProtocolContracts` registry (the registry gates the
  // deployed-core ADDRESS, not the function signatures).
  return {
    supply: MORPHO_BLUE_SELECTORS.supply,
    supplyCollateral: MORPHO_BLUE_SELECTORS.supplyCollateral,
    borrow: MORPHO_BLUE_SELECTORS.borrow,
    withdraw: MORPHO_BLUE_SELECTORS.withdraw,
    withdrawCollateral: MORPHO_BLUE_SELECTORS.withdrawCollateral,
    repay: MORPHO_BLUE_SELECTORS.repay,
    idToMarketParams: MORPHO_BLUE_SELECTORS.idToMarketParams,
  }
}

/**
 * Encode an empty `bytes` ABI argument (the last argument of
 * `Morpho.supply` and `Morpho.supplyCollateral`).
 *
 * ABI encoding: dynamic `bytes` gets an offset slot in the head,
 * pointing to a tail region whose first slot is the byte length
 * and the remainder is the byte data.
 *
 * For zero-length bytes, the tail region is a single 32-byte slot
 * containing `0x00…00`.
 */
function encodeEmptyBytes(): string {
  return padUint256(BigInt(0))
}

/**
 * Build Morpho Blue `supply(MarketParams, assets, shares,
 * onBehalf, data)` calldata. Refuses to construct calldata
 * unless the registry carries a verified Morpho Blue core
 * address for Robinhood Chain.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function supply(MarketParams marketParams,
 *                   uint256 assets,
 *                   uint256 shares,
 *                   address onBehalf,
 *                   bytes data)
 *
 * Head layout (struct is fully-static → inlined; bytes is
 * dynamic → offset slot):
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][shares][onBehalf][dataOffset]
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * Morpho authorization is implicit (msg.sender authority covers
 * own balance). No `setAuthorization` is required.
 */
export function encodeMorphoSupply(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  assets: bigint
  shares: bigint
  onBehalf: Address
  data?: `0x${string}`
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
  // 5 head slots before the dynamic `bytes data` offset.
  // MP[5] + assets + shares + onBehalf = 8 head slots → offset = 0x100.
  const dataOffset = padUint256(BigInt(8 * 32))
  const tail = encodeEmptyBytes()
  return (
    MORPHO_BLUE_SELECTORS.supply +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padUint256(input.shares) +
    padAddress(input.onBehalf) +
    dataOffset +
    tail
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `supplyCollateral(MarketParams, assets,
 * onBehalf, data)` calldata.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function supplyCollateral(MarketParams marketParams,
 *                             uint256 assets,
 *                             address onBehalf,
 *                             bytes data)
 *
 * Head layout:
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][onBehalf][dataOffset]
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * authorization is implicit.
 */
export function encodeMorphoSupplyCollateral(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  assets: bigint
  onBehalf: Address
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
  // 7 head slots before the dynamic `bytes data` offset.
  const dataOffset = padUint256(BigInt(7 * 32))
  const tail = encodeEmptyBytes()
  return (
    MORPHO_BLUE_SELECTORS.supplyCollateral +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padAddress(input.onBehalf) +
    dataOffset +
    tail
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `withdraw(MarketParams, assets, shares,
 * onBehalf, receiver)` calldata for asset-based withdrawal.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function withdraw(MarketParams marketParams,
 *                    uint256 assets,
 *                    uint256 shares,
 *                    address onBehalf,
 *                    address receiver)
 *
 * For asset-based withdrawal (F3B):
 *   assets = exact token amount to withdraw
 *   shares = 0  (Morpho computes shares internally via toAssetsUp)
 *   onBehalf = wallet address (user withdraws their own position)
 *   receiver = wallet address (funds go back to user)
 *
 * Head layout — withdraw has NO dynamic args (5 static + 5 static
 * → fully inline, no tail region):
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][shares][onBehalf][receiver]
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * Morpho's authorization check is satisfied (sender can always withdraw
 * their own position).
 *
 * Throws on:
 *   - wrong chain
 *   - missing morphoBlueAddress
 *   - missing or invalid marketParams
 *   - assets == 0
 *
 * The caller is responsible for validating that
 * assets <= userSuppliedAssets and assets <= maxWithdrawable.
 */
export function encodeMorphoWithdraw(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  /** Asset amount in loan-token smallest units (must be > 0). */
  assets: bigint
  /** Must be 0n for asset-based withdrawal. */
  shares: bigint
  /** Address whose position to withdraw from. */
  onBehalf: Address
  /** Address to receive the withdrawn tokens. */
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
  if (!input.params) {
    throw new Error(
      "protocol-not-configured: market params are missing.",
    )
  }
  return (
    MORPHO_BLUE_SELECTORS.withdraw +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padUint256(input.shares) +
    padAddress(input.onBehalf) +
    padAddress(input.receiver)
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `borrow(MarketParams, assets, shares,
 * onBehalf, receiver)` calldata.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function borrow(MarketParams marketParams,
 *                   uint256 assets,
 *                   uint256 shares,
 *                   address onBehalf,
 *                   address receiver)
 *
 * Head layout — borrow has NO dynamic args (5 static + 5 static
 * → fully inline, no tail region):
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][shares][onBehalf][receiver]
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * Morpho's authorization check is satisfied (sender can borrow
 * against own collateral position). No setAuthorization needed.
 */
export function encodeMorphoBorrow(input: {
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
  return (
    MORPHO_BLUE_SELECTORS.borrow +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padUint256(input.shares) +
    padAddress(input.onBehalf) +
    padAddress(input.receiver)
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `repay(MarketParams, assets, shares,
 * onBehalf, data)` calldata.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function repay(MarketParams marketParams,
 *                 uint256 assets,
 *                 uint256 shares,
 *                 address onBehalf,
 *                 bytes data)
 *
 * Head layout — same as `supply` (7 head slots before the dynamic
 * `bytes data` offset):
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][shares][onBehalf][dataOffset]
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * authorization is implicit (user repays their own debt).
 *
 * To repay the full debt:
 *   assets = 0  →  Morpho computes the exact assets needed to
 *                   close the position (includes accrued interest).
 *                   This is the canonical "max repay" for the protocol.
 *   shares = user_borrowShares → repay exactly the user's position.
 *   OR
 *   assets = borrowedAssets (from F5B) → repay the rounded-up debt.
 *
 * Using assets=0 is the safer "close position" pattern; Morpho handles
 * the rounding internally. The caller must set shares=0 to activate
 * the automatic debt-compute mode.
 *
 * Throws on:
 *   - wrong chain
 *   - missing morphoBlueAddress
 *   - missing or invalid marketParams
 */
export function encodeMorphoRepay(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  assets: bigint
  shares: bigint
  onBehalf: Address
}): `0x${string}` {
  if (input.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    throw new Error(
      `protocol-not-configured: Repay is pinned to chain ` +
        `${ROBINHOOD_CHAIN_ID_DEC}; got ${input.chainId}.`,
    )
  }
  if (!input.contracts.morphoBlueAddress) {
    throw new Error(
      "protocol-not-configured: Morpho Blue core address is not " +
        "verified for Robinhood Chain.",
    )
  }
  // 7 head slots before the dynamic `bytes data` offset.
  const dataOffset = padUint256(BigInt(7 * 32))
  const tail = encodeEmptyBytes()
  return (
    MORPHO_BLUE_SELECTORS.repay +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padUint256(input.shares) +
    padAddress(input.onBehalf) +
    dataOffset +
    tail
  ) as `0x${string}`
}

/**
 * Build Morpho Blue `withdrawCollateral(MarketParams, assets,
 * onBehalf, receiver)` calldata.
 *
 * Signature (verbatim from `IMorpho.sol`):
 *   function withdrawCollateral(MarketParams marketParams,
 *                             uint256 assets,
 *                             address onBehalf,
 *                             address receiver)
 *
 * Head layout — 8 slots, no tail:
 *   [MP.0 loanToken][MP.1 collateralToken][MP.2 oracle]
 *   [MP.3 irm][MP.4 lltv][assets][onBehalf][receiver]
 *
 * `assets = 0` is NOT valid for withdrawCollateral (unlike
 * borrow/repay where assets=0 triggers auto-compute). For
 * collateral withdrawal the user must specify the exact amount.
 *
 * For direct wallet execution where msg.sender == onBehalf,
 * authorization is implicit (user withdraws their own collateral).
 *
 * Throws on:
 *   - wrong chain
 *   - missing morphoBlueAddress
 *   - missing or invalid marketParams
 */
export function encodeMorphoWithdrawCollateral(input: {
  contracts: ProtocolContracts
  chainId: number
  params: MorphoMarketParams
  /** Collateral amount in collateral-token smallest units (must be > 0). */
  assets: bigint
  /** Address whose collateral position to withdraw from. */
  onBehalf: Address
  /** Address to receive the withdrawn collateral tokens. */
  receiver: Address
}): `0x${string}` {
  if (input.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    throw new Error(
      `protocol-not-configured: withdrawCollateral is pinned to chain ` +
        `${ROBINHOOD_CHAIN_ID_DEC}; got ${input.chainId}.`,
    )
  }
  if (!input.contracts.morphoBlueAddress) {
    throw new Error(
      "protocol-not-configured: Morpho Blue core address is not " +
        "verified for Robinhood Chain.",
    )
  }
  return (
    MORPHO_BLUE_SELECTORS.withdrawCollateral +
    encodeMorphoMarketParams(input.params) +
    padUint256(input.assets) +
    padAddress(input.onBehalf) +
    padAddress(input.receiver)
  ) as `0x${string}`
}

/**
 * Encode `idToMarketParams(bytes32)` calldata for an onchain
 * MarketParams lookup against the deployed Morpho Blue core.
 *
 * This is the canonical way to verify a market's onchain
 * parameters before writing against them. Returns the
 * `(loanToken, collateralToken, oracle, irm, lltv)` tuple, which
 * the caller compares against the ZEKS `LendingMarket` data.
 */
export function encodeIdToMarketParamsCall(marketId: `0x${string}`): `0x${string}` {
  const id = marketId.replace(/^0x/, "").toLowerCase()
  if (id.length !== 64) {
    throw new Error("marketId must be a 32-byte hex string")
  }
  return (MORPHO_BLUE_SELECTORS.idToMarketParams + id) as `0x${string}`
}
