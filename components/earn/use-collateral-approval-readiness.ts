"use client"

/**
 * useCollateralApprovalReadiness — read-only collateral-approval gate.
 *
 * Phase F5C. NO TRANSACTIONS, NO APPROVALS, NO WRITES.
 *
 * Purpose: determine whether the connected wallet has sufficient
 * allowance of the COLLATERAL token to execute `supplyCollateral`.
 *
 * This is a parallel structure to `useSupplyReadiness` (F2A), but
 * reads the COLLATERAL token instead of the loan token.
 *
 * What this hook reads (all via eth_call — no signatures, no writes):
 *   1. Collateral token metadata: `decimals()` from the ERC20 contract.
 *   2. Collateral token balance: `balanceOf(wallet.address)`.
 *   3. Collateral token allowance: `allowance(wallet, morphoCore)`.
 *
 * State machine:
 *
 *   Disconnected
 *     -> WrongNetwork (wallet on chain != 4663)
 *     -> Loading          (rpc reads in flight)
 *     -> Ready            (allowance >= required)
 *     -> ApprovalRequired  (allowance < required)
 *     -> InsufficientBalance  (amount > wallet balance)
 *     -> InvalidAmount     (NaN / negative / zero / no collateral token)
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { LendingMarket } from "@/lib/markets/lending"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import {
  readErc20Allowance,
  readErc20Balance,
  readErc20Info,
} from "@/lib/markets/onchain/erc20"

/* ------------------------------------------------------ */
/* State types                                            */
/* ------------------------------------------------------ */

export type CollateralApprovalReadiness =
  | { kind: "disconnected" }
  | { kind: "wrong-network"; chainId: number }
  | {
      kind: "loading"
      subkind: "decimals" | "balance" | "allowance"
    }
  | {
      kind: "ready"
      /** Collateral token balance (bigint, token-native units). */
      balance: bigint
      /** Current allowance (bigint). */
      allowance: bigint
      /** Token metadata used for parsing. */
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "approval-required"
      balance: bigint
      allowance: bigint
      /** Amount still missing from the allowance (bigint). */
      missing: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "insufficient-balance"
      balance: bigint
      allowance: bigint
      /** Amount the user tried to approve (raw). */
      required: bigint
      collateralToken: {
        address: `0x${string}`
        symbol: string | null
        decimals: number
      }
    }
  | {
      kind: "invalid-amount"
      reason: "zero" | "nan" | "negative" | "no-collateral-token"
    }

export interface CollateralApprovalReadinessInput {
  market: LendingMarket
  /** Typed amount string from the collateral input field. */
  amount: string
  /**
   * Token metadata already known by the caller (e.g. from the
   * `usePositionView` F5B collateralToken field). If `decimals`
   * is null, the hook reads them on-chain.
   */
  collateralTokenMeta?: {
    address: `0x${string}`
    symbol: string | null
    decimals: number | null
  } | null
  /**
   * Bump this to force a fresh re-read of balance and allowance.
   */
  refreshTick?: number
}

/* ------------------------------------------------------ */
/* Amount parsing (mirrors useSupplyReadiness)              */
/* ------------------------------------------------------ */

function pow10Big(n: number): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < n; i++) r *= ten
  return r
}

/**
 * Parse a user-typed collateral amount into raw bigint using the
 * given token decimals. Mirrors the pattern used by F2A/F2C for
 * supply — but uses COLLATERAL token decimals (e.g. AAPL: 18),
 * NOT loan-token decimals (USDG: 6).
 *
 * Returns null if:
 *   - string is empty
 *   - fractional part exceeds token decimals
 *   - result would overflow bigint
 */
function parseCollateralAmount(
  raw: string,
  decimals: number,
): bigint | null {
  if (!raw || raw.trim() === "") return null
  const trimmed = raw.trim()
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null
  if (trimmed === "" || trimmed === ".") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (!/^[0-9]+$/.test(whole) || !/^[0-9]*$/.test(frac)) return null
  if (frac.length > decimals) return null
  try {
    const factor = pow10Big(decimals)
    const wholeBig = BigInt(whole === "" ? "0" : whole) * factor
    const fracBig = frac ? BigInt(frac.padEnd(decimals, "0").slice(0, decimals)) : BigInt(0)
    return wholeBig + fracBig
  } catch {
    return null
  }
}

/* ------------------------------------------------------ */
/* Hook                                                   */
/* ------------------------------------------------------ */

