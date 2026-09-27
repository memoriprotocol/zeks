"use client"

/**
 * useRepayReadiness — read-only repay gate.
 *
 * Phase F7B. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: determine whether the connected wallet is ready to send a
 * Morpho Blue `repay(...)` transaction against an existing position.
 *
 * This hook follows the F2A (loan-token supply) and F5D (collateral
 * supply) pattern exactly — it never reads chain state directly. The
 * caller is responsible for:
 *
 *   - providing the F5B `borrowedAssets` (bigint, loan-token units)
 *   - providing the live `allowance` of the loan token to Morpho Blue
 *     (read from `allowance(owner, spender)`)
 *   - providing the loan-token decimals and address
 *
 * Special case: the F6C repay flow supports a "full position close"
 * by passing `assets = 0` so Morpho computes the actual close amount
 * (including accrued interest) internally. This hook accepts
 * `amount = ""` as the user opting into the "full repayment" mode
 * — but only when `borrowedAssets > 0`.
 *
 * Allowance rule:
 *   - For partial repay (amount > 0): need `allowance >= amount`.
 *     If `allowance < amount`, the readiness is `approval-required`
 *     and the UI should guide the user to `useApprovalTransaction`
 *     (F2B — same approval infrastructure the supply flow uses).
 *   - For full repay (amount == "" / represents 0): the F6C hook's
 *     allowance ceiling uses `toAssetsUp(borrowShares, ...)` —
 *     not `borrowedAssets`. This gate is a READ-ONLY structural
 *     pre-check; the F6C writer (useRepayTransaction) is
 *     authoritative on allowance adequacy.
 *
 * State machine:
 *
 *   Disconnected
 *     -> WrongNetwork
 *     -> Loading                (balance / allowance / position loading)
 *     -> ReadyToRepay           (amount <= debt, allowance sufficient
 *                                OR amount is the full-repay sentinel)
 *     -> ApprovalRequired       (allowance < amount; user must approve)
 *     -> NoDebt                 (borrowedAssets == 0)
 *     -> ExceedsDebt            (amount > debt)
 *     -> InsufficientBalance    (typed amount > wallet balance)
 *     -> InvalidAmount          (NaN / negative / no loan token)
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export type RepayReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "loading" }
  | {
      kind: "ready-to-repay"
      /** Outstanding debt (loan-token units, bigint). */
      outstandingDebt: bigint
      /**
       * The user's typed amount (loan-token units, bigint).
       * `0n` means the user opted into a full-repay close.
       */
      amount: bigint
      /** `true` if `amount === 0n`, signaling a full-close flow. */
      isFullRepay: boolean
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "approval-required"
      /** Current allowance (loan-token units, bigint). */
      allowance: bigint
      /** What the user is trying to repay (loan-token units, bigint). */
      attempted: bigint
      /** Allowance still needed (bigint). */
      missing: bigint
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "no-debt"
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "exceeds-debt"
      /** The user's typed amount (loan-token units, bigint). */
      attempted: bigint
      /** Outstanding debt (loan-token units, bigint). */
      outstandingDebt: bigint
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "insufficient-balance"
      /** Wallet's loan-token balance (bigint). */
      balance: bigint
      /** Amount the user wants to repay (bigint). */
      required: bigint
      loanToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "invalid-amount"
      reason:
        | "zero"
        | "nan"
        | "negative"
        | "no-loan-token"
        | "no-loan-decimals"
        | "no-market-id"
    }

export interface RepayReadinessInput {
  market: LendingMarket
  /** Typed amount string from the repay input field. Empty string === full-repay sentinel. */
  amount: string
  loanToken: {
    address: `0x${string}` | null
    symbol: string | null
    decimals: number | null
  }
  /** F5B `borrowedAssets` (loan-token units, bigint). `null` while loading. */
  outstandingDebt: bigint | null
  /** Wallet's loan-token balance (loan-token units, bigint). `null` while loading. */
  walletBalance: bigint | null
  /** Allowance of loan-token to Morpho Blue (loan-token units, bigint). `null` while loading. */
  allowance: bigint | null
  refreshTick?: number
}

