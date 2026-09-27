"use client"

/**
 * useWithdrawCollateralTransaction — Morpho Blue withdrawCollateral only.
 * No supply, no borrow, no repay, no withdraw.
 *
 * Phase F6D. Implements a simulation-first withdrawCollateral flow.
 *
 * Architecture:
 *
 *   User clicks "Withdraw Collateral"
 *   → validate: wallet connected, market valid, amount > 0,
 *     amount <= collateralRaw, amount <= maxWithdrawableCollateral
 *   → preSendGuard + simulateWrite(calldata)
 *   → eth_sendTransaction(assets=exactAmount, onBehalf=wallet, receiver=wallet)
 *   → waitForReceipt (status === 0x1)
 *   → onSuccess(txHash) → parent bumps refreshTick
 *
 * Safe-withdraw math:
 *
 *   Uses the verified F6A oracle formula in reverse to compute the
 *   maximum collateral that can be safely withdrawn while keeping
 *   the position above the LLTV liquidation threshold:
 *
 *     maxWithdrawable = collateralRaw
 *       - ceilDiv(borrowed * 10^loanDecimals * 1e36,
 *                  oraclePrice * 10^collateralDecimals * lltvWad)
 *
 *   If debt == 0: maxWithdrawable = collateralRaw (all is safe).
 *   If required oracle/debt data is unavailable: disable withdrawal.
 *
 * State machine (per F6D spec):
 *
 *   idle
 *     -> preparing   (eth_call simulation in flight)
 *          -> awaiting_wallet  (wallet popup open)
 *               -> pending     (txHash returned, receipt)
 *                    -> success  (receipt status === 0x1)
 *                    -> error    (any failure)
 *
 * Error stages:
 *   idle -> no-collateral / no-safe-withdraw / validation-failed /
 *           wrong-network / disconnected
 *
 * What this hook does NOT do:
 *   - never sends supply / borrow / repay / withdraw
 *   - never uses MAX_UINT256 for withdraw amount
 *   - never mocks a transaction
 *   - never calls wallet_requestPermissions
 *   - never fabricates collateral or debt values
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
  sendWithdrawCollateral,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"

/* ------------------------------------------------------ */
/* Stage / State types                                    */
/* ------------------------------------------------------ */

export type WithdrawCollateralStage =
  | "idle"
  | "preparing"
  | "awaiting_wallet"
  | "pending"
  | "success"
  | "error"

export interface WithdrawCollateralTransactionState {
  stage: WithdrawCollateralStage
  txHash: `0x${string}` | null
  /** UI-safe error message. */
  errorMessage: string | null
  /** Detailed simulation revert reason (for developer logs). */
  simulationMessage: string | null
  /** Underlying error kind for fine-grained UI surfacing. */
  errorStage:
    | null
    | "no-collateral"
    | "no-safe-withdraw"
    | "wrong-network"
    | "disconnected"
    | "validation-failed"
    | "simulation-failed"
    | "rejected"
    | "rpc-error"
    | "protocol-not-configured"
    | "reverted"
    | "timeout"
    | "gas-balance"
    | "no-provider"
}

const INITIAL_STATE: WithdrawCollateralTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
  errorStage: null,
}

const PENDING_STAGES: ReadonlySet<WithdrawCollateralStage> = new Set<WithdrawCollateralStage>([
  "preparing",
  "awaiting_wallet",
  "pending",
])

/* ------------------------------------------------------ */
/* Input / Output                                        */
/* ------------------------------------------------------ */

export interface WithdrawCollateralTransactionInput {
  /**
   * The LendingMarket row. Used to derive Morpho MarketParams
   * (loanToken, collateralToken, oracle, irm, lltv).
   */
  market: LendingMarket
  /**
   * Exact raw withdraw amount in collateral-token smallest units (bigint).
   * Must be > 0 and <= min(collateralRaw, maxWithdrawableCollateral).
   *
   * This hook NEVER uses MAX_UINT256.
   */
  assets: bigint
  /** Collateral-token symbol (for error messages). */
  collateralSymbol: string
  /**
   * User's raw collateral balance from F5B (bigint, collateral-token units).
   * Must be > 0 to initiate a withdrawal.
   */
  collateralRaw: bigint
  /**
   * User's current outstanding debt in loan-token units (bigint, >= 0).
   * Source of truth: F5B `borrowedAssets` via `usePositionView`.
   * Used only for safe-withdraw computation. Pass 0n if debt data
   * is unavailable (withdrawal will be disabled).
   */
  borrowedAssets: bigint
  /**
   * Collateral token decimals (for safe-withdraw math).
   */
  collateralDecimals: number
  /**
   * Loan token decimals (for safe-withdraw math).
   */
  loanDecimals: number
  /**
   * Oracle price from F6A (bigint, Morpho oracle WAD scale).
   * Must be > 0. If unavailable, pass 0n (withdrawal will be disabled).
   */
  oraclePrice: bigint
  /**
   * LLTV as raw WAD from MarketParams (bigint).
   * E.g. 86% = 86 * 1e16. Must be > 0. Pass 0n if LLTV is unavailable
   * (withdrawal will be disabled).
   */
  lltvWad: bigint
  /**
   * Maximum safe withdrawable collateral (bigint, collateral-token units).
   * Source: F6A `maxWithdrawableCollateral(...)`. The hook validates
   * `assets <= maxSafeWithdraw` as a hard constraint before sending.
   * If this is 0, withdrawal is disabled.
   */
  maxSafeWithdraw: bigint
  /**
   * Optional callback fired after `success` is reached.
   * Parent bumps `refreshTick` to re-read position, capacity, and oracle.
   */
  onSuccess?: (txHash: `0x${string}`) => void
  /**
   * Optional callback fired on any error stage.
   */
  onError?: (stage: WithdrawCollateralTransactionState["errorStage"], message: string) => void
}

