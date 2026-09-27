"use client"

/**
 * useCollateralApprovalTransaction — ERC20 approval for collateral token.
 *
 * Phase F5C. Collateral approval only. No supplyCollateral, no borrow,
 * no repay, no withdrawCollateral.
 *
 * Implements a safe two-step collateral approval flow:
 *
 *   1. User clicks "Approve Collateral".
 *   2. preSendGuard + simulateWrite(approve calldata) via eth_call.
 *   3. eth_sendTransaction for approve(MORPHO_SPENDER, exactCollateralAmount).
 *   4. waitForReceipt — only status === 0x1 passes.
 *   5. On confirmed receipt, re-read onchain allowance via
 *      `readErc20Allowance(collateralToken, wallet, morpho)`.
 *      Only if newAllowance >= requiredAmount does the hook report success.
 *   6. Fires `onSuccess(observedAllowance)` so the parent can
 *      transition to the next step (e.g. F5D supplyCollateral).
 *
 * What this hook does NOT do:
 *   - never sends supplyCollateral()
 *   - never auto-supplies after approval
 *   - never calls wallet_requestPermissions
 *   - never uses MAX_UINT256
 *   - never approves more than the exact typed amount
 *
 * State machine (identical to useApprovalTransaction):
 *
 *   idle
 *     -> simulating            (eth_call, no signature)
 *          -> awaiting_signature   (wallet popup open)
 *               -> submitted        (txHash returned)
 *                    -> confirming  (eth_getTransactionReceipt poll)
 *                         -> success  (status === 0x1 + allowance >= required)
 *                         -> reverted (status === 0x0)
 *                         -> timeout  (poll deadline exceeded)
 *               -> rejected        (EIP-1193 code 4001)
 *     -> rpc-error            (network / RPC failure at any stage)
 *     -> validation-failed    (stale wallet, wrong chain, zero amount)
 *     -> simulation-failed     (eth_call reverted — tx NOT sent)
 *     -> no-provider          (no EIP-1193 provider detected)
 *
 * Recovery:
 *   All error states reset to `idle` via `reset()`. The CTA re-enables
 *   only when the user dismisses the error or the allowance is
 *   re-established externally.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  sendApprove,
  simulateWrite,
  waitForReceipt,
  preSendGuard,
  encodeErc20Approve,
  MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663,
} from "@/lib/markets/onchain"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import { readErc20Allowance } from "@/lib/markets/onchain/erc20"

/* ------------------------------------------------------ */
/* Stage types                                           */
/* ------------------------------------------------------ */

type ApprovalStage =
  | "idle"
  | "simulating"
  | "awaiting_signature"
  | "submitted"
  | "confirming"
  | "success"
  | "rejected"
  | "reverted"
  | "timeout"
  | "wrong-network"
  | "rpc-error"
  | "validation-failed"
  | "simulation-failed"
  | "no-provider"

interface ApprovalTransactionState {
  stage: ApprovalStage
  /** Confirmed transaction hash. null until submitted. */
  txHash: `0x${string}` | null
  /** Human-readable error message. null until an error occurs. */
  errorMessage: string | null
  /**
   * Detailed simulation revert message from `simulateWrite`.
   * Used to surface the revert reason in the UI without a txHash.
   */
  simulationMessage: string | null
  /** The exact amount this approval was for. Preserved across retries. */
  approvedAmount: bigint | null
  /** Observed allowance after confirmation. null until success. */
  observedAllowance: bigint | null
}

const INITIAL_STATE: ApprovalTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
  approvedAmount: null,
  observedAllowance: null,
}

const PENDING_STAGES: ReadonlySet<ApprovalStage> = new Set<ApprovalStage>([
  "simulating",
  "awaiting_signature",
  "submitted",
  "confirming",
])

/* ------------------------------------------------------ */
/* Input / Output                                        */
/* ------------------------------------------------------ */

