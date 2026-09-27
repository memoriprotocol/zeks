"use client"

/**
 * useSupplyReadiness — read-only supply-side gate.
 *
 * Phase F2A. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * What this hook does:
 *   1. Resolves the canonical Morpho Blue core address on Robinhood Chain.
 *   2. Resolves the market's loan-token metadata (address, symbol, decimals)
 *      from the LendingMarket row that the page already provides.
 *   3. Reads the connected wallet's REAL balance of the loan token via
 *      `balanceOf(address)` (eth_call).
 *   4. Reads the REAL allowance of the loan token to Morpho Blue via
 *      `allowance(owner, spender)` (eth_call).
 *   5. Reads the wallet's REAL Morpho supply position via
 *      `position(bytes32 id, address user)` (eth_call).
 *   6. Derives a deterministic UI state machine:
 *
 *        Disconnected
 *          -> WrongNetwork (when authorized but on chain != 4663)
 *          -> Loading (balance / allowance / position in flight)
 *          -> Ready                  (valid amount, allowance sufficient)
 *          -> ApprovalRequired       (valid amount, allowance insufficient)
 *          -> InsufficientBalance    (amount > balance)
 *          -> InvalidAmount          (NaN / negative / zero)
 *
 *      Note: this hook never produces `Approving`, `ApprovalConfirmed`,
 *      `Supplying`, `Pending`, or `Confirmed` — those belong to F2B/F2C.
 *
 * The CTA in `earn-detail.tsx` consumes this state. It does NOT
 * introduce a separate transaction architecture: every write path is
 * still gated off until later phases.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import { readErc20Allowance, readErc20Balance } from "@/lib/markets/onchain/erc20"
import {
  readMorphoPosition,
  type MorphoPosition,
} from "@/lib/markets/onchain/morpho-position"

export type SupplyReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | {
      kind: "loading"
      subkind: "balance" | "allowance" | "position"
    }
  | {
      kind: "ready"
      balance: bigint
      allowance: bigint
      position: MorphoPosition | null
    }
  | {
      kind: "approval-required"
      balance: bigint
      allowance: bigint
      missing: bigint
      position: MorphoPosition | null
    }
  | {
      kind: "insufficient-balance"
      balance: bigint
      allowance: bigint
      required: bigint
      position: MorphoPosition | null
    }
  | {
      kind: "invalid-amount"
      balance: bigint
      allowance: bigint
      reason: "zero" | "nan" | "negative"
      position: MorphoPosition | null
    }
  | {
      kind: "market-unconfigured"
      reason: "no-loan-token" | "no-market-id" | "no-decimals"
    }
  // --- WITHDRAW states (F3B) ---
  | {
      kind: "invalid-withdraw-amount"
      reason: "zero" | "nan" | "negative"
    }
  | {
      kind: "no-position"
      /** Message explaining why withdrawal is not available. */
      message: string
    }
  | {
      kind: "exceeds-supplied"
      /** Amount the user tried to withdraw (raw). */
      attempted: bigint
      /** The user's current supplied assets (raw). */
      suppliedAssets: bigint
    }
  | {
      kind: "exceeds-withdrawable"
      /** Amount the user tried to withdraw (raw). */
      attempted: bigint
      /** The max currently withdrawable (raw). */
      maxWithdrawable: bigint
    }
  | {
      kind: "ready-to-withdraw"
      /** Max assets withdrawable right now (raw, loan-token units). */
      maxWithdrawable: bigint
      /** The user's current supplied assets (raw, loan-token units). */
      suppliedAssets: bigint
    }

export interface LoanTokenMeta {
  address: `0x${string}` | null
  symbol: string | null
  decimals: number | null
}