export function useCollateralApprovalReadiness(
  input: CollateralApprovalReadinessInput,
): CollateralApprovalReadiness {
  const wallet = useWallet()

  const collateralAddress = input.market.collateralTokenAddress as
    | `0x${string}`
    | null
  const morphoSpender =
    MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho as `0x${string}`

  const [decimals, setDecimals] = React.useState<number | null>(null)
  const [balance, setBalance] = React.useState<bigint | null>(null)
  const [allowance, setAllowance] = React.useState<bigint | null>(null)

  // Caller-supplied decimals take priority; otherwise read on-chain.
  const effectiveDecimals =
    (input.collateralTokenMeta?.decimals ?? null) ?? decimals

  const [refreshTick, setRefreshTick] = React.useState(0)
  const prevRefreshTick = React.useRef(input.refreshTick ?? 0)

  React.useEffect(() => {
    const tick = input.refreshTick ?? 0
    if (tick !== prevRefreshTick.current) {
      prevRefreshTick.current = tick
      setRefreshTick((t) => t + 1)
    }
  }, [input.refreshTick])

  // ── Read collateral token metadata (decimals + symbol) ──────────────
  React.useEffect(() => {
    if (wallet.status !== "connected") return
    const ca = collateralAddress
    if (!ca) return
    // Skip if caller already provided decimals.
    if (input.collateralTokenMeta?.decimals != null) return

    let cancelled = false

    void (async () => {
      const info = await readErc20Info(ca, {
        chainId: wallet.chainId,
        timeoutMs: 5_000,
      })
      if (!cancelled && info.kind === "ok") {
        setDecimals(info.value.decimals)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [wallet.status, wallet.chainId, collateralAddress, input.collateralTokenMeta?.decimals])

  // ── Read balance + allowance ─────────────────────────────────────────
  React.useEffect(() => {
    if (wallet.status !== "connected" || !wallet.address || !collateralAddress) {
      setBalance(null)
      setAllowance(null)
      return
    }
    // Wait for decimals before reading balance/allowance.
    if (effectiveDecimals === null) return

    const ca = collateralAddress as `0x${string}`
    const wa = wallet.address as `0x${string}`
    const cha = wallet.chainId
    let cancelled = false

    void (async () => {
      const balRes = await readErc20Balance(ca, wa, {
        chainId: cha,
        timeoutMs: 5_000,
      })
      if (cancelled) return
      setBalance(balRes.kind === "ok" ? balRes.value : null)

      const allRes = await readErc20Allowance(
        ca,
        wa,
        morphoSpender,
        { chainId: cha, timeoutMs: 5_000 },
      )
      if (!cancelled) {
        setAllowance(allRes.kind === "ok" ? allRes.value : null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    wallet.status,
    wallet.address,
    wallet.chainId,
    collateralAddress,
    morphoSpender,
    effectiveDecimals,
    refreshTick,
  ])

  // ── Derive readiness state ──────────────────────────────────────────
  const effectiveSymbol = input.market.collateralAssetSymbol ?? null

  if (wallet.status !== "connected") {
    return { kind: "disconnected" }
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? -1 }
  }
  if (!collateralAddress) {
    return { kind: "invalid-amount", reason: "no-collateral-token" }
  }
  if (effectiveDecimals === null || balance === null || allowance === null) {
    return { kind: "loading", subkind: "decimals" }
  }

  const parsed = parseCollateralAmount(input.amount, effectiveDecimals)

  if (parsed === null || parsed <= BigInt(0)) {
    return {
      kind: "invalid-amount",
      reason: input.amount === "" || input.amount.trim() === "" ? "zero" : "nan",
    }
  }

  if (parsed > balance) {
    return {
      kind: "insufficient-balance",
      balance,
      allowance,
      required: parsed,
      collateralToken: {
        address: collateralAddress,
        symbol: effectiveSymbol,
        decimals: effectiveDecimals,
      },
    }
  }

  if (allowance >= parsed) {
    return {
      kind: "ready",
      balance,
      allowance,
      collateralToken: {
        address: collateralAddress,
        symbol: effectiveSymbol,
        decimals: effectiveDecimals,
      },
    }
  }

  return {
    kind: "approval-required",
    balance,
    allowance,
    missing: parsed - allowance,
    collateralToken: {
      address: collateralAddress,
      symbol: effectiveSymbol,
      decimals: effectiveDecimals,
    },
  }
}
