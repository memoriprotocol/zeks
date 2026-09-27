"use client"

/**
 * useSupplyCollateralTransaction — Morpho Blue supplyCollateral only.
 * No approval, no borrow, no repay, no withdrawCollateral.
 *
 * Phase F5D. Implements a simulation-first collateral supply flow:
 *
 *   1. User clicks "Supply Collateral" when readiness === "ready".
 *   2. preSendGuard + simulateWrite(supplyCollateral calldata) via eth_call.
 *   3. eth_sendTransaction for
 *      supplyCollateral(MarketParams, exactCollateralAmount, wallet, "").
 *   4. waitForReceipt — only status === 0x1 passes.
 *   5. On confirmed success, fires `onSuccess(txHash)` — the parent
 *      bumps `refreshTick` to re-read position, balance, and allowance.
 *
 * Prerequisites enforced by the caller (via useSupplyCollateralReadiness):
 *   - Collateral allowance is sufficient (approved in F5C).
 *   - Wallet balance >= amount.
 *   - Amount > 0.
 *
 * What this hook does NOT do:
 *   - never sends an approval (F5C handles that)
 *   - never guesses a supply amount
 *   - never mocks a transaction
 *   - never auto-triggers after approval
 *   - never sends borrow, repay, or withdrawCollateral
 *
 * State machine:
 *
 *   idle
 *     -> simulating            (eth_call, no signature)
 *          -> awaiting_signature  (wallet popup open)
 *               -> submitted        (txHash returned)
 *                    -> confirming  (eth_getTransactionReceipt poll)
 *                         -> success  (status === 0x1)
 *                         -> reverted (status === 0x0)
 *                         -> timeout  (poll deadline exceeded)
 *               -> rejected         (EIP-1193 code 4001)
 *          -> simulation-failed  (eth_call reverted — tx NOT sent)
 *          -> rpc-error          (eth_call transport failed)
 *          -> wrong-network      (chainId != 4663)
 *          -> validation-failed  (amount <= 0 / insufficient balance / etc.)
 *          -> protocol-not-configured (missing MarketParams)
 *
 * Duplicate-request protection:
 *   - busyRef (synchronous) — second click during any non-idle stage
 *     is a no-op.
 *   - isPending (derived) — CTA is disabled during every pending stage.
 */

import * as React from "react"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  marketParamsFromLendingMarket,
  MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663,
} from "@/lib/markets/onchain/abi"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import {
  preSendGuard,
  sendSupplyCollateral,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"

/* ------------------------------------------------------ */
/* Stage / State types                                    */
/* ------------------------------------------------------ */

export type SupplyCollateralStage =
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
  | "protocol-not-configured"

export interface SupplyCollateralTransactionState {
  stage: SupplyCollateralStage
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
}

const INITIAL_STATE: SupplyCollateralTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
}

const PENDING_STAGES: ReadonlySet<SupplyCollateralStage> = new Set<SupplyCollateralStage>([
  "simulating",
  "awaiting_signature",
  "submitted",
  "confirming",
])

/* ------------------------------------------------------ */
/* Input / Output                                        */
/* ------------------------------------------------------ */

export interface SupplyCollateralTransactionInput {
  /**
   * The LendingMarket row. Used to derive Morpho MarketParams
   * (loanToken, collateralToken, oracle, irm, lltv). The caller
   * is responsible for ensuring collateralTokenAddress / oracleAddress
   * / lltv are populated (non-mock market).
   */
  market: LendingMarket
  /**
   * Exact raw collateral amount in token-native smallest units.
   * Must be > 0, finite, and <= wallet collateral balance.
   * Allowance must already be sufficient (enforced by caller via
   * useSupplyCollateralReadiness).
   */
  assets: bigint
  /**
   * Collateral token metadata for error messages and consistency checks.
   */
  collateralToken: {
    address: `0x${string}`
    symbol: string | null
    decimals: number
  }
  /**
   * Optional callback fired after `success` is reached. The parent
   * should bump its refreshTick to re-read position, balance, and allowance.
   */
  onSuccess?: (txHash: `0x${string}`) => void
  /**
   * Optional callback fired on any error stage.
   */
  onError?: (stage: SupplyCollateralStage, message: string) => void
}