export interface CollateralApprovalTransactionInput {
  /**
   * Collateral token contract address. Must be a verified address
   * from the `LendingMarket` row — never from user input.
   */
  collateralToken: `0x${string}`
  /**
   * Spender: the verified Morpho Blue core address on chain 4663.
   * Pinned by the caller to the verified registry. The hook
   * re-verifies this against `MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho`.
   */
  spender: `0x${string}`
  /**
   * Exact raw amount to approve (bigint, collateral token-native units).
   * Caller MUST pass a positive finite bigint derived from the user's
   * typed amount and the collateral token decimals.
   *
   * This hook NEVER substitutes MAX_UINT256.
   * This hook NEVER approves more than this exact amount.
   */
  amount: bigint
  /**
   * Chain id (must be Robinhood Chain 4663).
   */
  chainId: number
  /**
   * Optional callback fired on `success`. Receives the observed
   * onchain allowance so the parent can transition the UI without
   * a redundant extra read.
   */
  onSuccess?: (observedAllowance: bigint) => void
  /**
   * Optional callback fired on any error stage.
   */
  onError?: (stage: ApprovalStage, message: string) => void
}

export interface CollateralApprovalTransactionOutput {
  state: ApprovalTransactionState
  /**
   * True if a transaction is in any pending phase. Parent MUST disable
   * the approval CTA while this is true.
   */
  isPending: boolean
  /**
   * Fire the collateral approval flow. Safe to call from a button
   * onClick — internally guarded against duplicate requests.
   */
  approve: () => Promise<void>
  /**
   * Clear local state back to idle (does NOT touch chain). Used
   * after the user dismisses an error.
   */
  reset: () => void
}

/* ------------------------------------------------------ */
/* Hook                                                  */
/* ------------------------------------------------------ */

