"use client"

/**
 * useRepayTransaction — Morpho Blue repay only. No supply, no borrow,
 * no withdraw, no withdrawCollateral.
 *
 * Phase F6C. Implements a simulation-first repay flow.
 *
 * Architecture:
 *
 *   User clicks "Repay" (amount typed, debt > 0)
 *   → validate amount
 *   → read fresh allowance
 *   → if insufficient: approval flow
 *   → simulateWrite (eth_call)
 *   → eth_sendTransaction
 *   → waitForReceipt (status === 0x1)
 *   → onSuccess(txHash) → parent bumps refreshTick
 *
 * Full-position repayment (assets = 0):
 *
 *   Morpho computes the exact assets internally (including accrued
 *   interest) when `assets = 0` and `shares = 0`. However, Morpho
 *   pulls `toAssetsUp(borrowShares, ...)` from the sender via
 *   transferFrom, which may be larger than the displayed outstanding
 *   debt (which is `toAssetsDown`). The hook requests approval for
 *   exactly `toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)`
 *   — derived from real F3A market state — so the repayment cannot
 *   revert due to insufficient allowance.
 *
 * ERC20 Approval:
 *
 *   Morpho Blue `repay` uses `transferFrom`, which requires the
 *   Morpho Blue core address to pull loan tokens from the user's wallet.
 *   Therefore a sufficient ERC20 allowance to Morpho Blue is required
 *   before every repay.
 *
 * State machine (per F6C spec):
 *
 *   idle
 *     -> checking_allowance    (fresh allowance read)
 *          -> approving        (approval eth_call simulation)
 *               -> awaiting_approval_confirmation  (approval txHash returned)
 *                    -> preparing   (repay eth_call simulation)
 *                         -> awaiting_wallet  (repay wallet popup)
 *                              -> pending     (repay txHash returned, receipt)
 *                                   -> success  (receipt status === 0x1)
 *                                   -> error    (any failure)
 *
 * Error stages:
 *   idle -> no_debt / validation-failed / wrong-network / disconnected
 *
 * What this hook does NOT do:
 *   - never sends borrow / supply / withdraw / withdrawCollateral
 *   - never uses MAX_UINT256 for repay amount
 *   - never mocks a transaction
 *   - never auto-triggers after approval (user must click Repay again)
 *   - never calls wallet_requestPermissions
 *   - never fabricates debt values
 *
 * Duplicate-request protection:
 *   - busyRef (synchronous) — single-flight guard.
 *   - isPending (derived) — CTA disabled during all pending stages.
 */

import * as React from "react"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  marketParamsFromLendingMarket,
} from "@/lib/markets/onchain/abi"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import {
  preSendGuard,
  sendApprove,
  sendRepay,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import {
  readErc20Allowance,
  readErc20Balance,
} from "@/lib/markets/onchain/erc20"
import { toAssetsUp } from "@/lib/markets/onchain/morpho-market"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"

/* ------------------------------------------------------ */
/* Stage / State types                                    */
/* ------------------------------------------------------ */

export type RepayStage =
  | "idle"
  | "checking_allowance"
  | "approving"
  | "awaiting_approval_confirmation"
  | "preparing"
  | "awaiting_wallet"
  | "pending"
  | "success"
  | "error"

export interface RepayTransactionState {
  stage: RepayStage
  txHash: `0x${string}` | null
  /** UI-safe error message. */
  errorMessage: string | null
  /** Detailed revert reason from simulation (for developer logs). */
  simulationMessage: string | null
  /** Underlying error kind for fine-grained UI surfacing. */
  errorStage:
    | null
    | "no-debt"
    | "wrong-network"
    | "disconnected"
    | "validation-failed"
    | "checking_allowance"
    | "approval-failed"
    | "approval-rejected"
    | "simulation-failed"
    | "rejected"
    | "rpc-error"
    | "protocol-not-configured"
    | "reverted"
    | "timeout"
    | "gas-balance"
    | "no-provider"
    | "insufficient-balance"
}

const INITIAL_STATE: RepayTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
  errorStage: null,
}

/**
 * All stages that represent an active operation — the CTA must be
 * disabled while any of these are active.
 */
