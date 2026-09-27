"use client"

/**
 * useBorrowTransaction — Morpho Blue borrow only. No repay, no supply,
 * no withdraw, no withdrawCollateral.
 *
 * Phase F6B. Implements a simulation-first borrow flow on top of the
 * verified F6A borrow-capacity gate.
 *
 *   1. User clicks "Borrow" when F6A capacity is `ready` and the
 *      typed amount <= availableBorrowCapacity.
 *   2. preSendGuard + simulateWrite(borrow calldata) via eth_call.
 *   3. eth_sendTransaction for
 *      borrow(MarketParams, exactLoanAssets, 0, wallet, wallet).
 *      `shares = 0` lets Morpho compute borrow shares internally
 *      (canonical Morpho Blue convention for asset-based borrowing).
 *      `onBehalf = wallet` and `receiver = wallet` — the user is both
 *      the borrower and the recipient of loan tokens.
 *   4. waitForReceipt — only status === 0x1 passes.
 *   5. On confirmed success, fires `onSuccess(txHash)` — the parent
 *      bumps `refreshTick` to re-read position, balance, capacity,
 *      and oracle price.
 *
 * State machine (per F6B spec):
 *
 *   idle
 *     -> preparing            (eth_call simulation in flight)
 *          -> awaiting_wallet (wallet popup open)
 *               -> pending    (txHash returned, awaiting receipt)
 *                    -> success (receipt status === 0x1)
 *                    -> error   (revert / rejection / RPC failure / validation)
 *
 * What this hook does NOT do:
 *   - never sends repay / withdraw / withdrawCollateral
 *   - never guesses a borrow amount
 *   - never mocks a transaction
 *   - never auto-borrows after any other action
 *   - never calls wallet_requestPermissions
 *
 * Duplicate-request protection:
 *   - busyRef (synchronous) — second click during any non-idle stage
 *     is a no-op.
 *   - isPending (derived) — CTA is disabled during preparing / awaiting_wallet / pending.
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
  sendBorrow,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"

/* ------------------------------------------------------ */
/* Stage / State types                                    */
/* ------------------------------------------------------ */

export type BorrowStage =
  | "idle"
  | "preparing"
  | "awaiting_wallet"
  | "pending"
  | "success"
  | "error"

export interface BorrowTransactionState {
  stage: BorrowStage
  txHash: `0x${string}` | null
  /** UI-safe error message. */
  errorMessage: string | null
  /** Detailed simulation revert reason (for developer logs). */
  simulationMessage: string | null
  /** Underlying error stage (for fine-grained UI surfacing). */
  errorStage:
    | null
    | "wrong-network"
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

const INITIAL_STATE: BorrowTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
  errorStage: null,
}

const PENDING_STAGES: ReadonlySet<BorrowStage> = new Set<BorrowStage>([
  "preparing",
  "awaiting_wallet",
  "pending",
])

/* ------------------------------------------------------ */
/* Input / Output                                        */
/* ------------------------------------------------------ */

export interface BorrowTransactionInput {
  /**
   * The LendingMarket row. Used to derive Morpho MarketParams
   * (loanToken, collateralToken, oracle, irm, lltv). The caller
   * is responsible for ensuring all required fields are populated
   * (non-mock market).
   */
  market: LendingMarket
  /**
   * Exact raw borrow amount in loan-token smallest units (bigint).
   * Caller MUST pass a positive finite bigint derived from the user's
   * typed amount and the loan-token decimals.
   *
   * This hook NEVER substitutes MAX_UINT256.
   * This hook NEVER borrows more than this exact amount.
   */
  assets: bigint
  /** Loan-token decimals (used only for error messages and validation). */
  loanTokenDecimals: number
  /** Loan-token symbol (used only for error messages). */
  loanTokenSymbol: string
  /**
   * Maximum borrow amount the user is currently allowed to draw
   * (bigint, loan-token units). Source of truth = F6A
   * `availableBorrowCapacity`. The hook refuses to send any
   * transaction that exceeds this number.
   */
  maxBorrowCapacity: bigint
  /**
   * Optional callback fired after `success` is reached. Receives the
   * confirmed txHash so the parent can bump `refreshTick` and
   * re-read position, capacity, and oracle.
   */
  onSuccess?: (txHash: `0x${string}`) => void
  /**
   * Optional callback fired on any error stage.
   */
  onError?: (stage: BorrowTransactionState["errorStage"], message: string) => void
}

