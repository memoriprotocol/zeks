"use client"

/**
 * useSupplyTransaction — Morpho Blue supply only. No approval. No withdraw.
 *
 * Phase F2C. Implements a simulation-first supply flow:
 *
 *   1. User clicks "Supply <token>" when readiness === "ready".
 *   2. We run preSendGuard + simulateWrite(supply calldata).
 *   3. We send Morpho Blue supply(MarketParams, assets, 0, onBehalf, "")
 *      with the EXACT typed amount.
 *   4. We poll for the receipt.
 *   5. On confirmed success, we bump refreshTick — the parent
 *      re-reads wallet balance, allowance, and Morpho position.
 *
 * What this hook does NOT do:
 *   - never sends an approval (F2B handles that)
 *   - never guesses a supply amount
 *   - never mocks a transaction
 *   - never auto-triggers after approval
 *
 * State machine (supply leg only):
 *
 *   idle
 *     -> simulating          (eth_call, no signature)
 *          -> awaiting_signature  (wallet popup open)
 *               -> submitted        (txHash returned)
 *                    -> confirming (eth_getTransactionReceipt poll)
 *                         -> success   (status === 0x1)
 *                         -> reverted  (status === 0x0)
 *                         -> timeout   (poll deadline exceeded)
 *               -> rejected    (EIP-1193 code 4001)
 *          -> simulation-failed  (eth_call reverted)
 *          -> rpc-error          (eth_call transport failed)
 *          -> wrong-network      (chainId != 4663)
 *          -> validation-failed  (amount <= 0 / insufficient balance / etc.)
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
  sendSupply,
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"

export type SupplyStage =
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

export interface SupplyTransactionState {
  stage: SupplyStage
  txHash: `0x${string}` | null
  /** User-facing message for errors. */
  errorMessage: string | null
  /** Decoded Solidity revert reason from simulation, when present. */
  simulationMessage: string | null
}

export interface SupplyTransactionInput {
  /** The LendingMarket row for the target market. Used to derive
   *  MorphoMarketParams (loanToken, collateralToken, oracle, irm,
   *  lltv). Caller is responsible for ensuring the row's
   *  loanTokenAddress / collateralTokenAddress / oracleAddress /
   *  irmAddress / lltv are populated (non-mock market). */
  market: LendingMarket
  /** Exact raw supply amount in loan-token smallest units.
   *  Must be > 0, finite, and <= wallet balance. The readiness
   *  gate in the parent enforces balance / allowance preconditions. */
  assets: bigint
  /** Decimals of the loan token. Used only for error messages. */
  decimals: number
  /** Symbol of the loan token. Used only for error messages. */
  tokenSymbol: string
  /** Optional callback fired after `success` is reached. */
  onSuccess?: (txHash: `0x${string}`) => void
  /** Optional callback fired on any error stage. */
  onError?: (stage: SupplyStage, message: string) => void
}

export interface SupplyTransactionOutput {
  state: SupplyTransactionState
  /** True if a transaction is in any pending phase — the parent MUST
   *  disable the CTA while this is true. */
  isPending: boolean
  /** Fire the supply flow. Safe to call from a button onClick. */
  supply: () => Promise<void>
  /** Reset local state back to idle. */
  reset: () => void
}

const INITIAL_STATE: SupplyTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
}

const PENDING_STAGES: ReadonlySet<SupplyStage> = new Set<SupplyStage>([
  "simulating",
  "awaiting_signature",
  "submitted",
  "confirming",
])

export function useSupplyTransaction(
  input: SupplyTransactionInput,
): SupplyTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<SupplyTransactionState>(INITIAL_STATE)
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

  const supply = React.useCallback(async () => {
    // -- single-flight guard ----------------------------------------
    if (busyRef.current) return
    busyRef.current = true

    const { market, assets, decimals, tokenSymbol } = input

    // -- validation -------------------------------------------------
    if (
      wallet.status !== "connected" ||
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID
    ) {
      busyRef.current = false
      const msg = "Wallet is not connected to Robinhood Chain."
      setState({ ...INITIAL_STATE, stage: "validation-failed", errorMessage: msg })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (!provider) {
      busyRef.current = false
      const msg = "No wallet provider available."
      setState({ ...INITIAL_STATE, stage: "validation-failed", errorMessage: msg })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets <= BigInt(0)) {
      busyRef.current = false
      const msg = `Supply amount must be > 0.`
      setState({ ...INITIAL_STATE, stage: "validation-failed", errorMessage: msg })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    // -- derive MarketParams from the LendingMarket -------------------
    // marketParamsFromLendingMarket throws `protocol-not-configured`
    // when required fields are null. We catch that and surface it
    // as a user-friendly error rather than a silent no-op.
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
      // falls through to the protocol-not-configured error below
    }
    if (!mp) {
      busyRef.current = false
      const msg =
        `Cannot construct market params for ${tokenSymbol}. ` +
        `Ensure the market is a real Morpho market and not a placeholder.`
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    // -- resolve protocol contracts for chain -----------------------
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

    // -- preSendGuard -----------------------------------------------
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null, // balance check is the parent's job (via readiness)
      amount: assets,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: SupplyStage =
        guard.stage === "rpc-error" ? "rpc-error" : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: guard.message,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // -- simulate the supply ---------------------------------------
    setState({ ...INITIAL_STATE, stage: "simulating" })

    // Build supply calldata: asset-based, shares=0, onBehalf=wallet
    let supplyData: `0x${string}` | null = null
    try {
      const { encodeMorphoSupply } = await import(
        "@/lib/markets/onchain/abi"
      )
      supplyData = encodeMorphoSupply({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets,
        shares: BigInt(0),
        onBehalf: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct supply calldata."
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
        const msg = sim.message ?? "Supply simulation reverted."
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

    // -- send supply ----------------------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_signature" }))
    const sent = await sendSupply({
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
      const stage: SupplyStage =
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

    // -- wait for receipt ----------------------------------------
    setState((prev) => ({ ...prev, stage: "confirming" }))
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: SupplyStage =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "Supply transaction reverted on-chain."
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
    input.decimals,
    input.tokenSymbol,
    wallet.status,
    wallet.address,
    wallet.chainId,
    provider,
  ])

  const isPending = PENDING_STAGES.has(state.stage)

  return { state, isPending, supply, reset }
}