/* ------------------------------------------------------ */
/* Amount parsing (mirrors F2A / F5D)                       */
/* ------------------------------------------------------ */

function pow10Big(n: number): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < n; i++) r *= ten
  return r
}

function parseLoanAmount(raw: string, decimals: number): bigint | null {
  if (!raw || raw.trim() === "") return null
  const trimmed = raw.trim()
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null
  if (trimmed === "" || trimmed === ".") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (!/^[0-9]+$/.test(whole) || !/^[0-9]*$/.test(frac)) return null
  if (frac.length > decimals) return null
  try {
    const factor = pow10Big(decimals)
    const wholeBig = BigInt(whole === "" ? "0" : whole) * factor
    const fracBig = frac
      ? BigInt(frac.padEnd(decimals, "0").slice(0, decimals))
      : BigInt(0)
    return wholeBig + fracBig
  } catch {
    return null
  }
}

/* ------------------------------------------------------ */
/* Hook                                                    */
/* ------------------------------------------------------ */

export function useRepayReadiness(input: RepayReadinessInput): RepayReadiness {
  const wallet = useWallet()
  const { market, amount, loanToken, outstandingDebt, walletBalance, allowance } =
    input

  const resolvedLoanToken = {
    address: loanToken.address,
    symbol: loanToken.symbol,
    decimals: loanToken.decimals,
  }

  if (!market.marketId) {
    return { kind: "invalid-amount", reason: "no-market-id" }
  }
  if (loanToken.address === null) {
    return { kind: "invalid-amount", reason: "no-loan-token" }
  }
  if (loanToken.decimals === null) {
    return { kind: "invalid-amount", reason: "no-loan-decimals" }
  }

  if (wallet.status !== "connected") {
    return { kind: "disconnected" }
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
  }

  // Wait for the underlying F5B + ERC20 reads.
  if (
    outstandingDebt === null ||
    walletBalance === null ||
    allowance === null
  ) {
    return { kind: "loading" }
  }

  // No outstanding debt at all — nothing to repay.
  if (outstandingDebt === BigInt(0)) {
    return {
      kind: "no-debt",
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  // Empty amount means the user opted into full-repay mode.
  const isFullRepay = amount.trim() === ""
  let parsed: bigint | null = BigInt(0)
  if (!isFullRepay) {
    parsed = parseLoanAmount(amount, loanToken.decimals)
    if (parsed === null) {
      return { kind: "invalid-amount", reason: "nan" }
    }
    if (parsed < BigInt(0)) {
      return { kind: "invalid-amount", reason: "negative" }
    }
    if (parsed === BigInt(0)) {
      return { kind: "invalid-amount", reason: "zero" }
    }
  }

  const repayAmount = parsed as bigint

  // Partial repay validation — must not exceed outstanding debt.
  if (!isFullRepay && repayAmount > outstandingDebt) {
    return {
      kind: "exceeds-debt",
      attempted: repayAmount,
      outstandingDebt,
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  // Allowance check for partial repay. Full-repay allowance is the
  // F6C writer's responsibility (it uses toAssetsUp, not borrowedAssets).
  if (!isFullRepay && allowance < repayAmount) {
    return {
      kind: "approval-required",
      allowance,
      attempted: repayAmount,
      missing: repayAmount - allowance,
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  // Balance check. For full-repay the F6C writer uses toAssetsUp, but
  // for the gate we conservatively require balance >= outstandingDebt.
  const effectiveAmount = isFullRepay ? outstandingDebt : repayAmount
  if (walletBalance < effectiveAmount) {
    return {
      kind: "insufficient-balance",
      balance: walletBalance,
      required: effectiveAmount,
      loanToken: resolvedLoanToken as {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      },
    }
  }

  return {
    kind: "ready-to-repay",
    outstandingDebt,
    amount: repayAmount,
    isFullRepay,
    loanToken: resolvedLoanToken as {
      address: `0x${string}`
      symbol: string | null
      decimals: number
    },
  }
}