export interface SupplyReadinessInput {
  market: LendingMarket
  amount: string
  /**
   * Which tab is active. Controls whether SUPPLY or WITHDRAW
   * readiness logic is applied.
   *
   * F7 extension: BORROW / REPAY / WITHDRAW_COLLATERAL tabs are
   * honored as recognized values but readiness for those is
   * delegated to the dedicated F7 hooks (useBorrowReadiness,
   * useRepayReadiness, useWithdrawCollateralReadiness). This hook
   * surfaces a deterministic `market-unconfigured` state for those
   * tabs so the existing SUPPLY/WITHDRAW callers continue to work
   * unchanged.
   */
  actionTab:
    | "SUPPLY"
    | "WITHDRAW"
    | "BORROW"
    | "REPAY"
    | "WITHDRAW_COLLATERAL"
  /**
   * F3A withdrawable data. When actionTab === "WITHDRAW", these
   * are used to gate the withdraw CTA. Caller passes the values
   * from `usePositionView`.
   */
  withdrawableData: {
    userSuppliedAssets: bigint | null
    maxWithdrawable: bigint | null
    hasPosition: boolean
  }
  /**
   * Optional bump counter. When this value changes, the read
   * effect re-runs (useful after a successful approval to re-read
   * the onchain allowance).
   */
  refreshTick?: number
}

export interface SupplyReadinessOutput {
  /** The resolved loan-token metadata for the selected market. */
  loanToken: LoanTokenMeta
  /** Current readiness state. */
  readiness: SupplyReadiness
  /** `true` if the user has any existing Morpho supply position. */
  hasPosition: boolean
  /** The user's current supply shares (raw bigint), if any. */
  supplyShares: bigint | null
  /** A function the amount input can call to set MAX = wallet balance. */
  computeMaxAmount: () => string | null
}

/** Convert a human string to a raw bigint in `decimals`. Returns null on failure. */
function parseAmountToRaw(value: string, decimals: number): bigint | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^[0-9]*\.?[0-9]*$/.test(trimmed)) return null
  if (trimmed === "" || trimmed === "." || trimmed === "0" || trimmed === "0.")
    return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (!/^[0-9]+$/.test(whole) || !/^[0-9]*$/.test(frac)) return null
  if (frac.length > decimals) return null
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals)
  const wholeBig = BigInt(whole || "0")
  const fracBig = padded ? BigInt(padded) : BigInt(0)
  const factor = pow10Big(BigInt(decimals))
  return wholeBig * factor + fracBig
}

/** Convert a raw bigint (decimals) to a human string, trimmed to N fraction digits. */
function formatRawToAmount(raw: bigint, decimals: number): string {
  const factor = pow10Big(BigInt(decimals))
  const whole = raw / factor
  const frac = raw % factor
  if (frac === BigInt(0)) return whole.toString()
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
  return `${whole.toString()}.${fracStr}`
}

/** `10 ** n` as bigint, computed without the `**` operator so it works on
 * every TypeScript target. For our use case `decimals <= 30` so a simple
 * loop is safe and trivial. */
function pow10Big(n: bigint): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = BigInt(0); i < n; i++) r *= ten
  return r
}

const ZERO_BIGINT = BigInt(0)