const PENDING_STAGES: ReadonlySet<RepayStage> = new Set<RepayStage>([
  "checking_allowance",
  "approving",
  "awaiting_approval_confirmation",
  "preparing",
  "awaiting_wallet",
  "pending",
])

/* ------------------------------------------------------ */
/* Input / Output                                        */
/* ------------------------------------------------------ */

export interface RepayTransactionInput {
  /**
   * The LendingMarket row. Used to derive Morpho MarketParams
   * (loanToken, collateralToken, oracle, irm, lltv). The caller
   * is responsible for ensuring all required fields are populated
   * (non-mock market).
   */
  market: LendingMarket
  /**
   * Exact raw repay amount in loan-token smallest units (bigint).
   *
   * Partial repayment (assets > 0): must not exceed outstanding debt.
   *
   * Full repayment (assets = 0): Morpho computes the exact assets
   * needed to close the position internally (including accrued interest).
   * Requires `borrowShares`, `totalBorrowAssets`, and `totalBorrowShares`
   * to be provided and > 0 so the hook can compute the correct
   * approval ceiling via `toAssetsUp`.
   *
   * This hook NEVER uses MAX_UINT256.
   */
  assets: bigint
  /**
   * The current outstanding debt in loan-token units (bigint, > 0).
   * Source of truth: F5B `borrowedAssets` via `usePositionView`.
   * Must be > 0 to initiate a repay.
   */
  outstandingDebt: bigint
  /** Loan-token decimals (for allowance / balance reads and error messages). */
  loanTokenDecimals: number
  /**
   * The user's raw borrow shares on this market. Required when requesting
   * a full-position repayment (`assets = 0`) to compute the safe approval
   * ceiling via `toAssetsUp(borrowShares, ...)`.
   *
   * Source of truth: F5B `position.borrowShares` via `usePositionView`.
   * Must be > 0 when `assets = 0` and `outstandingDebt > 0`.
   */
  borrowShares: bigint
  /**
   * The market's current `totalBorrowAssets` (bigint, loan-token units).
   * Required for `toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)`
   * when computing the safe approval ceiling for a full repayment.
   *
   * Source: F3A market state (refreshed with each refreshTick).
   * Must be > 0 when `assets = 0` and `borrowShares > 0`.
   */
  totalBorrowAssets: bigint
  /**
   * The market's current `totalBorrowShares` (bigint).
   * Required for `toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)`
   * when computing the safe approval ceiling for a full repayment.
   *
   * Source: F3A market state (refreshed with each refreshTick).
   * Must be > 0 when `assets = 0` and `borrowShares > 0`.
   */
  totalBorrowShares: bigint
  /** Loan-token symbol (for error messages). */
  loanTokenSymbol: string
  /**
   * Optional callback fired after `success` is reached. The parent
   * should bump `refreshTick` to re-read position, debt, balance,
   * and capacity.
   */
  onSuccess?: (txHash: `0x${string}`) => void
  /**
   * Optional callback fired on any error stage.
   */
  onError?: (stage: RepayTransactionState["errorStage"], message: string) => void
}

export interface RepayTransactionOutput {
  state: RepayTransactionState
  /**
   * True if any operation is active. Parent MUST disable the Repay
   * CTA while this is true.
   */
  isPending: boolean
  /**
   * Fire the repay flow. Safe to call from a button onClick.
   * The caller must have already validated:
   *   - wallet is connected
   *   - debt > 0
   *   - amount > 0
   *   - amount <= debt
   */
  repay: () => Promise<void>
  /**
   * Reset local state back to idle (does NOT touch chain).
   */
  reset: () => void
}

/* ------------------------------------------------------ */
/* Hook                                                   */
/* ------------------------------------------------------ */

