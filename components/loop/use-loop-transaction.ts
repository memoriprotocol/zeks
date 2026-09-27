"use client"

/**
 * ZEKS Loop — F13 four-leg orchestration hook.
 *
 * Composes the locked F5C / F5D / F6A / F6B / F2A / F2B / F2C
 * transaction hooks into a single sequential Loop flow:
 *
 *   Leg 1 — approve collateral token   (useCollateralApprovalTransaction, F5C-writer)
 *   Leg 2 — supplyCollateral           (useSupplyCollateralTransaction, F5D-writer)
 *   Leg 3 — borrow stablecoin          (useBorrowTransaction,        F6B-writer)
 *   Leg 4 — supply to yield venue      (useSupplyTransaction,        F2C-writer)
 *
 * Pure GLUE. No new transaction logic. No new encoding. No new
 * state machines. Each writer is invoked EXACTLY as the locked
 * Earn page invokes it; F13 only sequences them.
 *
 * Hard rules:
 *   - Each leg MUST complete successfully before the next leg can
 *     become eligible.
 *   - The hook NEVER auto-submits the next transaction.
 *   - Every transaction requires an EXPLICIT user click — the
 *     caller wires each `executeLeg(N)` to its own button.
 *   - A failed / rejected / reverted leg stops progression.
 *   - F12 transaction eligibility gates the entire orchestration.
 *   - Wallet / network gating mirrors the locked readiness hooks.
 */

import * as React from "react"
import type { LendingMarket } from "@/lib/markets/lending"
import {
  useCollateralApprovalReadiness,
  type CollateralApprovalReadiness,
} from "@/components/earn/use-collateral-approval-readiness"
import {
  useSupplyCollateralReadiness,
  type SupplyCollateralReadiness,
} from "@/components/earn/use-supply-collateral-readiness"
import { useBorrowReadiness, type BorrowReadiness } from "@/components/earn/use-borrow-readiness"
import { useSupplyReadiness, type SupplyReadiness } from "@/components/earn/use-supply-readiness"
import {
  useCollateralApprovalTransaction,
  type CollateralApprovalTransactionOutput,
} from "@/components/earn/use-collateral-approval-transaction"
import {
  useSupplyCollateralTransaction,
  type SupplyCollateralTransactionOutput,
} from "@/components/earn/use-supply-collateral-transaction"
import {
  useBorrowTransaction,
  type BorrowTransactionOutput,
} from "@/components/earn/use-borrow-transaction"
import {
  useSupplyTransaction,
  type SupplyTransactionOutput,
} from "@/components/earn/use-supply-transaction"
import {
  ROBINHOOD_CHAIN_ID_DEC,
  MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663,
} from "@/lib/markets/onchain"
import { emitDataInvalidate } from "@/components/markets/data-invalidate"
import { useWallet } from "@/components/app/wallet/use-wallet"

/* ──────────────────────────────────────────────────────────────────
 * Public types
 * ──────────────────────────────────────────────────────────────────── */

export type LoopLeg =
  | "approve-collateral"
  | "supply-collateral"
  | "borrow"
  | "supply-to-venue"

export type LoopOrchestrationStage =
  | "idle"
  | "leg-1-approve-collateral"
  | "leg-1-complete"
  | "leg-2-supply-collateral"
  | "leg-2-complete"
  | "leg-3-borrow"
  | "leg-3-complete"
  | "leg-4-supply-to-venue"
  | "leg-4-complete"
  | "failed"
  | "ineligible"
  | "disconnected"
  | "wrong-network"

export type LoopLegEligibility =
  | { kind: "ready"; reason: string }
  | { kind: "not-ready"; reason: string }
  | { kind: "ineligible"; reason: string }

