"use client"

/**
 * useWithdrawTransaction — Morpho Blue withdraw only. F3B.
 *
 * READS: F3A position view (usePositionView) — this hook is the
 * SINGLE-FLIGHT withdraw sender. It does NOT recompute the
 * shares-to-assets conversion; it only consumes the verified
 * userSuppliedAssets + maxWithdrawable values from F3A.
 *
 * Flow:
 *
 *   1. User clicks "Withdraw USDC" on WITHDRAW tab when
 *      readiness === "ready-to-withdraw".
 *   2. We run preSendGuard.
 *   3. We re-read market state fresh (defensive, same `latest`
 *      block). If the onchain state would no longer support the
 *      withdrawal (liquidity dropped, position changed), we abort
 *      cleanly without sending.
 *   4. We re-compute suppliedAssets + maxWithdrawable from the
 *      fresh market state using F3A's formula — same function the
 *      UI used. Any drift becomes a recoverable error.
 *   5. We encode `withdraw(MarketParams, assets, 0, onBehalf,
 *      receiver)` with assets = exact typed amount.
 *   6. We simulateWrite. Only on success do we send.
 *   7. We waitForReceipt. Only on status === 0x1 do we transition
 *      to success.
 *   8. We bump refreshTick — F3A re-reads position, market,
 *      balance, allowance.
 *
 * NO MAX_UINT256 is ever used (assets = exact typed amount).
 *
 * State machine:
 *   idle
 *     -> simulating          (eth_call, no signature)
 *          -> awaiting_signature
 *               -> submitted  (txHash returned)
 *                    -> confirming (eth_getTransactionReceipt)
 *                         -> success   (status === 0x1)
 *                         -> reverted  (status === 0x0)
 *                         -> timeout   (60s exceeded)
 *               -> rejected    (EIP-1193 4001)
 *          -> simulation-failed
 *          -> rpc-error
 *          -> wrong-network
 *          -> validation-failed  (stale state, exceeds cap, etc.)
 *          -> protocol-not-configured
 *
 * Duplicate-request protection:
 *   - busyRef (synchronous) — second click during any non-idle
 *     stage is a no-op.
 *   - isPending (derived) — CTA disabled.
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
  simulateWrite,
  waitForReceipt,
} from "@/lib/markets/onchain/write"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import type { LendingMarket } from "@/lib/markets/lending"
import {
  readMorphoMarket,
  toAssetsDown,
  marketFreeLiquidity,
  maxWithdrawableAssets,
  type MorphoMarketState,
} from "@/lib/markets/onchain/morpho-market"
import {
  readMorphoPosition,
  type MorphoPosition,
} from "@/lib/markets/onchain/morpho-position"

export type WithdrawStage =
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

export interface WithdrawTransactionState {
  stage: WithdrawStage
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
}

export interface WithdrawTransactionInput {
  market: LendingMarket
  /** Exact raw withdraw amount in loan-token smallest units.
   *  Must be > 0, <= userSuppliedAssets, <= maxWithdrawable. */
  assets: bigint
  /** Decimals of the loan token. Used only for error messages. */
  decimals: number
  /** Symbol of the loan token. Used only for error messages. */
  tokenSymbol: string
  /** Called after `success` is reached. */
  onSuccess?: (txHash: `0x${string}`) => void
  /** Called on any error stage. */
  onError?: (stage: WithdrawStage, message: string) => void
}

export interface WithdrawTransactionOutput {
  state: WithdrawTransactionState
  /** True if a withdraw transaction is in any pending phase. */
  isPending: boolean
  /** Fire the withdraw flow. Safe to call from a button onClick. */
  withdraw: () => Promise<void>
  /** Reset local state to idle. */
  reset: () => void
}

const INITIAL_STATE: WithdrawTransactionState = {
  stage: "idle",
  txHash: null,
  errorMessage: null,
  simulationMessage: null,
}

const PENDING_STAGES: ReadonlySet<WithdrawStage> = new Set<WithdrawStage>([
  "simulating",
  "awaiting_signature",
  "submitted",
  "confirming",
])