export function useRepayTransaction(
  input: RepayTransactionInput,
): RepayTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<RepayTransactionState>(INITIAL_STATE)
  const busyRef = React.useRef<boolean>(false)
  const onSuccessRef = React.useRef(input.onSuccess)
  const onErrorRef = React.useRef(input.onError)

  React.useEffect(() => {
    onSuccessRef.current = input.onSuccess
    onErrorRef.current = input.onError
  }, [input.onSuccess, input.onError])

  // H1 — bound provider from `useWallet`. This is the SAME provider
  // object that the wallet's `accountsChanged` / `chainChanged` /
  // `disconnect` listeners are attached to. Routing every
  // `eth_sendTransaction` / `eth_call` (when applicable) through this
  // reference — not `window.ethereum` — guarantees the correct wallet
  // is used even in multi-injected environments where the picked
  // wallet does NOT own `window.ethereum`.
  const provider: EIP1193Provider | null = wallet.provider

  const reset = React.useCallback(() => {
    busyRef.current = false
    setState(INITIAL_STATE)
  }, [])

  const repay = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    const {
      market,
      assets,
      outstandingDebt,
      borrowShares,
      totalBorrowAssets,
      totalBorrowShares,
      loanTokenSymbol,
    } = input

    // -- early-exit validations -------------------------------------
    if (
      wallet.status !== "connected" ||
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID
    ) {
      busyRef.current = false
      const msg = "Wallet is not connected to Robinhood Chain."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: wallet.status !== "connected" ? "disconnected" : "wrong-network",
      })
      onErrorRef.current?.(
        wallet.status !== "connected" ? "disconnected" : "wrong-network",
        msg,
      )
      return
    }
    if (!provider) {
      busyRef.current = false
      const msg = "No wallet provider available."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "no-provider",
      })
      onErrorRef.current?.("no-provider", msg)
      return
    }
    if (outstandingDebt <= BigInt(0)) {
      busyRef.current = false
      const msg = "No outstanding debt to repay."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "no-debt",
      })
      onErrorRef.current?.("no-debt", msg)
      return
    }
    if (assets < BigInt(0)) {
      busyRef.current = false
      const msg = "Repay amount must be greater than zero."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets > BigInt(0) && assets > outstandingDebt) {
      // Partial repayment: amount must not exceed outstanding debt.
      // For `assets = 0` (full repayment), we skip this check because
      // Morpho computes the exact close amount internally and the
      // simulation guards against underfunded repayments.
      busyRef.current = false
      const msg = "Repay amount exceeds outstanding debt."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (
      assets === BigInt(0) &&
      (borrowShares <= BigInt(0) ||
        totalBorrowAssets <= BigInt(0) ||
        totalBorrowShares <= BigInt(0))
    ) {
      busyRef.current = false
      const msg =
        "Position data unavailable for full repayment. " +
        "Try a partial repayment with an explicit amount."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    // -- derive MarketParams ----------------------------------------
    let mp: ReturnType<typeof marketParamsFromLendingMarket> | null = null
    try {
      mp = marketParamsFromLendingMarket({
        loanTokenAddress:
          (market.loanTokenAddress as Address | null) ?? null,
        collateralTokenAddress:
          (market.collateralTokenAddress as Address | null) ?? null,
        oracleAddress: market.oracleAddress ?? null,
        irmAddress: market.irmAddress ?? null,
        lltvFraction: market.lltv ?? null,
      })
    } catch {
      // falls through to protocol-not-configured error
    }
    if (!mp) {
      busyRef.current = false
      const msg =
        `Cannot construct market params for ${loanTokenSymbol}. ` +
        `Ensure the market is a real Morpho market.`
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "protocol-not-configured",
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    // -- resolve protocol contracts ---------------------------------
    const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
    if (!contracts.morphoBlueAddress) {
      busyRef.current = false
      const msg =
        "Morpho Blue is not configured for Robinhood Chain (4663)."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "protocol-not-configured",
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    const morphoAddress = contracts.morphoBlueAddress
    const walletAddr = wallet.address as Address
    const repayAmount = assets // may be 0 = full repayment

    // -- Step 1: fresh allowance read --------------------------------
    setState({ ...INITIAL_STATE, stage: "checking_allowance" })

    const loanTokenAddress = market.loanTokenAddress as `0x${string}` | null

    if (!loanTokenAddress) {
      busyRef.current = false
      const msg = `Loan token address not available for ${loanTokenSymbol}.`
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    const allowanceResult = await readErc20Allowance(
      loanTokenAddress,
      walletAddr,
      morphoAddress,
      {
        provider,
        chainId: wallet.chainId,
        timeoutMs: 5_000,
      },
    )
    if (allowanceResult.kind === "error") {
      busyRef.current = false
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: "Failed to read token allowance.",
        errorStage: "rpc-error",
      })
      onErrorRef.current?.("rpc-error", "Failed to read token allowance.")
      return
    }
    const currentAllowance = allowanceResult.value

    // Morpho Blue `repay(assets=0, shares=0)` lets Morpho compute
    // the exact assets to close the position. However, Morpho pulls
    // `toAssetsUp(borrowShares, ...)` from the sender via transferFrom,
    // which may be LARGER than the displayed outstandingDebt
    // (which is `toAssetsDown`).
    //
    // Example: shares=100, totalAssets=99, totalShares=100
    //   toAssetsDown(100, 99, 100) = floor(99*100/100) = 99
    //   toAssetsUp(100, 99, 100) = ceil(99*100/100) = ceil(99) = 99
    // → in this case they happen to round to the same value.
    //
    // More generally, toAssetsUp >= toAssetsDown for any non-trivial
    // position (shares > 0, totalAssets != totalShares).
    //
    // Therefore the approval ceiling for a full repayment must be
    // `toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)`,
    // NOT the displayed outstandingDebt.
    //
    // If the user approves exactly outstandingDebt but Morpho needs
    // toAssetsUp > outstandingDebt, the repay reverts and the user
    // must re-approve — a poor UX that we avoid here.
    //
    // For partial repayment (assets > 0), we approve exactly the
    // requested amount.
    const isFullRepayment = repayAmount === BigInt(0)
    const requiredAllowance = isFullRepayment
      ? toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
      : repayAmount

    if (currentAllowance < requiredAllowance) {
      // -- Step 2: Approval flow ------------------------------------
      // Gate repay behind a preceding ERC20 approval for the Morpho core.
      // Morpho Blue uses `transferFrom`, which requires the user to have
      // approved the Morpho core address to pull `loanToken`.
      // We send a standard ERC20 `approve(morphoAddress, requiredAllowance)`.
      // No Permit/Permit2 — standard approval only.

      setState({ ...INITIAL_STATE, stage: "approving" })

      const approved = await sendApprove({
        provider,
        from: walletAddr,
        token: loanTokenAddress,
        spender: morphoAddress,
        amount: requiredAllowance,
      })
      if (!approved.ok) {
        busyRef.current = false
        const msg = approved.error.message
        if (approved.error.stage === "rejected") {
          setState({
            ...INITIAL_STATE,
            stage: "error",
            errorMessage: msg,
            errorStage: "approval-rejected",
          })
          onErrorRef.current?.("approval-rejected", msg)
          return
        }
        const stage: RepayTransactionState["errorStage"] =
          approved.error.stage === "rpc-error"
            ? "rpc-error"
            : "approval-failed"
        setState({
          ...INITIAL_STATE,
          stage: "error",
          errorMessage: msg,
          errorStage: stage,
        })
        onErrorRef.current?.(stage, msg)
        return
      }
      // Wait for the approval receipt.
      setState((prev) => ({
        ...prev,
        txHash: approved.txHash,
        stage: "awaiting_approval_confirmation",
      }))
      const approvalReceipt = await waitForReceipt(provider, approved.txHash)
      if (!approvalReceipt.ok) {
        busyRef.current = false
        const stage: RepayTransactionState["errorStage"] =
          approvalReceipt.error.stage === "reverted"
            ? "approval-failed"
            : "timeout"
        const msg =
          stage === "approval-failed"
            ? "Approval transaction reverted."
            : approvalReceipt.error.message
        setState({
          ...INITIAL_STATE,
          stage: "error",
          errorMessage: msg,
          errorStage: stage,
          txHash: approved.txHash,
        })
        onErrorRef.current?.(stage, msg)
        return
      }
      // Approval confirmed. Now proceed to repay.
    }

    // -- Step 3: Simulate repay --------------------------------------
    setState({ ...INITIAL_STATE, stage: "preparing" })

    let repayData: `0x${string}` | null = null
    try {
      const { encodeMorphoRepay } = await import(
        "@/lib/markets/onchain/abi"
      )
      repayData = encodeMorphoRepay({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets: repayAmount,        // 0 = full position close; > 0 = exact amount
        shares: BigInt(0),         // shares=0 activates assets-based mode
        onBehalf: walletAddr,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct repay calldata."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "protocol-not-configured",
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    const sim = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: walletAddr,
      to: morphoAddress,
      data: repayData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg = sim.message ?? "Repay simulation reverted."
        setState({
          ...INITIAL_STATE,
          stage: "error",
          errorMessage: msg,
          simulationMessage: sim.message ?? null,
          errorStage: "simulation-failed",
        })
        onErrorRef.current?.("simulation-failed", msg)
        return
      }
      if (sim.reason === "wrong-network") {
        const msg = `Wrong network: chain ${sim.chainId}.`
        setState({
          ...INITIAL_STATE,
          stage: "error",
          errorMessage: msg,
          errorStage: "wrong-network",
        })
        onErrorRef.current?.("wrong-network", msg)
        return
      }
      const fallback =
        sim.reason === "no-provider"
          ? "No wallet provider available."
          : sim.message
      const msg = fallback ?? "Simulation RPC failed."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "rpc-error",
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }

    // -- Step 4: eth_sendTransaction ---------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_wallet" }))

    // -- preSendGuard final check ------------------------------------
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null, // balance check is the caller's responsibility
      amount: repayAmount,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: RepayTransactionState["errorStage"] =
        guard.stage === "rpc-error" ? "rpc-error" : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: guard.message,
        errorStage: stage,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // Also do a fresh balance check right before sending to catch
    // any wallet drain since the user last loaded the page.
    const balanceResult = await readErc20Balance(loanTokenAddress, walletAddr, {
      provider,
      chainId: wallet.chainId,
      timeoutMs: 5_000,
    })
    if (balanceResult.kind === "error") {
      busyRef.current = false
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: "Failed to read wallet balance.",
        errorStage: "rpc-error",
      })
      onErrorRef.current?.("rpc-error", "Failed to read wallet balance.")
      return
    }
    const walletBalance = balanceResult.value
    // For a partial repayment: check the explicit assets amount.
    // For a full repayment (assets = 0): Morpho will pull at most
    // toAssetsUp(borrowShares, ...) at execution time. We use that
    // as the conservative balance floor. If balance is insufficient
    // for the ceiling, the repay would revert anyway.
    const effectiveRepayAmount = isFullRepayment
      ? toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
      : repayAmount
    if (walletBalance < effectiveRepayAmount) {
      busyRef.current = false
      const msg = "Insufficient loan-token balance to repay."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "insufficient-balance",
      })
      onErrorRef.current?.("insufficient-balance", msg)
      return
    }

    const sent = await sendRepay({
      provider,
      from: walletAddr,
      marketParams: mp,
      assets: repayAmount,
      shares: BigInt(0),
      onBehalf: walletAddr,
      contracts,
      chainId: ROBINHOOD_CHAIN_ID,
    })
    if (!sent.ok) {
      busyRef.current = false
      const msg = sent.error.message
      if (sent.error.stage === "rejected") {
        setState({
          ...INITIAL_STATE,
          stage: "error",
          errorMessage: msg,
          errorStage: "rejected",
        })
        onErrorRef.current?.("rejected", msg)
        return
      }
      const isGas =
        msg.toLowerCase().includes("insufficient funds") ||
        msg.toLowerCase().includes("gas")
      const stage: RepayTransactionState["errorStage"] = isGas
        ? "gas-balance"
        : sent.error.stage === "rpc-error"
          ? "rpc-error"
          : sent.error.stage === "protocol-not-configured"
            ? "protocol-not-configured"
            : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: stage,
      })
      onErrorRef.current?.(stage, msg)
      return
    }
    setState((prev) => ({
      ...prev,
      stage: "pending",
      txHash: sent.ok ? sent.txHash : prev.txHash,
    }))

    // -- Step 5: waitForReceipt ---------------------------------------
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: RepayTransactionState["errorStage"] =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "Repay transaction reverted on-chain."
          : receipt.error.message
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        txHash: sent.txHash,
        errorStage: stage,
      })
      onErrorRef.current?.(stage, msg)
      return
    }

    busyRef.current = false
    setState({
      stage: "success",
      txHash: sent.txHash,
      errorMessage: null,
      simulationMessage: null,
      errorStage: null,
    })
    onSuccessRef.current?.(sent.txHash)
  }, [
    input.market,
    input.assets,
    input.outstandingDebt,
    input.borrowShares,
    input.totalBorrowAssets,
    input.totalBorrowShares,
    input.loanTokenDecimals,
    input.loanTokenSymbol,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, repay, reset }
}