export interface BorrowTransactionOutput {
  state: BorrowTransactionState
  /**
   * True if a transaction is in any pending phase. Parent MUST disable
   * the Borrow CTA while this is true.
   */
  isPending: boolean
  /**
   * Fire the borrow flow. Safe to call from a button onClick.
   */
  borrow: () => Promise<void>
  /**
   * Reset local state back to idle (does NOT touch chain).
   */
  reset: () => void
}

/* ------------------------------------------------------ */
/* Hook                                                   */
/* ------------------------------------------------------ */

export function useBorrowTransaction(
  input: BorrowTransactionInput,
): BorrowTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<BorrowTransactionState>(INITIAL_STATE)
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

  const borrow = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    const { market, assets, loanTokenSymbol } = input

    // -- validation -------------------------------------------------
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
        errorStage: "wrong-network",
      })
      onErrorRef.current?.("wrong-network", msg)
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
      const msg = "Borrow amount must be greater than zero."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    // F6B: hard cap against F6A-derived `maxBorrowCapacity` to prevent
    //      the user from borrowing more than the verified capacity gate
    //      permits. This protects against stale UI state where the typed
    //      amount exceeds the current oracle-derived capacity.
    if (input.maxBorrowCapacity === BigInt(0)) {
      busyRef.current = false
      const msg =
        "Borrow capacity is not currently available. Ensure you have " +
        "supplied collateral and the oracle price is fresh."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets > input.maxBorrowCapacity) {
      busyRef.current = false
      const msg = "Borrow amount exceeds current borrow capacity."
      setState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: msg,
        errorStage: "validation-failed",
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    // -- derive MarketParams from LendingMarket ------------------------
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
      // falls through to protocol-not-configured error below
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

    // -- resolve protocol contracts for chain --------------------------
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

    // -- preSendGuard ------------------------------------------------
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null, // borrow doesn't require loan-token balance
      amount: assets,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: BorrowTransactionState["errorStage"] =
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

    // -- simulate the borrow -----------------------------------------
    setState({ ...INITIAL_STATE, stage: "preparing" })

    let borrowData: `0x${string}` | null = null
    try {
      const { encodeMorphoBorrow } = await import(
        "@/lib/markets/onchain/abi"
      )
      borrowData = encodeMorphoBorrow({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets,
        shares: BigInt(0), // 0 → Morpho computes borrow shares internally
        onBehalf: wallet.address as Address,
        receiver: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct borrow calldata."
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
      from: wallet.address as Address,
      to: contracts.morphoBlueAddress,
      data: borrowData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg = sim.message ?? "Borrow simulation reverted."
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
    const sent = await sendBorrow({
      provider,
      from: wallet.address as Address,
      marketParams: mp,
      assets,
      shares: BigInt(0),
      onBehalf: wallet.address as Address,
      receiver: wallet.address as Address,
      contracts,
      chainId: ROBINHOOD_CHAIN_ID,
    })
    if (!sent.ok) {
      busyRef.current = false
      const msg = sent.error.message
      // Detect "insufficient funds for gas" from EIP-1193 transport.
      const isGas =
        msg.toLowerCase().includes("insufficient funds") ||
        msg.toLowerCase().includes("gas")
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
      const stage: BorrowTransactionState["errorStage"] = isGas
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

    // -- waitForReceipt -------------------------------------------
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: BorrowTransactionState["errorStage"] =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "Borrow transaction reverted on-chain."
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
    input.loanTokenDecimals,
    input.loanTokenSymbol,
    input.maxBorrowCapacity,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, borrow, reset }
}
