"use client"

/**
 * useApprovalTransaction — ERC20 approval only. No supply. No withdraw.
 *
 * Phase F2B. Implements a SAFE two-step approval flow:
 *
 *   1. User clicks "Approve <TOKEN>" in the action panel.
 *   2. We run preSendGuard + simulateWrite(approve calldata).
 *   3. We send approve() with the EXACT required amount — never
 *      MAX_UINT256, never an unlimited approval.
 *   4. We poll for the receipt.
 *   5. On confirmed success, we re-read the onchain allowance via
 *      `readErc20Allowance`. Only if the new allowance is
 *      >= the required amount does the hook report `success`.
 *   6. The parent component then transitions its CTA from
 *      "Approve <TOKEN>" to "Supply <TOKEN>".
 *
 * What this hook does NOT do:
 *   - never sends a supply() transaction
 *   - never auto-supplies after approval
 *   - never reuses the user's typed amount for any other purpose
 *   - never calls wallet_requestPermissions
 *
 * State machine (one leg — approval only):
 *
 *   idle
 *     -> simulating            (eth_call, no signature)
 *          -> awaiting_signature   (wallet popup open)
 *               -> submitted         (txHash returned)
 *                    -> confirming   (eth_getTransactionReceipt poll)
 *                         -> success  (status === 0x1 + allowance >= required)
 *                         -> reverted (status === 0x0)
 *                         -> timeout   (poll deadline exceeded)
 *               -> rejected         (EIP-1193 code 4001)
 *          -> simulation-failed (eth_call reverted)
 *          -> wrong-network     (chainId != 4663)
 *          -> rpc-error         (eth_call transport failed)
 *
 * Duplicate-request protection:
 *   - busyRef (synchronous) — second click during ANY non-idle stage
 *     is a no-op.
 *   - isPending (derived from state) — CTA disabled during every
 *     non-idle / non-error / non-success stage.
 */

import * as React from "react"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  readErc20Allowance,
} from "@/lib/markets/onchain/erc20"
import { encodeErc20Approve } from "@/lib/markets/onchain/abi"
import {
  preSendGuard,
  sendApprove,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export type ApprovalStage =
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
  | "simulation-failed"
  | "rpc-error"
  | "validation-failed"
  | "no-provider"

export interface ApprovalTransactionState {
  stage: ApprovalStage
  txHash: `0x${string}` | null
  /** User-facing message (errors, simulation revert, etc.). */
  errorMessage: string | null
  /** Decoded Solidity revert reason from simulation, when present. */
  simulationMessage: string | null
  /** The amount that was approved (raw bigint). */
  approvedAmount: bigint | null
  /** The allowance observed after confirmation. */
  observedAllowance: bigint | null
}

export interface ApprovalTransactionInput {
  /** Token contract address to approve. */
  token: `0x${string}`
  /** Spender (Morpho Blue core address). Pinned by the caller to the
   *  verified registry — never accepted from user input. */
  spender: `0x${string}`
  /** Exact raw amount to approve. Caller MUST pass a positive finite
   *  bigint. This hook never substitutes MAX_UINT256. */
  amount: bigint
  /** Chain id (must be Robinhood Chain 4663). The hook refuses to
   *  run on any other chain. */
  chainId: number
  /** Optional callback fired after `success` is reached. Receives the
   *  observed allowance so the parent can transition the UI without
   *  a second read. */
  onSuccess?: (observedAllowance: bigint) => void
  /** Optional callback fired on any error stage. */
  onError?: (stage: ApprovalStage, message: string) => void
}

export interface ApprovalTransactionOutput {
  state: ApprovalTransactionState
  /** True if a transaction is in any pending phase — the parent MUST
   *  disable the CTA while this is true. */
  isPending: boolean
  /** Fire the approval flow. Safe to call from a button onClick —
   *  internally guarded against duplicate requests. */
  approve: () => Promise<void>
  /** Clear local state back to idle (does NOT touch chain). Useful
   *  after the user dismisses an error. */
  reset: () => void
}

const INITIAL_STATE: ApprovalTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
  approvedAmount: null,
  observedAllowance: null,
}

/**
 * 10^n as bigint. Duplicated locally so this file is self-contained
 * and easy to reason about in isolation.
 */
function pow10Big(n: bigint): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = BigInt(0); i < n; i++) r *= ten
  return r
}

const PENDING_STAGES: ReadonlySet<ApprovalStage> = new Set<ApprovalStage>([
  "simulating",
  "awaiting_signature",
  "submitted",
  "confirming",
])

export function useApprovalTransaction(
  input: ApprovalTransactionInput,
): ApprovalTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<ApprovalTransactionState>(INITIAL_STATE)
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

  const approve = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    // -- validate inputs -------------------------------------------
    if (!input.token || !input.spender || input.amount <= BigInt(0)) {
      busyRef.current = false
      const msg = "Approval amount must be > 0."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
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
      })
      onErrorRef.current?.("no-provider", msg)
      return
    }

    // -- preSendGuard: catches chainId drift, account change, etc. --
    // For approval the only invariant we re-check is chain id +
    // account. marketParams are NOT required for an approve() call.
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null, // not checked here — readiness layer handles it
      amount: input.amount,
      marketParams: null,
      market: {
        // preSendGuard accepts a LendingMarket for staleness checks
        // only; we pass a minimal stub because approval is independent
        // of market state. The `requireMarketIdMatch` flag is false
        // for approval (only set on the supply leg).
        symbol: "",
        name: "",
        logoUrl: null,
        oraclePrice: null,
        oracleSource: "none",
        supplyApy: null,
        borrowApy: null,
        totalSupply: null,
        totalBorrow: null,
        availableLiquidity: null,
        utilization: null,
        tvl: null,
        status: "active",
        protocolSource: "morpho",
        sourceMode: "real-morpho",
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
      // preSendGuard only ever returns rpc-error or validation-failed;
      // anything related to chain mismatch is surfaced as rpc-error.
      const stage: ApprovalStage = "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: guard.message,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // -- build exact-amount approve calldata ------------------------
    // Hard-pinned to the verified Morpho Blue address. Caller passed
    // `spender`, but we double-check against the registry to be safe.
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
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    const approveData = encodeErc20Approve(verifiedSpender, input.amount)

    // -- simulate first ---------------------------------------------
    setState({
      ...INITIAL_STATE,
      stage: "simulating",
      approvedAmount: input.amount,
    })
    const sim = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: input.token,
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

    // -- send the approve() -----------------------------------------
    setState((prev) => ({
      ...prev,
      stage: "awaiting_signature",
    }))
    const sent = await sendApprove({
      provider,
      from: wallet.address as Address,
      token: input.token,
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

    // -- wait for receipt -------------------------------------------
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
    // Even though the receipt confirmed, we re-read to:
    //   1. catch any partial / non-standard ERC20 implementations
    //   2. prove to the UI that the new allowance >= typed amount
    //      before enabling the Supply step
    const newAllowanceRes = await readErc20Allowance(
      input.token,
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
    input.token,
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

/* -- exports for callers that need to format allowance as text -- */

export function formatAllowanceRaw(
  allowance: bigint | null,
  decimals: number | null,
): string {
  if (allowance === null || decimals === null) return "—"
  const factor = pow10Big(BigInt(decimals))
  const whole = allowance / factor
  const frac = allowance % factor
  if (frac === BigInt(0)) return whole.toString()
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return `${whole.toString()}.${fracStr}`
}