export interface UseLoopTransactionResult {
  stage: LoopOrchestrationStage
  errorMessage: string | null
  activeLeg: LoopLeg | null
  leg1Eligibility: LoopLegEligibility
  leg2Eligibility: LoopLegEligibility
  leg3Eligibility: LoopLegEligibility
  leg4Eligibility: LoopLegEligibility
  leg1: CollateralApprovalTransactionOutput
  leg2: SupplyCollateralTransactionOutput
  leg3: BorrowTransactionOutput
  leg4: SupplyTransactionOutput
  leg1Readiness: CollateralApprovalReadiness
  leg2Readiness: SupplyCollateralReadiness
  leg3Readiness: BorrowReadiness
  leg4Readiness: SupplyReadiness
  executeLeg1: () => Promise<void>
  executeLeg2: () => Promise<void>
  executeLeg3: () => Promise<void>
  executeLeg4: () => Promise<void>
  reset: () => void
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

function collateralReadinessToEligibility(
  r: CollateralApprovalReadiness | SupplyCollateralReadiness,
): LoopLegEligibility {
  switch (r.kind) {
    case "ready":
      return { kind: "ready", reason: "Allowance sufficient." }
    case "approval-required":
      return { kind: "ready", reason: "Approval required (leg 1 will approve)." }
    case "loading":
      return { kind: "not-ready", reason: "Loading allowance…" }
    case "disconnected":
      return { kind: "not-ready", reason: "Wallet disconnected." }
    case "wrong-network":
      return { kind: "not-ready", reason: `Wrong network (chainId ${r.chainId}).` }
    case "insufficient-balance":
      return { kind: "not-ready", reason: "Insufficient collateral balance." }
    case "invalid-amount":
      return { kind: "not-ready", reason: "Invalid collateral amount." }
    case "allowance-insufficient":
      return { kind: "not-ready", reason: "Allowance insufficient." }
    default:
      return { kind: "not-ready", reason: "Not ready." }
  }
}

function borrowReadinessToEligibility(r: BorrowReadiness): LoopLegEligibility {
  switch (r.kind) {
    case "ready-to-borrow":
      return { kind: "ready", reason: "Borrow capacity available." }
    case "loading":
      return { kind: "not-ready", reason: "Loading borrow capacity…" }
    case "disconnected":
      return { kind: "not-ready", reason: "Wallet disconnected." }
    case "wrong-network":
      return { kind: "not-ready", reason: `Wrong network (chainId ${r.chainId}).` }
    case "exceeds-capacity":
      return { kind: "not-ready", reason: "Amount exceeds borrow capacity." }
    case "no-capacity":
      return { kind: "not-ready", reason: "No borrow capacity." }
    case "invalid-amount":
      return { kind: "not-ready", reason: "Invalid borrow amount." }
    default:
      return { kind: "not-ready", reason: "Not ready." }
  }
}

function supplyReadinessToEligibility(
  r: SupplyReadiness,
  venueName: string,
): LoopLegEligibility {
  switch (r.kind) {
    case "ready":
      return { kind: "ready", reason: `Ready to supply to ${venueName}.` }
    case "approval-required":
      return {
        kind: "not-ready",
        reason: "Approval required for the venue (not supported by Loop).",
      }
    case "loading":
      return { kind: "not-ready", reason: "Loading venue allowance…" }
    case "disconnected":
      return { kind: "not-ready", reason: "Wallet disconnected." }
    case "wrong-network":
      return { kind: "not-ready", reason: `Wrong network (chainId ${r.chainId}).` }
    case "insufficient-balance":
      return { kind: "not-ready", reason: "Insufficient loan balance." }
    case "invalid-amount":
      return { kind: "not-ready", reason: "Invalid loan amount." }
    case "market-unconfigured":
      return { kind: "ineligible", reason: "Venue market is unconfigured." }
    default:
      return { kind: "not-ready", reason: "Not ready." }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Hook
 * ──────────────────────────────────────────────────────────────────── */

export interface UseLoopTransactionInput {
  collateralMarket: LendingMarket
  venueMarket: LendingMarket
  collateralAmount: string
  loanAmount: string
  loanTokenSymbol: string
}

export function useLoopTransaction(
  input: UseLoopTransactionInput,
): UseLoopTransactionResult {
  const wallet = useWallet()
  const {
    collateralMarket,
    venueMarket,
    collateralAmount,
    loanAmount,
    loanTokenSymbol,
  } = input

  const morpho = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`

  /* ── Per-leg readiness (locked hooks, unchanged) ─────────────── */

  const collateralApprovalReadiness = useCollateralApprovalReadiness({
    market: collateralMarket,
    amount: collateralAmount,
    collateralTokenMeta: collateralMarket.collateralTokenAddress
      ? {
          address: collateralMarket.collateralTokenAddress as `0x${string}`,
          symbol: collateralMarket.collateralAssetSymbol ?? null,
          decimals: 18,
        }
      : null,
  })

  const collateralTokenForSupplyReadiness = (() => {
    if (
      collateralApprovalReadiness.kind === "ready" ||
      collateralApprovalReadiness.kind === "approval-required" ||
      collateralApprovalReadiness.kind === "insufficient-balance"
    ) {
      return {
        address: collateralApprovalReadiness.collateralToken.address,
        symbol: collateralApprovalReadiness.collateralToken.symbol,
        decimals: collateralApprovalReadiness.collateralToken.decimals,
      }
    }
    if (collateralMarket.collateralTokenAddress) {
      return {
        address: collateralMarket.collateralTokenAddress as `0x${string}`,
        symbol: collateralMarket.collateralAssetSymbol ?? null,
        decimals: 18,
      }
    }
    return null
  })()

  const allowanceForSupplyReadiness =
    collateralApprovalReadiness.kind === "ready" ||
    collateralApprovalReadiness.kind === "approval-required" ||
    collateralApprovalReadiness.kind === "insufficient-balance"
      ? collateralApprovalReadiness.allowance
      : null

  const balanceForSupplyReadiness =
    collateralApprovalReadiness.kind === "ready" ||
    collateralApprovalReadiness.kind === "approval-required" ||
    collateralApprovalReadiness.kind === "insufficient-balance"
      ? collateralApprovalReadiness.balance
      : null

  const supplyCollateralReadiness = useSupplyCollateralReadiness({
    market: collateralMarket,
    amount: collateralAmount,
    collateralToken: collateralTokenForSupplyReadiness ?? {
      address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      symbol: null,
      decimals: 18,
    },
    allowance: allowanceForSupplyReadiness,
    balance: balanceForSupplyReadiness,
  })

  const borrowReadiness = useBorrowReadiness({
    market: collateralMarket,
    amount: loanAmount,
    loanToken: collateralMarket.loanTokenAddress
      ? {
          address: collateralMarket.loanTokenAddress as `0x${string}`,
          symbol: loanTokenSymbol,
          decimals: collateralMarket.loanTokenDecimals ?? 6,
        }
      : {
          address: null,
          symbol: loanTokenSymbol,
          decimals: null,
        },
    capacity: collateralMarket.availableLiquidity
      ? BigInt(Math.floor(collateralMarket.availableLiquidity * 1e6))
      : null,
  })

  const supplyReadiness = useSupplyReadiness({
    market: venueMarket,
    amount: loanAmount,
    actionTab: "SUPPLY",
    withdrawableData: {
      userSuppliedAssets: null,
      maxWithdrawable: null,
      hasPosition: false,
    },
  })

  /* ── Top-level stage state ────────────────────────────────────── */

  const [stage, setStage] = React.useState<LoopOrchestrationStage>("idle")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [leg1Done, setLeg1Done] = React.useState(false)
  const [leg2Done, setLeg2Done] = React.useState(false)
  const [leg3Done, setLeg3Done] = React.useState(false)
  const [leg4Done, setLeg4Done] = React.useState(false)

  const f12Ineligible = collateralMarket.transactionEligible !== true
  const walletConnected =
    wallet.status === "connected" && wallet.address !== null
  const walletOnRobinhood =
    walletConnected && wallet.chainId === ROBINHOOD_CHAIN_ID_DEC

  /* ── Per-leg writer hooks (locked) ────────────────────────────── */

  const leg1 = useCollateralApprovalTransaction({
    collateralToken:
      (collateralMarket.collateralTokenAddress as `0x${string}` | null) ??
      ("0x0000000000000000000000000000000000000000" as `0x${string}`),
    spender: morpho,
    amount:
      collateralApprovalReadiness.kind === "ready"
        ? parseAmountString(
            collateralAmount,
            collateralApprovalReadiness.collateralToken.decimals,
          )
        : collateralApprovalReadiness.kind === "approval-required"
          ? parseAmountString(
              collateralAmount,
              collateralApprovalReadiness.collateralToken.decimals,
            )
          : BigInt(0),
    chainId: ROBINHOOD_CHAIN_ID_DEC,
    onSuccess: (observedAllowance) => {
      setLeg1Done(true)
      setStage("leg-1-complete")
      setErrorMessage(null)
      emitDataInvalidate("supply-success")
      void observedAllowance
    },
    onError: (s, msg) => {
      setStage("failed")
      setErrorMessage(`Leg 1 (${s}) — ${msg}`)
    },
  })

  const leg2 = useSupplyCollateralTransaction({
    market: collateralMarket,
    assets:
      collateralTokenForSupplyReadiness && collateralAmount
        ? parseAmountString(
            collateralAmount,
            collateralTokenForSupplyReadiness.decimals,
          )
        : BigInt(0),
    collateralToken: collateralTokenForSupplyReadiness ?? {
      address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      symbol: null,
      decimals: 18,
    },
    onSuccess: (txHash) => {
      setLeg2Done(true)
      setStage("leg-2-complete")
      setErrorMessage(null)
      emitDataInvalidate("supply-success")
      void txHash
    },
    onError: (s, msg) => {
      setStage("failed")
      setErrorMessage(`Leg 2 (${s}) — ${msg}`)
    },
  })

  const leg3 = useBorrowTransaction({
    market: collateralMarket,
    assets:
      borrowReadiness.kind === "ready-to-borrow"
        ? borrowReadiness.amount
        : BigInt(0),
    loanTokenDecimals: collateralMarket.loanTokenDecimals ?? 6,
    loanTokenSymbol: loanTokenSymbol,
    maxBorrowCapacity:
      borrowReadiness.kind === "ready-to-borrow"
        ? borrowReadiness.capacity
        : BigInt(0),
    onSuccess: (txHash) => {
      setLeg3Done(true)
      setStage("leg-3-complete")
      setErrorMessage(null)
      emitDataInvalidate("borrow-success")
      void txHash
    },
    onError: (s, msg) => {
      setStage("failed")
      setErrorMessage(`Leg 3 (${s}) — ${msg}`)
    },
  })

  const leg4 = useSupplyTransaction({
    market: venueMarket,
    assets:
      venueMarket.loanTokenDecimals != null
        ? parseAmountString(loanAmount, venueMarket.loanTokenDecimals)
        : BigInt(0),
    decimals: venueMarket.loanTokenDecimals ?? 6,
    tokenSymbol: venueMarket.loanAssetSymbol ?? loanTokenSymbol,
    onSuccess: (txHash) => {
      setLeg4Done(true)
      setStage("leg-4-complete")
      setErrorMessage(null)
      emitDataInvalidate("supply-success")
      void txHash
    },
    onError: (s, msg) => {
      setStage("failed")
      setErrorMessage(`Leg 4 (${s}) — ${msg}`)
    },
  })

  /* ── Per-leg eligibility ──────────────────────────────────────── */

  const leg1Eligibility: LoopLegEligibility = (() => {
    if (f12Ineligible) {
      return { kind: "ineligible", reason: "Market is not F12 transaction-eligible." }
    }
    if (!walletConnected) {
      return { kind: "not-ready", reason: "Wallet disconnected." }
    }
    if (!walletOnRobinhood) {
      return {
        kind: "not-ready",
        reason: `Wrong network (chainId ${wallet.chainId ?? "?"}).`,
      }
    }
    if (!collateralMarket.collateralTokenAddress) {
      return { kind: "ineligible", reason: "No collateral token address." }
    }
    if (
      collateralApprovalReadiness.kind === "ready" ||
      collateralApprovalReadiness.kind === "approval-required"
    ) {
      return { kind: "ready", reason: "Ready to approve collateral." }
    }
    return collateralReadinessToEligibility(collateralApprovalReadiness)
  })()

  const leg2Eligibility: LoopLegEligibility = (() => {
    if (f12Ineligible) {
      return { kind: "ineligible", reason: "Market is not F12 transaction-eligible." }
    }
    if (!leg1Done) {
      return { kind: "not-ready", reason: "Approve collateral first (leg 1)." }
    }
    if (!walletConnected || !walletOnRobinhood) {
      return { kind: "not-ready", reason: "Wallet / network check failed." }
    }
    if (supplyCollateralReadiness.kind === "ready") {
      return { kind: "ready", reason: "Allowance already sufficient." }
    }
    return collateralReadinessToEligibility(supplyCollateralReadiness)
  })()

  const leg3Eligibility: LoopLegEligibility = (() => {
    if (f12Ineligible) {
      return { kind: "ineligible", reason: "Market is not F12 transaction-eligible." }
    }
    if (!leg2Done) {
      return { kind: "not-ready", reason: "Supply collateral first (leg 2)." }
    }
    if (!walletConnected || !walletOnRobinhood) {
      return { kind: "not-ready", reason: "Wallet / network check failed." }
    }
    return borrowReadinessToEligibility(borrowReadiness)
  })()

  const leg4Eligibility: LoopLegEligibility = (() => {
    if (!venueMarket.transactionEligible) {
      return { kind: "ineligible", reason: "Venue is not transaction-eligible." }
    }
    if (!leg3Done) {
      return { kind: "not-ready", reason: "Borrow first (leg 3)." }
    }
    if (!walletConnected || !walletOnRobinhood) {
      return { kind: "not-ready", reason: "Wallet / network check failed." }
    }
    return supplyReadinessToEligibility(
      supplyReadiness.readiness,
      venueMarket.symbol,
    )
  })()

  /* ── Active leg ───────────────────────────────────────────────── */

  const activeLeg: LoopLeg | null = (() => {
    if (
      stage === "leg-1-approve-collateral" ||
      (leg1Eligibility.kind === "ready" && !leg1Done)
    ) {
      return "approve-collateral"
    }
    if (
      stage === "leg-2-supply-collateral" ||
      (leg2Eligibility.kind === "ready" && leg1Done && !leg2Done)
    ) {
      return "supply-collateral"
    }
    if (
      stage === "leg-3-borrow" ||
      (leg3Eligibility.kind === "ready" && leg2Done && !leg3Done)
    ) {
      return "borrow"
    }
    if (
      stage === "leg-4-supply-to-venue" ||
      (leg4Eligibility.kind === "ready" && leg3Done && !leg4Done)
    ) {
      return "supply-to-venue"
    }
    return null
  })()

  /* ── Execute callbacks ────────────────────────────────────────── */

  const executeLeg1 = React.useCallback(async () => {
    if (f12Ineligible) return
    if (!walletConnected || !walletOnRobinhood) return
    if (leg1.isPending) return
    if (activeLeg !== "approve-collateral") return
    setStage("leg-1-approve-collateral")
    await leg1.approve()
  }, [f12Ineligible, walletConnected, walletOnRobinhood, leg1, activeLeg])

  const executeLeg2 = React.useCallback(async () => {
    if (f12Ineligible) return
    if (!walletConnected || !walletOnRobinhood) return
    if (leg2.isPending) return
    if (activeLeg !== "supply-collateral") return
    setStage("leg-2-supply-collateral")
    await leg2.supplyCollateral()
  }, [f12Ineligible, walletConnected, walletOnRobinhood, leg2, activeLeg])

  const executeLeg3 = React.useCallback(async () => {
    if (f12Ineligible) return
    if (!walletConnected || !walletOnRobinhood) return
    if (leg3.isPending) return
    if (activeLeg !== "borrow") return
    setStage("leg-3-borrow")
    await leg3.borrow()
  }, [f12Ineligible, walletConnected, walletOnRobinhood, leg3, activeLeg])

  const executeLeg4 = React.useCallback(async () => {
    if (!venueMarket.transactionEligible) return
    if (!walletConnected || !walletOnRobinhood) return
    if (leg4.isPending) return
    if (activeLeg !== "supply-to-venue") return
    setStage("leg-4-supply-to-venue")
    await leg4.supply()
  }, [venueMarket, walletConnected, walletOnRobinhood, leg4, activeLeg])

  /* ── Reset ─────────────────────────────────────────────────────── */

  const reset = React.useCallback(() => {
    setStage("idle")
    setErrorMessage(null)
    setLeg1Done(false)
    setLeg2Done(false)
    setLeg3Done(false)
    setLeg4Done(false)
    leg1.reset()
    leg2.reset()
    leg3.reset()
    leg4.reset()
  }, [leg1, leg2, leg3, leg4])

  /* ── Final stage override ──────────────────────────────────────── */

  let finalStage: LoopOrchestrationStage = stage
  if (f12Ineligible) finalStage = "ineligible"
  else if (!walletConnected) finalStage = "disconnected"
  else if (!walletOnRobinhood) finalStage = "wrong-network"

  return {
    stage: finalStage,
    errorMessage,
    activeLeg,
    leg1Eligibility,
    leg2Eligibility,
    leg3Eligibility,
    leg4Eligibility,
    leg1,
    leg2,
    leg3,
    leg4,
    leg1Readiness: collateralApprovalReadiness,
    leg2Readiness: supplyCollateralReadiness,
    leg3Readiness: borrowReadiness,
    leg4Readiness: supplyReadiness.readiness,
    executeLeg1,
    executeLeg2,
    executeLeg3,
    executeLeg4,
    reset,
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Pure helpers (private)
 * ──────────────────────────────────────────────────────────────────── */

function parseAmountString(raw: string, decimals: number): bigint {
  if (!raw || raw.trim() === "") return BigInt(0)
  const trimmed = raw.trim()
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return BigInt(0)
  if (trimmed === "" || trimmed === ".") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  const factor = pow10Big(decimals)
  const wholeBig = BigInt(whole === "" ? "0" : whole) * factor
  const fracBig = frac
    ? BigInt(frac.padEnd(decimals, "0").slice(0, decimals))
    : BigInt(0)
  return wholeBig + fracBig
}

function pow10Big(n: number): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < n; i++) r *= ten
  return r
}
