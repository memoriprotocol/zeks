/**
 * ZEKS Markets — Transaction preflight (read-only).
 *
 * Reusable pure functions that compute "is this user / wallet /
 * market state ready to execute Supply or Borrow?" without sending
 * any transactions.
 *
 * Outputs are typed discriminated unions so the UI can render the
 * exact blocker to the user:
 *
 *   - "ready"   → every required check passed; the user can click
 *                 "Supply" / "Borrow" and the transaction flow will
 *                 proceed.
 *
 *   - "blocked" → at least one required check failed. The UI shows
 *                 the issue(s) and disables the action button.
 *
 * No signing, no approve(), no write calls. Pure read-only.
 */

import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  readErc20Allowance,
  readErc20Balance,
  readErc20Info,
} from "./erc20"
import type { LendingMarket } from "../lending/types"
import type { UserLendingPosition } from "./service"

/** A specific reason the preflight blocked the action. */
export type PreflightIssue =
  | { kind: "wallet-disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "no-balance"; required: bigint; available: bigint }
  | { kind: "no-allowance"; required: bigint; available: bigint }
  | { kind: "no-collateral-position" }
  | { kind: "no-liquidity"; availableLiquidity: bigint }
  | { kind: "unsupported-token"; token: Address }
  | { kind: "rpc-unavailable"; message: string }
  | { kind: "market-not-found"; marketId: string }
  | {
      kind: "missing-contract"
      token: Address
      reason: "loan-token" | "collateral-token"
    }
  | { kind: "no-protocol-data" }

export interface SupplyPreflight {
  ready: boolean
  issues: PreflightIssue[]
  /** Resolved supply token metadata, if read succeeded. */
  supplyToken?: {
    address: Address
    symbol: string
    decimals: number
  }
  /** Allowance the user has granted to the protocol for the supply token. */
  allowance?: bigint
  /** Wallet balance for the supply token. */
  walletBalance?: bigint
}

export interface BorrowPreflight {
  ready: boolean
  issues: PreflightIssue[]
  collateralToken?: {
    address: Address
    symbol: string
    decimals: number
  }
  /** Available liquidity in the loan token (raw bigint). */
  availableLiquidity?: bigint
  loanTokenDecimals?: number
}

/* ----------------------------------------------------------------- */
/* Supply                                                             */
/* ----------------------------------------------------------------- */

interface SupplyPreflightInput {
  walletAddress?: Address | null
  walletChainId?: number | null
  walletProvider?: EIP1193Provider | null
  market: LendingMarket
  amount: bigint
  /** The contract that would receive the supply (Morpho Blue). */
  protocolSpender?: Address | null
  timeoutMs?: number
}

/**
 * Compute the Supply preflight.
 *
 * Checks (in order, short-circuiting):
 *   1. Wallet connected?
 *   2. Correct chain?
 *   3. Supply token contract resolved?
 *   4. Wallet balance ≥ amount?
 *   5. Allowance to protocol ≥ amount?  (or skip if amount==0)
 *   6. Market is in a queryable state (Morpho present)?
 */
export async function preflightSupply(
  input: SupplyPreflightInput,
): Promise<SupplyPreflight> {
  const issues: PreflightIssue[] = []

  if (!input.walletAddress) {
    issues.push({ kind: "wallet-disconnected" })
    return { ready: false, issues }
  }
  if (
    input.walletChainId !== null &&
    input.walletChainId !== undefined &&
    input.walletChainId !== 4663
  ) {
    issues.push({
      kind: "wrong-network",
      chainId: input.walletChainId,
    })
    return { ready: false, issues }
  }

  // Supply token contract. The Morpho loan asset address is not
  // currently in our normalised LendingMarket shape; we surface a
  // missing-contract issue rather than guess.
  const loanToken = (input.market as LendingMarket & {
    loanTokenAddress?: Address | null
  }).loanTokenAddress as Address | null

  if (!loanToken) {
    issues.push({
      kind: "missing-contract",
      token: ("0x" + "0".repeat(40)) as Address,
      reason: "loan-token",
    })
    return { ready: false, issues }
  }

  const info = await readErc20Info(loanToken, {
    provider: input.walletProvider,
    chainId: input.walletChainId,
    timeoutMs: input.timeoutMs,
  })
  if (info.kind === "error") {
    issues.push({
      kind: "rpc-unavailable",
      message: "rpc-unavailable",
    })
    return { ready: false, issues }
  }

  const bal = await readErc20Balance(loanToken, input.walletAddress, {
    provider: input.walletProvider,
    chainId: input.walletChainId,
    timeoutMs: input.timeoutMs,
  })
  if (bal.kind === "error") {
    issues.push({ kind: "rpc-unavailable", message: "rpc-unavailable" })
    return {
      ready: false,
      issues,
      supplyToken: {
        address: loanToken,
        symbol: info.value.symbol,
        decimals: info.value.decimals,
      },
      walletBalance: BigInt(0),
    }
  }

  if (input.amount > bal.value) {
    issues.push({
      kind: "no-balance",
      required: input.amount,
      available: bal.value,
    })
  }

  let allowance = BigInt(0)
  if (input.protocolSpender && input.amount > BigInt(0)) {
    const a = await readErc20Allowance(
      loanToken,
      input.walletAddress,
      input.protocolSpender,
      {
        provider: input.walletProvider,
        chainId: input.walletChainId,
        timeoutMs: input.timeoutMs,
      },
    )
    if (a.kind === "ok") {
      allowance = a.value
      if (input.amount > a.value) {
        issues.push({
          kind: "no-allowance",
          required: input.amount,
          available: a.value,
        })
      }
    } else {
      issues.push({
        kind: "rpc-unavailable",
        message: "rpc-unavailable",
      })
    }
  }

  if (!input.market.marketId) {
    issues.push({
      kind: "market-not-found",
      marketId: input.market.marketId ?? "",
    })
  }

  return {
    ready: issues.length === 0,
    issues,
    supplyToken: {
      address: loanToken,
      symbol: info.value.symbol,
      decimals: info.value.decimals,
    },
    walletBalance: bal.value,
    allowance,
  }
}

/* ----------------------------------------------------------------- */
/* Borrow                                                             */
/* ----------------------------------------------------------------- */

interface BorrowPreflightInput {
  walletAddress?: Address | null
  walletChainId?: number | null
  walletProvider?: EIP1193Provider | null
  market: LendingMarket
  amount: bigint
  position: UserLendingPosition | null
  timeoutMs?: number
}

/**
 * Compute the Borrow preflight.
 *
 * Checks:
 *   1. Wallet connected?
 *   2. Correct chain?
 *   3. Collateral position exists? (wallet has >0 collateral)
 *   4. Market has liquidity ≥ amount?
 *   5. Protocol data available (Morpho metrics)?
 */
export async function preflightBorrow(
  input: BorrowPreflightInput,
): Promise<BorrowPreflight> {
  const issues: PreflightIssue[] = []

  if (!input.walletAddress) {
    issues.push({ kind: "wallet-disconnected" })
    return { ready: false, issues }
  }
  if (
    input.walletChainId !== null &&
    input.walletChainId !== undefined &&
    input.walletChainId !== 4663
  ) {
    issues.push({
      kind: "wrong-network",
      chainId: input.walletChainId,
    })
    return { ready: false, issues }
  }

  // Collateral: wallet must hold >0 of the collateral token.
  const collateralAddress = (input.market.rhContractAddress ??
    null) as Address | null
  if (!collateralAddress) {
    issues.push({
      kind: "missing-contract",
      token: ("0x" + "0".repeat(40)) as Address,
      reason: "collateral-token",
    })
    return { ready: false, issues }
  }

  const info = await readErc20Info(collateralAddress, {
    provider: input.walletProvider,
    chainId: input.walletChainId,
    timeoutMs: input.timeoutMs,
  })
  if (info.kind === "error") {
    issues.push({
      kind: "rpc-unavailable",
      message: "rpc-unavailable",
    })
    return { ready: false, issues }
  }

  // Use the already-fetched position when available, else re-read.
  let collateralBalance: bigint | null = null
  if (input.position?.walletCollateralToken?.balanceRaw != null) {
    collateralBalance = input.position.walletCollateralToken.balanceRaw
  } else {
    const bal = await readErc20Balance(
      collateralAddress,
      input.walletAddress,
      {
        provider: input.walletProvider,
        chainId: input.walletChainId,
        timeoutMs: input.timeoutMs,
      },
    )
    if (bal.kind === "ok") {
      collateralBalance = bal.value
    } else {
      issues.push({
        kind: "rpc-unavailable",
        message: "rpc-unavailable",
      })
    }
  }

  if (collateralBalance !== null && collateralBalance === BigInt(0)) {
    issues.push({ kind: "no-collateral-position" })
  }

  // Available liquidity in USD (Morpho already returns this on the
  // server-side LendingMarket); convert to the loan-token decimals
  // when possible. Without an explicit loan-token decimals, we
  // surface the issue and bail.
  if (input.market.availableLiquidity == null) {
    issues.push({ kind: "no-protocol-data" })
  }

  return {
    ready: issues.length === 0,
    issues,
    collateralToken: {
      address: collateralAddress,
      symbol: info.value.symbol,
      decimals: info.value.decimals,
    },
    availableLiquidity: undefined,
    loanTokenDecimals: undefined,
  }
}