export interface SupplyCollateralTransactionOutput {
  state: SupplyCollateralTransactionState
  /**
   * True if a transaction is in any pending phase. Parent MUST disable
   * the Supply Collateral CTA while this is true.
   */
  isPending: boolean
  /**
   * Fire the supplyCollateral flow. Safe to call from a button onClick.
   */
  supplyCollateral: () => Promise<void>
  /**
   * Reset local state back to idle (does NOT touch chain).
   */
  reset: () => void
}

/* ------------------------------------------------------ */
/* Hook                                                   */
/* ------------------------------------------------------ */

export function useSupplyCollateralTransaction(
  input: SupplyCollateralTransactionInput,
): SupplyCollateralTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<SupplyCollateralTransactionState>(INITIAL_STATE)
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

  const supplyCollateral = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    const { market, assets, collateralToken } = input

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
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets <= BigInt(0)) {
      busyRef.current = false
      const msg = "Collateral amount must be greater than zero."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
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
        `Cannot construct market params for ${collateralToken.symbol ?? "market"}. ` +
        `Ensure the market is a real Morpho market.`
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    // -- consistency: collateral token address must match MarketParams --
    // Guard against stale market data where the LendingMarket row's
    // collateralTokenAddress no longer matches the MarketParams.
    if (
      mp.collateralToken.toLowerCase() !==
      collateralToken.address.toLowerCase()
    ) {
      busyRef.current = false
      const msg = "Collateral token mismatch with market params. Please refresh the market data."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
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
        stage: "protocol-not-configured",
        errorMessage: msg,
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
      walletBalance: null, // balance check is the caller's responsibility
      amount: assets,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: SupplyCollateralStage =
        guard.stage === "rpc-error" ? "rpc-error" : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: guard.message,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // -- simulate supplyCollateral ------------------------------------
    setState({ ...INITIAL_STATE, stage: "simulating" })

    let supplyData: `0x${string}` | null = null
    try {
      const { encodeMorphoSupplyCollateral } = await import(
        "@/lib/markets/onchain/abi"
      )
      supplyData = encodeMorphoSupplyCollateral({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets,
        onBehalf: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct supplyCollateral calldata."
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    const sim = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: contracts.morphoBlueAddress,
      data: supplyData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg = sim.message ?? "Supply collateral simulation reverted."
        setState({
          ...INITIAL_STATE,
          stage: "simulation-failed",
          errorMessage: msg,
          simulationMessage: sim.message ?? null,
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
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }

    // -- eth_sendTransaction ----------------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_signature" }))
    const sent = await sendSupplyCollateral({
      provider,
      from: wallet.address as Address,
      marketParams: mp,
      assets,
      onBehalf: wallet.address as Address,
      contracts,
      chainId: ROBINHOOD_CHAIN_ID,
    })
    if (!sent.ok) {
      busyRef.current = false
      const msg = sent.error.message
      if (sent.error.stage === "rejected") {
        setState({
          ...INITIAL_STATE,
          stage: "rejected",
          errorMessage: msg,
        })
        onErrorRef.current?.("rejected", msg)
        return
      }
      const stage: SupplyCollateralStage =
        sent.error.stage === "rpc-error"
          ? "rpc-error"
          : sent.error.stage === "protocol-not-configured"
            ? "protocol-not-configured"
            : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: msg,
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
      const stage: SupplyCollateralStage =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "Supply collateral transaction reverted on-chain."
          : receipt.error.message
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: msg,
        txHash: sent.txHash,
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
    })
    onSuccessRef.current?.(sent.txHash)
  }, [
    input.market,
    input.assets,
    input.collateralToken,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, supplyCollateral, reset }
}