export function useWithdrawTransaction(
  input: WithdrawTransactionInput,
): WithdrawTransactionOutput {
  const wallet = useWallet()
  const [state, setState] =
    React.useState<WithdrawTransactionState>(INITIAL_STATE)
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
    // single-flight guard
    if (busyRef.current) return
    busyRef.current = true

    const { market, assets, decimals, tokenSymbol } = input

    // -- early validation ------------------------------------------------
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
      const msg = `Withdraw amount must be > 0.`
      setState({ ...INITIAL_STATE, stage: "validation-failed", errorMessage: msg })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (!market.marketId) {
      busyRef.current = false
      const msg = "Market is missing its onchain id."
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
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
      // falls through
    }
    if (!mp) {
      busyRef.current = false
      const msg =
        `Cannot construct market params for ${tokenSymbol}. ` +
        `Ensure the market is a real Morpho market.`
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

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

    // -- preSendGuard ---------------------------------------------------
    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: null,
      amount: assets,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      const stage: WithdrawStage =
        guard.stage === "rpc-error" ? "rpc-error" : "validation-failed"
      setState({
        ...INITIAL_STATE,
        stage,
        errorMessage: guard.message,
      })
      onErrorRef.current?.(stage, guard.message)
      return
    }

    // -- fresh position + market read (defensive against stale UI) -----
    setState({ ...INITIAL_STATE, stage: "simulating" })
    const opts = { chainId: wallet.chainId, timeoutMs: 5_000 } as const
    const [freshPos, freshMarket] = await Promise.all([
      readMorphoPosition(
        MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`,
        market.marketId as `0x${string}`,
        wallet.address,
        opts,
      ),
      readMorphoMarket(
        MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`,
        market.marketId as `0x${string}`,
        opts,
      ),
    ])
    if (freshPos === null && freshMarket === null) {
      busyRef.current = false
      const msg = "Could not read fresh onchain state."
      setState({
        ...INITIAL_STATE,
        stage: "rpc-error",
        errorMessage: msg,
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }
    if (freshMarket === null) {
      busyRef.current = false
      const msg = "Could not read fresh market state."
      setState({
        ...INITIAL_STATE,
        stage: "rpc-error",
        errorMessage: msg,
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }
    const positionForCalc: MorphoPosition =
      freshPos ??
      ({
        supplyShares: BigInt(0),
        borrowShares: BigInt(0),
        collateral: BigInt(0),
      } as MorphoPosition)
    const marketForCalc: MorphoMarketState = freshMarket

    // Recompute suppliedAssets + maxWithdrawable using F3A math.
    const freshSupplied = toAssetsDown(
      positionForCalc.supplyShares,
      marketForCalc.totalSupplyAssets,
      marketForCalc.totalSupplyShares,
    )
    const freshMax = maxWithdrawableAssets(freshSupplied, marketForCalc)
    if (freshMax === null) {
      busyRef.current = false
      const msg = "Withdrawable amount could not be derived."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (positionForCalc.supplyShares === BigInt(0) || freshSupplied === BigInt(0)) {
      busyRef.current = false
      const msg = "No supply position to withdraw from."
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets > freshSupplied) {
      busyRef.current = false
      const msg = `Amount exceeds your supplied position.`
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }
    if (assets > freshMax) {
      busyRef.current = false
      const msg = `Amount exceeds current withdrawable (market liquidity constraint).`
      setState({
        ...INITIAL_STATE,
        stage: "validation-failed",
        errorMessage: msg,
      })
      onErrorRef.current?.("validation-failed", msg)
      return
    }

    // -- encode withdraw calldata -------------------------------------
    let withdrawData: `0x${string}` | null = null
    try {
      const { encodeMorphoWithdraw } = await import(
        "@/lib/markets/onchain/abi"
      )
      withdrawData = encodeMorphoWithdraw({
        contracts,
        chainId: ROBINHOOD_CHAIN_ID,
        params: mp,
        assets,
        shares: BigInt(0),
        onBehalf: wallet.address as Address,
        receiver: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      const msg =
        err instanceof Error
          ? `Calldata construction failed: ${err.message}`
          : "Failed to construct withdraw calldata."
      setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: msg,
      })
      onErrorRef.current?.("protocol-not-configured", msg)
      return
    }

    // -- simulateWrite (mandatory) ------------------------------------
    const sim = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: contracts.morphoBlueAddress,
      data: withdrawData,
    })
    if (!sim.ok) {
      busyRef.current = false
      if (sim.reason === "reverted") {
        const msg = sim.message ?? "Withdraw simulation reverted."
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

    // -- eth_sendTransaction -----------------------------------------
    setState((prev) => ({ ...prev, stage: "awaiting_signature" }))
    let sent: { ok: true; txHash: `0x${string}` } | {
      ok: false
      error: { stage: string; message: string }
    }
    try {
      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: wallet.address,
            to: contracts.morphoBlueAddress,
            data: withdrawData,
          },
        ],
      })) as `0x${string}`
      sent = { ok: true, txHash }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      // EIP-1193 user rejection.
      if (e?.code === 4001) {
        busyRef.current = false
        const msg = e.message ?? "Withdraw rejected in wallet."
        setState({
          ...INITIAL_STATE,
          stage: "rejected",
          errorMessage: msg,
        })
        onErrorRef.current?.("rejected", msg)
        return
      }
      busyRef.current = false
      const msg = e?.message ?? "eth_sendTransaction failed."
      setState({
        ...INITIAL_STATE,
        stage: "rpc-error",
        errorMessage: msg,
      })
      onErrorRef.current?.("rpc-error", msg)
      return
    }

    setState((prev) => ({
      ...prev,
      stage: "submitted",
      txHash: sent.txHash,
    }))

    // -- wait for receipt --------------------------------------------
    setState((prev) => ({ ...prev, stage: "confirming" }))
    const receipt = await waitForReceipt(provider, sent.txHash)
    if (!receipt.ok) {
      busyRef.current = false
      const stage: WithdrawStage =
        receipt.error.stage === "reverted" ? "reverted" : "timeout"
      const msg =
        stage === "reverted"
          ? "Withdraw transaction reverted on-chain."
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

  return { state, isPending, withdraw, reset }
}
