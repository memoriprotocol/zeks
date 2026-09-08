/**
 * ZEKS Markets — User lending position model + service.
 *
 * Read-only onchain reads that build the per-wallet, per-market
 * position view used by the lending detail page.
 *
 * This module NEVER:
 *   - Executes write transactions
 *   - Approves tokens
 *   - Prompts the wallet
 *   - Caches results across mounts
 *
 * Every read is a fresh eth_call against the wallet's RPC (preferred)
 * or the public RPC (fallback). The wallet is the source of truth —
 * we never infer ownership from cached UI state.
 */

import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { ROBINHOOD_PUBLIC_RPC_URL } from "./rpc"
import {
  readErc20Info,
  readErc20Balance,
  type Erc20Info,
} from "./erc20"
import type { LendingMarket } from "../lending/types"

/** One per-asset leg of a user's position. */
export interface PositionAssetLeg {
  /** Token contract address. */
  contractAddress: Address
  /** Token symbol as resolved from the onchain contract. */
  symbol: string
  /** ERC20 decimals. */
  decimals: number
  /**
   * Raw balance in token units (no decimals applied). For wallet
   * balances this is the caller's own token balance; for protocol
   * balances this is the user's onchain position in the lending
   * pool. `null` when the read failed.
   */
  balanceRaw: bigint | null
  /**
   * USD value of `balanceRaw` at the current oracle / reference
   * market price. `null` when no price is available.
   */
  balanceUsd: number | null
  /**
   * Where this balance was read from.
   *   - "wallet"      → user's own ERC20 balance
   *   - "morpho"      → Morpho Blue market accounting (future)
   *   - "chainlink"   → derived from a Chainlink oracle price
   *   - "unknown"     → read failed or not applicable
   */
  source: PositionDataSource
}

/**
 * Source provenance for a balance / value entry.
 *
 * The UI surfaces this in the position card so users can verify
 * which upstream system produced the number.
 */
export type PositionDataSource =
  | "wallet"
  | "morpho"
  | "chainlink"
  | "robinhood-reference-market"
  | "unknown"

/** Read-only user position for one lending market. */
export interface UserLendingPosition {
  wallet: {
    /** Connected wallet address. Null when disconnected. */
    address: Address | null
    /** Robinhood Chain ID the wallet is on (or null when unknown). */
    chainId: number | null
    /** When the wallet is connected to a non-Robinhood chain. */
    wrongNetwork: boolean
    /** Snapshot timestamp (ISO). */
    fetchedAt: string
  }
  /** Wallet balance for the SUPPLY token (loan asset). */
  walletSupplyToken: PositionAssetLeg | null
  /** Wallet balance for the COLLATERAL token (asset posted as collateral). */
  walletCollateralToken: PositionAssetLeg | null
  /** Protocol-side (Morpho) supplied balance for the user. Future. */
  protocolSupplied: PositionAssetLeg | null
  /** Protocol-side (Morpho) borrowed balance for the user. Future. */
  protocolBorrowed: PositionAssetLeg | null
  /** Borrow exposure in USD. Null when not computable. */
  borrowExposureUsd: number | null
  /** Whether the user has any position at all. */
  hasAnyPosition: boolean
  /** Issues that prevent the UI from showing accurate numbers. */
  issues: PositionIssue[]
}