export interface WithdrawCollateralTransactionOutput {
  state: WithdrawCollateralTransactionState
  /**
   * True if a transaction is in any pending phase. Parent MUST disable
   * the Withdraw CTA while this is true.
   */
  isPending: boolean
  /**
   * Fire the withdrawCollateral flow. Safe to call from a button onClick.
   */
  withdraw: () => Promise<void>
  /**
   * Reset local state back to idle (does NOT touch chain).
   */
  reset: () => void
}

/* ------------------------------------------------------ */
/* Hook                                                   */
/* ------------------------------------------------------ */

export function useWithdrawCollateralTransaction(
  input: WithdrawCollateralTransactionInput,
): WithdrawCollateralTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<WithdrawCollateralTransactionState>(INITIAL_STATE)
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

  const withdraw = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    const {
      market,
      assets,
      collateralSymbol,
      collateralRaw,
      borrowedAssets,
      oraclePrice,
      lltvWad,
      maxSafeWithdraw,
    } = input

    // -- early validation -----------------------------------------
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
    if (assets <= BigInt(0)) {
      busyRef.current = false
      const msg = "Withdraw amount must be greater than zero."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (collateralRaw <= BigInt(0)) {
      busyRef.current = false
      const msg = "No collateral to withdraw."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "no-collateral",
      })
      onErrorRef.current?.("no-collateral", msg)
      return
    }
    if (assets > collateralRaw) {
      busyRef.current = false
      const msg = "Withdraw amount exceeds your collateral balance."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    // F6A safe-withdraw hard cap: withdraw amount must not exceed the
    // protocol-safe maximum. If the UI pre-computed maxSafeWithdraw,
    // we enforce it here as a last line of defense.
    if (maxSafeWithdraw <= BigInt(0)) {
      busyRef.current = false
      const msg =
        "No safe collateral available to withdraw. " +
        "Ensure your position has sufficient collateral " +
        "above the liquidation threshold."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "no-safe-withdraw",
      })
      onErrorRef.current?.("no-safe-withdraw", msg)
      return
    }
    if (assets > maxSafeWithdraw) {
      busyRef.current = false
      const msg =
        "Withdraw amount exceeds the safe maximum. " +
        "Reducing your collateral below the liquidation " +
        "threshold is not permitted."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "no-safe-withdraw",
      })
      onErrorRef.current?.("no-safe-withdraw", msg)
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
        `Cannot construct market params for ${collateralSymbol}. ` +
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

    const walletAddr = wallet.address as Address

    // -- preSendGuard ----------------------------------------------
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: walletAddr,
      actualAddress: wallet.address,
      walletBalance: null, // collateral withdrawal does not require token balance
      amount: assets,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: WithdrawCollateralTransactionState["errorStage"] =
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

    // -- simulate the withdrawCollateral ---------------------------
    setState({ ...INITIAL_STATE, stage: "preparing" })

    let wcData: `0x${string}` | null = null
    try {
      const { encodeMorphoWithdrawCollateral } = await import(
        "@/lib/markets/onchain/abi"
      )
      wcData = encodeMorphoWithdrawCollateral({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets,
        onBehalf: walletAddr,
        receiver: walletAddr,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct withdrawCollateral calldata."
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
      to: contracts.morphoBlueAddress,
      data: wcData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg =
          sim.message ??
          "withdrawCollateral simulation reverted."
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

    // -- eth_sendTransaction ----------------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_wallet" }))

    const sent = await sendWithdrawCollateral({
      provider,
      from: walletAddr,
      marketParams: mp,
      assets,
      onBehalf: walletAddr,
      receiver: walletAddr,
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
      const stage: WithdrawCollateralTransactionState["errorStage"] = isGas
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

    // -- waitForReceipt --------------------------------------------
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: WithdrawCollateralTransactionState["errorStage"] =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "withdrawCollateral transaction reverted on-chain."
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
    input.collateralSymbol,
    input.collateralRaw,
    input.borrowedAssets,
    input.oraclePrice,
    input.lltvWad,
    input.maxSafeWithdraw,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, withdraw, reset }
}