export function useSupplyReadiness(
  input: SupplyReadinessInput,
): SupplyReadinessOutput {
  const wallet = useWallet()
  const { market, amount } = input

  // Resolve loan-token metadata from the market row.
  const loanToken: LoanTokenMeta = React.useMemo(() => {
    return {
      address:
        market.loanTokenAddress && market.loanTokenAddress.startsWith("0x")
          ? (market.loanTokenAddress as `0x${string}`)
          : null,
      symbol: market.loanAssetSymbol ?? null,
      decimals: market.loanTokenDecimals ?? null,
    }
  }, [market.loanTokenAddress, market.loanAssetSymbol, market.loanTokenDecimals])

  const marketConfigured =
    loanToken.address !== null &&
    loanToken.decimals !== null &&
    market.marketId !== null

  // -- read state (raw bigints only; null means "still loading / errored") ----
  const [balance, setBalance] = React.useState<bigint | null>(null)
  const [allowance, setAllowance] = React.useState<bigint | null>(null)
  const [position, setPosition] = React.useState<MorphoPosition | null>(null)

  // Track which read is in-flight for the Loading sub-state.
  const [loadingSubkind, setLoadingSubkind] =
    React.useState<"balance" | "allowance" | "position" | null>(null)

  const morphoBlue = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`

  // -- run reads whenever wallet or market changes ---------------------------
  React.useEffect(() => {
    let cancelled = false

    async function run() {
      if (!marketConfigured) return
      if (wallet.status !== "connected" || !wallet.address) return
      if (wallet.chainId !== ROBINHOOD_CHAIN_ID) return
      if (!loanToken.address || loanToken.decimals === null) return
      if (!market.marketId) return

      const opts = {
        chainId: wallet.chainId,
        timeoutMs: 5_000,
      } as const

      // 1. Balance
      setLoadingSubkind("balance")
      const balanceRes = await readErc20Balance(
        loanToken.address,
        wallet.address,
        opts,
      )
      if (cancelled) return
      if (balanceRes.kind === "ok") setBalance(balanceRes.value)
      else setBalance(ZERO_BIGINT)

      // 2. Allowance (spender = Morpho Blue core)
      setLoadingSubkind("allowance")
      const allowanceRes = await readErc20Allowance(
        loanToken.address,
        wallet.address,
        morphoBlue,
        opts,
      )
      if (cancelled) return
      if (allowanceRes.kind === "ok") setAllowance(allowanceRes.value)
      else setAllowance(ZERO_BIGINT)

      // 3. Morpho position
      setLoadingSubkind("position")
      const positionRes = await readMorphoPosition(
        morphoBlue,
        market.marketId as `0x${string}`,
        wallet.address,
        opts,
      )
      if (cancelled) return
      setPosition(positionRes)

      setLoadingSubkind(null)
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    wallet.status,
    wallet.address,
    wallet.chainId,
    loanToken.address,
    loanToken.decimals,
    market.marketId,
    marketConfigured,
    morphoBlue,
    input.refreshTick,
  ])

  // -- compute readiness ----------------------------------------------------
  const readiness: SupplyReadiness = React.useMemo(() => {
    // F7 — BORROW / REPAY / WITHDRAW_COLLATERAL tabs are NOT handled
    // by this hook. The dedicated F7 readiness hooks (useBorrowReadiness,
    // useRepayReadiness, useWithdrawCollateralReadiness) are the
    // authoritative source. We surface a deterministic loading state so
    // existing SUPPLY/WITHDRAW callers continue to work unchanged while
    // the new tabs are routed through their own gates.
    if (input.actionTab !== "SUPPLY" && input.actionTab !== "WITHDRAW") {
      return { kind: "loading", subkind: "position" }
    }

    if (!marketConfigured) {
      if (loanToken.address === null) {
        return { kind: "market-unconfigured", reason: "no-loan-token" }
      }
      if (market.marketId === null) {
        return { kind: "market-unconfigured", reason: "no-market-id" }
      }
      return { kind: "market-unconfigured", reason: "no-decimals" }
    }

    if (wallet.status === "connecting" || wallet.status === "initializing") {
      return { kind: "loading", subkind: "balance" }
    }
    if (wallet.status !== "connected") {
      return { kind: "disconnected" }
    }
    if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
      return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
    }

    // ---------- WITHDRAW tab ----------
    if (input.actionTab === "WITHDRAW") {
      // Amount parsing is the same bigint-safe logic.
      const trimmed = input.amount.trim()
      if (!trimmed || trimmed === "0" || trimmed === "0.") {
        return { kind: "invalid-withdraw-amount", reason: "zero" }
      }
      if (loanToken.decimals === null) {
        return { kind: "loading", subkind: "balance" }
      }
      const withdrawRaw = parseAmountToRaw(input.amount, loanToken.decimals)
      if (withdrawRaw === null) {
        return { kind: "invalid-withdraw-amount", reason: "nan" }
      }
      if (withdrawRaw < ZERO_BIGINT) {
        return { kind: "invalid-withdraw-amount", reason: "negative" }
      }
      if (withdrawRaw === ZERO_BIGINT) {
        return { kind: "invalid-withdraw-amount", reason: "zero" }
      }

      // No position at all — cannot withdraw anything.
      if (!input.withdrawableData.hasPosition) {
        return {
          kind: "no-position",
          message: "You have no supply position to withdraw from.",
        }
      }
      // F3A data still loading.
      if (
        input.withdrawableData.userSuppliedAssets === null ||
        input.withdrawableData.maxWithdrawable === null
      ) {
        return { kind: "loading", subkind: "position" }
      }

      const { userSuppliedAssets, maxWithdrawable } = input.withdrawableData

      if (withdrawRaw > userSuppliedAssets) {
        return {
          kind: "exceeds-supplied",
          attempted: withdrawRaw,
          suppliedAssets: userSuppliedAssets,
        }
      }
      if (withdrawRaw > maxWithdrawable) {
        return {
          kind: "exceeds-withdrawable",
          attempted: withdrawRaw,
          maxWithdrawable,
        }
      }

      return {
        kind: "ready-to-withdraw",
        maxWithdrawable,
        suppliedAssets: userSuppliedAssets,
      }
    }

    // ---------- SUPPLY tab (existing logic) ----------
    // We are connected + on the right chain + market is configured.
    // If any read is still loading or null, return Loading.
    if (
      loadingSubkind !== null ||
      balance === null ||
      allowance === null
    ) {
      const subkind: "balance" | "allowance" | "position" =
        loadingSubkind ?? "balance"
      return { kind: "loading", subkind }
    }

    const bal = balance
    const all = allowance
    const pos = position

    if (amount.trim() === "") {
      return {
        kind: "invalid-amount",
        balance: bal,
        allowance: all,
        reason: "zero",
        position: pos,
      }
    }
    const requiredRaw = parseAmountToRaw(amount, loanToken.decimals as number)
    if (requiredRaw === null) {
      return {
        kind: "invalid-amount",
        balance: bal,
        allowance: all,
        reason: "nan",
        position: pos,
      }
    }
    if (requiredRaw < ZERO_BIGINT) {
      return {
        kind: "invalid-amount",
        balance: bal,
        allowance: all,
        reason: "negative",
        position: pos,
      }
    }
    if (requiredRaw === ZERO_BIGINT) {
      return {
        kind: "invalid-amount",
        balance: bal,
        allowance: all,
        reason: "zero",
        position: pos,
      }
    }

    if (requiredRaw > bal) {
      return {
        kind: "insufficient-balance",
        balance: bal,
        allowance: all,
        required: requiredRaw,
        position: pos,
      }
    }

    if (requiredRaw > all) {
      return {
        kind: "approval-required",
        balance: bal,
        allowance: all,
        missing: requiredRaw - all,
        position: pos,
      }
    }

    return { kind: "ready", balance: bal, allowance: all, position: pos }
  }, [
    marketConfigured,
    loanToken.address,
    loanToken.decimals,
    market.marketId,
    wallet.status,
    wallet.chainId,
    loadingSubkind,
    balance,
    allowance,
    position,
    amount,
    input.actionTab,
    input.withdrawableData.userSuppliedAssets,
    input.withdrawableData.maxWithdrawable,
    input.withdrawableData.hasPosition,
  ])

  // -- helpers --------------------------------------------------------------
  const computeMaxAmount = React.useCallback(() => {
    // F7 — BORROW / REPAY / WITHDRAW_COLLATERAL MAX is computed by the
    // dedicated F7 readiness hooks (each one knows which cap to apply).
    // Returning null here is the correct behavior for the unified input.
    if (input.actionTab !== "SUPPLY" && input.actionTab !== "WITHDRAW") {
      return null
    }
    if (input.actionTab === "WITHDRAW") {
      const w = input.withdrawableData.maxWithdrawable
      if (w === null || loanToken.decimals === null) return null
      if (w === ZERO_BIGINT) return "0"
      return formatRawToAmount(w, loanToken.decimals)
    }
    if (balance === null || loanToken.decimals === null) return null
    return formatRawToAmount(balance, loanToken.decimals)
  }, [
    balance,
    loanToken.decimals,
    input.actionTab,
    input.withdrawableData.maxWithdrawable,
  ])

  // The F3A position-view is the authoritative source of `hasPosition`
  // and `supplyShares`. We pass the readiness hook's own `position`
  // value back out only for symmetry with F2A/F2C — but callers
  // should prefer `usePositionView` for UI display.
  const hasPosition =
    position !== null && position.supplyShares > ZERO_BIGINT
  const supplyShares = position ? position.supplyShares : null

  return {
    loanToken,
    readiness,
    hasPosition,
    supplyShares,
    computeMaxAmount,
  }
}