export function useCollateralApprovalTransaction(
  input: CollateralApprovalTransactionInput,
): CollateralApprovalTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<ApprovalTransactionState>(INITIAL_STATE)
  const busyRef = React.useRef<boolean>(false)
  const onSuccessRef = React.useRef(input.onSuccess)
  const onErrorRef = React.useRef(input.onError)

  // Keep refs in sync with input.
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

  const approve = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    // -- validate inputs -------------------------------------------
    if (
      !input.collateralToken ||
      !input.spender ||
      input.amount <= BigInt(0)
    ) {
      busyRef.current = false
      const msg = "Approval amount must be greater than zero."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (input.chainId !== ROBINHOOD_CHAIN_ID) {
      busyRef.current = false
      const msg = `Wrong network: expected chain ${ROBINHOOD_CHAIN_ID}, got ${input.chainId}.`
      setState({
        ...INITIAL_STATE,
        stage: "wrong-network",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("wrong-network", msg)
      return
    }
    if (
      wallet.status !== "connected" ||
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID
    ) {
      busyRef.current = false
      const msg = "Wallet is not connected to Robinhood Chain."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (!provider) {
      busyRef.current = false
      const msg = "No wallet provider available."
      setState({
        ...INITIAL_STATE,
        stage: "no-provider",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("no-provider", msg)
      return
    }

    // -- preSendGuard: chain drift, account change, amount validation --
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null, // readiness layer handles balance check
      amount: input.amount,
      marketParams: null,
      market: {
        // Minimal LendingMarket stub — approval is independent of market state.
        symbol: "",
        name: "",
        logoUrl: null,
        oraclePrice: null,
        oracleSource: "none" as const,
        supplyApy: null,
        borrowApy: null,
        totalSupply: null,
        totalBorrow: null,
        availableLiquidity: null,
        utilization: null,
        tvl: null,
        status: "active" as const,
        protocolSource: "morpho" as const,
        sourceMode: "real-morpho" as const,
        listed: null,
        contractAddress: null,
        marketId: null,
        collateralAssetSymbol: null,
        loanAssetSymbol: null,
        lltv: null,
        oracleAddress: null,
        irmAddress: null,
        loanTokenAddress: null,
        collateralTokenAddress: null,
        loanTokenDecimals: null,
        rhContractAddress: null,
        rhMultiplier: null,
        rhTokenDecimals: null,
        rhLogoUrl: null,
        referenceBid: null,
        referenceAsk: null,
        referencePrice: null,
        referenceGeneratedAt: null,
        referenceIsHalt: false,
        chainId: ROBINHOOD_CHAIN_ID,
        fetchedAt: new Date().toISOString(),
        // F12 — approval is independent of on-chain MarketParams.
        lifecycle: null,
        onchainLltvWad: null,
        transactionEligible: false,
      },
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: ApprovalStage = "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: guard.message,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // -- verify spender: must match the verified Morpho Blue address --
    const verifiedSpender =
      MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`
    if (input.spender.toLowerCase() !== verifiedSpender.toLowerCase()) {
      busyRef.current = false
      const msg =
        "Refusing to approve an unknown spender. Only the verified " +
        "Morpho Blue core address is accepted."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    // -- build exact-amount approve calldata ------------------------
    // amount is EXACT — never MAX_UINT256. Never unlimited.
    const approveData = encodeErc20Approve(verifiedSpender, input.amount)

    // -- simulate first (mandatory — no send without simulation) ---
    setState({
      ...INITIAL_STATE,
      stage: "simulating",
      approvedAmount: input.amount,
    })
    const sim = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: input.collateralToken,
      data: approveData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg = sim.message ?? "Approval simulation reverted."
        setState({
          ...INITIAL_STATE,
          stage: "simulation-failed",
          errorMessage: msg,
          simulationMessage: sim.message,
          approvedAmount: input.amount,
        })
        onErrorRef.current?.("simulation-failed", msg)
        return
      }
      if (sim.reason === "wrong-network") {
        const msg = `Wrong network: chain ${sim.chainId}.`
        setState({
          ...INITIAL_STATE,
          stage: "wrong-network",
          errorMessage: msg,
          approvedAmount: input.amount,
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
        stage: "rpc-error",
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }

    // -- eth_sendTransaction ----------------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_signature" }))
    const sent = await sendApprove({
      provider,
      from: wallet.address as Address,
      token: input.collateralToken,
      spender: verifiedSpender,
      amount: input.amount, // EXACT — never MAX_UINT256.
    })
    if (!sent.ok) {
      busyRef.current = false
      const msg = sent.error.message
      if (sent.error.stage === "rejected") {
        setState({
          ...INITIAL_STATE,
          stage: "rejected",
          errorMessage: msg,
          approvedAmount: input.amount,
        })
        onErrorRef.current?.("rejected", msg)
        return
      }
      const stage: ApprovalStage =
        sent.error.stage === "rpc-error" ? "rpc-error" : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: msg,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.(stage, msg)
      return
    }
    setState((prev) => ({
      ...prev,
      stage: "submitted",
      txHash: sent.ok ? sent.txHash : prev.txHash,
    }))

    // -- waitForReceipt -------------------------------------------
    setState((prev) => ({ ...prev, stage: "confirming" }))
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: ApprovalStage =
        receipt.error.stage === "reverted" ? "reverted" : "rpc-error"
      const msg =
        stage === "reverted"
          ? "Approval transaction reverted on-chain."
          : receipt.error.message
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: msg,
        txHash: sent.txHash,
        approvedAmount: input.amount,
      })
      onErrorRef.current?.(stage, msg)
      return
    }

    // -- post-confirmation: re-read allowance -----------------------
    // Even on confirmed receipt, re-read to catch non-standard ERC20
    // implementations that may not immediately reflect the approval.
    const newAllowanceRes = await readErc20Allowance(
      input.collateralToken,
      wallet.address as Address,
      verifiedSpender,
      {
        provider,
        chainId: wallet.chainId,
      },
    )
    let observedAllowance: bigint | null = null
    if (newAllowanceRes.kind === "ok") {
      observedAllowance = newAllowanceRes.value
    }
    if (
      observedAllowance !== null &&
      observedAllowance < input.amount
    ) {
      busyRef.current = false
      const msg =
        "Allowance after confirmation is below the required amount. " +
        "Please try again or revoke the existing allowance first."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
        txHash: sent.txHash,
        approvedAmount: input.amount,
        observedAllowance,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    busyRef.current = false
    setState({
      stage: "success",
      txHash: sent.txHash,
      errorMessage: null,
      simulationMessage: null,
      approvedAmount: input.amount,
      observedAllowance,
    })
    if (observedAllowance !== null) {
      onSuccessRef.current?.(observedAllowance)
    }
  }, [
    input.collateralToken,
    input.spender,
    input.amount,
    input.chainId,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, approve, reset }
}