/** Issue encountered while resolving the position. */
export type PositionIssue =
  | { kind: "wallet-disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "rpc-unavailable"; message: string }
  | { kind: "unsupported-token"; token: Address }
  | { kind: "missing-contract"; token: Address }
  | { kind: "no-position" }

/** Read-only protocol snapshot for a single Morpho Blue market. */
export interface MarketLendingSnapshot {
  /** Morpho market id (32-byte hex). */
  marketId: string
  /** Loan asset address (the token being supplied). */
  loanTokenAddress: Address | null
  /** Collateral asset address (posted by borrowers). */
  collateralTokenAddress: Address | null
  /** Loan token symbol (from the onchain contract). */
  loanTokenSymbol: string | null
  /** Collateral token symbol (from the onchain contract). */
  collateralTokenSymbol: string | null
  /** Loan token decimals. */
  loanTokenDecimals: number | null
  /** Collateral token decimals. */
  collateralTokenDecimals: number | null
  /** Snapshot timestamp. */
  fetchedAt: string
  /** Issues encountered. */
  issues: PositionIssue[]
}

/**
 * Fetch the user's read-only lending position for one market.
 *
 * Behaviour matrix:
 *
 *   wallet disconnected          → wallet.* are null, issues include
 *                                  "wallet-disconnected". No RPC calls.
 *
 *   wallet on wrong chain        → wallet.address is set, wallet.chainId
 *                                  is set, wrongNetwork=true. Public RPC
 *                                  still used for reads (no popup).
 *
 *   wallet connected, on chain   → reads route through the wallet RPC.
 *
 *   token contract not deployed  → PositionIssue "missing-contract"
 *
 *   token doesn't respond        → PositionIssue "rpc-unavailable"
 *
 *   token returns no data        → PositionIssue "unsupported-token"
 *
 * In every case the function RESOLVES with a `UserLendingPosition`;
 * it never throws.
 */
export async function fetchUserLendingPosition(
  market: LendingMarket,
  options: {
    walletAddress?: Address | null
    walletChainId?: number | null
    walletProvider?: EIP1193Provider | null
    timeoutMs?: number
    /**
     * Override the loan-token contract (e.g. when Morpho's
     * `loanAssetAddress` is known but the wallet's portfolio wants
     * to read a specific token). Defaults to the Morpho loan asset.
     */
    loanTokenOverride?: Address | null
  } = {},
): Promise<UserLendingPosition> {
  const fetchedAt = new Date().toISOString()
  const issues: PositionIssue[] = []

  // ── 1. Wallet state ─────────────────────────────────────────
  const walletConnected = Boolean(options.walletAddress)
  const onRobinhood =
    options.walletChainId === 4663 ||
    options.walletChainId === undefined
  if (!walletConnected) {
    return emptyPosition(null, null, false, fetchedAt, [
      { kind: "wallet-disconnected" },
    ])
  }
  if (!onRobinhood) {
    issues.push({
      kind: "wrong-network",
      chainId: options.walletChainId ?? -1,
    })
  }

  const walletAddr = options.walletAddress as Address

  // ── 2. Determine contract addresses ─────────────────────────
  // Collateral contract: prefer the official Robinhood deployment
  // from the asset registry. Fall back to nothing (issue).
  const collateralContract = (market.rhContractAddress ??
    null) as Address | null
  // Loan contract: not yet known from Morpho (the GraphQL response
  // doesn't include the loan token address — that is exposed via
  // `idToMarketParams` on-chain). Surface as null and let the
  // caller resolve later.
  const loanContract = (options.loanTokenOverride ??
    null) as Address | null

  // ── 3. Read collateral token metadata + wallet balance ──────
  let walletCollateralToken: PositionAssetLeg | null = null
  if (collateralContract) {
    const info = await readErc20Info(collateralContract, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (info.kind === "error") {
      issues.push(toIssue(info.error, collateralContract))
    } else {
      const balanceRes = await readErc20Balance(
        collateralContract,
        walletAddr,
        {
          provider: options.walletProvider,
          chainId: options.walletChainId,
          timeoutMs: options.timeoutMs,
        },
      )
      const balanceRaw =
        balanceRes.kind === "ok" ? balanceRes.value : null
      if (balanceRes.kind === "error") {
        issues.push(toIssue(balanceRes.error, collateralContract))
      }
      const balanceUsd = deriveUsd(
        balanceRaw,
        info.value.decimals,
        market.oraclePrice ?? market.referencePrice ?? null,
      )
      walletCollateralToken = {
        contractAddress: collateralContract,
        symbol: info.value.symbol,
        decimals: info.value.decimals,
        balanceRaw,
        balanceUsd,
        source: "wallet",
      }
    }
  } else {
    issues.push({
      kind: "missing-contract",
      token: "0x0000000000000000000000000000000000000000" as Address,
    })
  }

  // ── 4. Read loan token metadata + wallet balance (if known) ─
  let walletSupplyToken: PositionAssetLeg | null = null
  if (loanContract) {
    const info = await readErc20Info(loanContract, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (info.kind === "error") {
      issues.push(toIssue(info.error, loanContract))
    } else {
      const balanceRes = await readErc20Balance(
        loanContract,
        walletAddr,
        {
          provider: options.walletProvider,
          chainId: options.walletChainId,
          timeoutMs: options.timeoutMs,
        },
      )
      const balanceRaw =
        balanceRes.kind === "ok" ? balanceRes.value : null
      if (balanceRes.kind === "error") {
        issues.push(toIssue(balanceRes.error, loanContract))
      }
      const balanceUsd = deriveUsd(
        balanceRaw,
        info.value.decimals,
        market.referencePrice ?? null,
      )
      walletSupplyToken = {
        contractAddress: loanContract,
        symbol: info.value.symbol,
        decimals: info.value.decimals,
        balanceRaw,
        balanceUsd,
        source: "wallet",
      }
    }
  }

  // ── 5. Protocol-side balances (Morpho) ───────────────────────
  // Direct Morpho Blue position reads (loanShares / collateral)
  // require `idToMarketParams` + position decoding. We surface
  // this as null with a clear future-phase marker.
  const protocolSupplied: PositionAssetLeg | null = null
  const protocolBorrowed: PositionAssetLeg | null = null

  const hasAnyPosition =
    (walletSupplyToken?.balanceRaw != null &&
      walletSupplyToken.balanceRaw > BigInt(0)) ||
    (walletCollateralToken?.balanceRaw != null &&
      walletCollateralToken.balanceRaw > BigInt(0)) ||
    protocolSupplied != null ||
    protocolBorrowed != null

  if (!hasAnyPosition && issues.length === 0) {
    issues.push({ kind: "no-position" })
  }

  return {
    wallet: {
      address: walletAddr,
      chainId: options.walletChainId ?? null,
      wrongNetwork: !onRobinhood,
      fetchedAt,
    },
    walletSupplyToken,
    walletCollateralToken,
    protocolSupplied,
    protocolBorrowed,
    borrowExposureUsd: null, // future: protocol-borrowed × oracle price
    hasAnyPosition,
    issues,
  }
}

/**
 * Read-only onchain snapshot of a Morpho Blue market. Resolves the
 * loan and collateral token addresses + metadata. Used by the
 * preflight layer.
 */
export async function readMarketLendingSnapshot(
  market: LendingMarket,
  options: {
    walletProvider?: EIP1193Provider | null
    walletChainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<MarketLendingSnapshot> {
  const fetchedAt = new Date().toISOString()
  const issues: PositionIssue[] = []

  const collateralAddress = (market.rhContractAddress ??
    null) as Address | null
  const loanAddress = (extractLoanTokenAddress(market) ??
    null) as Address | null

  let loanTokenSymbol: string | null = null
  let loanTokenDecimals: number | null = null
  if (loanAddress) {
    const r = await readErc20Info(loanAddress, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (r.kind === "ok") {
      loanTokenSymbol = r.value.symbol
      loanTokenDecimals = r.value.decimals
    } else {
      issues.push(toIssue(r.error, loanAddress))
    }
  }

  let collateralTokenSymbol: string | null = null
  let collateralTokenDecimals: number | null = null
  if (collateralAddress) {
    const r = await readErc20Info(collateralAddress, {
      provider: options.walletProvider,
      chainId: options.walletChainId,
      timeoutMs: options.timeoutMs,
    })
    if (r.kind === "ok") {
      collateralTokenSymbol = r.value.symbol
      collateralTokenDecimals = r.value.decimals
    } else {
      issues.push(toIssue(r.error, collateralAddress))
    }
  }

  return {
    marketId: market.marketId ?? "",
    loanTokenAddress: loanAddress,
    collateralTokenAddress: collateralAddress,
    loanTokenSymbol,
    collateralTokenSymbol,
    loanTokenDecimals,
    collateralTokenDecimals,
    fetchedAt,
    issues,
  }
}

/**
 * Convenience extractor — Morpho's GraphQL exposes loan-token SYMBOL
 * (`loanAssetSymbol`), but NOT its chain-address directly inside our
 * normalised LendingMarket shape yet. Until that is added, we rely
 * on the upstream Morpho data being correct. Future phase: extend
 * LendingMarket with `loanTokenAddress`.
 */
function extractLoanTokenAddress(market: LendingMarket): Address | null {
  // Some Morpho responses on the raw provider carry loanAssetAddress
  // but our normalised shape does not. Until that field is added,
  // we return null and the caller falls back gracefully.
  const m = market as LendingMarket & { loanTokenAddress?: string | null }
  return (m.loanTokenAddress ?? null) as Address | null
}

function deriveUsd(
  raw: bigint | null,
  decimals: number,
  price: number | null,
): number | null {
  if (raw == null || price == null) return null
  if (raw === BigInt(0)) return 0
  const denom = pow10(BigInt(decimals))
  // Number division loses precision above Number.MAX_SAFE_INTEGER,
  // but realistic ERC20 balances stay well under 1e30.
  const asNumber = Number(raw) / Number(denom)
  if (!Number.isFinite(asNumber)) return null
  return asNumber * price
}

function pow10(n: bigint): bigint {
  let result = BigInt(1)
  for (let i = 0; i < Number(n); i++) {
    result = result * BigInt(10)
  }
  return result
}

function toIssue(
  error: import("./rpc").RpcReadError,
  token: Address,
): PositionIssue {
  switch (error.kind) {
    case "no-provider":
      return { kind: "wallet-disconnected" }
    case "wrong-network":
      return { kind: "wrong-network", chainId: error.chainId }
    case "rpc-unavailable":
      return { kind: "rpc-unavailable", message: error.message }
    case "unsupported-token":
      return { kind: "unsupported-token", token }
    case "no-data":
      return { kind: "unsupported-token", token }
    case "malformed-response":
      return {
        kind: "rpc-unavailable",
        message: "Malformed RPC response",
      }
    case "timeout":
      return { kind: "rpc-unavailable", message: "RPC timed out" }
  }
}

function emptyPosition(
  address: Address | null,
  chainId: number | null,
  wrongNetwork: boolean,
  fetchedAt: string,
  issues: PositionIssue[],
): UserLendingPosition {
  return {
    wallet: { address, chainId, wrongNetwork, fetchedAt },
    walletSupplyToken: null,
    walletCollateralToken: null,
    protocolSupplied: null,
    protocolBorrowed: null,
    borrowExposureUsd: null,
    hasAnyPosition: false,
    issues,
  }
}

/** Exposed for diagnostic logging — the underlying public RPC URL. */
export const LENDING_PUBLIC_RPC_URL = ROBINHOOD_PUBLIC_RPC_URL
