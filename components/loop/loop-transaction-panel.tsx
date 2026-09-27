"use client"

/**
 * ZEKS Loop — F13 transaction panel.
 *
 * Reads inputs from `loop-composition.tsx`:
 *   - `collateralMarket` — the full `LendingMarket` row (from
 *     `useEarnLendingMarkets`, locked F12)
 *   - `venueMarket` — the full `LendingMarket` row for the yield
 *     venue (from `adapter.ts`)
 *   - `collateralAmount` / `loanAmount` — typed amounts
 *   - `collateralSymbol` / `loanSymbol` — UI labels
 *
 * Wires the F13 orchestration hook (`use-loop-transaction.ts`) and
 * mounts:
 *   - the four leg CTAs (one per leg)
 *   - the four leg status lines (relocated to
 *     `components/earn/transaction-status-lines.tsx` in F13)
 *   - the receipt trail (`ActionReceiptTrail`)
 *
 * No new transaction logic. No new encoding. No new state
 * machines. F13 only composes the locked primitives.
 */

import * as React from "react"
import type { LendingMarket } from "@/lib/markets/lending"
import { useLoopTransaction, type LoopLeg } from "./use-loop-transaction"
import {
  SupplyStatusLine,
  BorrowStatusLine,
  WithdrawCollateralStatusLine,
} from "@/components/earn/transaction-status-lines"
import {
  ActionReceiptTrail,
  type EarnActionKind,
} from "@/components/earn/action-receipt-trail"
import { LifecycleChip, lifecycleOf } from "@/components/earn/lifecycle-chip"

/* ──────────────────────────────────────────────────────────────────
 * Props
 * ──────────────────────────────────────────────────────────────────── */

export interface LoopTransactionPanelProps {
  /** Full LendingMarket row for the chosen stock collateral. */
  collateralMarket: LendingMarket
  /** Full LendingMarket row for the chosen yield venue. */
  venueMarket: LendingMarket
  /** Typed collateral amount (in stock-token units). */
  collateralAmount: string
  /** Typed loan amount (in loan-token units). */
  loanAmount: string
  /** Display symbol for the collateral side (e.g. "AAPL"). */
  collateralSymbol: string
  /** Display symbol for the loan side (e.g. "USDG"). */
  loanSymbol: string
  /** Optional callback when the user dismisses the panel. */
  onClose?: () => void
}

/* ──────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────── */

export function LoopTransactionPanel({
  collateralMarket,
  venueMarket,
  collateralAmount,
  loanAmount,
  collateralSymbol,
  loanSymbol,
  onClose,
}: LoopTransactionPanelProps) {
  const tx = useLoopTransaction({
    collateralMarket,
    venueMarket,
    collateralAmount,
    loanAmount,
    loanTokenSymbol: loanSymbol,
  })

  const [lastReceipt, setLastReceipt] = React.useState<{
    action: EarnActionKind
    txHash: `0x${string}`
  } | null>(null)

  // Record each successful leg in the receipt trail.
  React.useEffect(() => {
    if (tx.stage === "leg-1-complete" && tx.leg1.state.txHash) {
      setLastReceipt({
        action: "SUPPLY_COLLATERAL",
        txHash: tx.leg1.state.txHash,
      })
    }
  }, [tx.stage, tx.leg1.state.txHash])

  React.useEffect(() => {
    if (tx.stage === "leg-2-complete" && tx.leg2.state.txHash) {
      setLastReceipt({
        action: "SUPPLY_COLLATERAL",
        txHash: tx.leg2.state.txHash,
      })
    }
  }, [tx.stage, tx.leg2.state.txHash])

  React.useEffect(() => {
    if (tx.stage === "leg-3-complete" && tx.leg3.state.txHash) {
      setLastReceipt({
        action: "BORROW",
        txHash: tx.leg3.state.txHash,
      })
    }
  }, [tx.stage, tx.leg3.state.txHash])

  React.useEffect(() => {
    if (tx.stage === "leg-4-complete" && tx.leg4.state.txHash) {
      setLastReceipt({
        action: "SUPPLY",
        txHash: tx.leg4.state.txHash,
      })
    }
  }, [tx.stage, tx.leg4.state.txHash])

  return (
    <div
      data-loop-transaction-panel
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card-soft)",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "var(--font-micro)",
              color: "var(--muted-foreground)",
              letterSpacing: "0.08em",
              fontWeight: 500,
            }}
          >
            Open Loop
          </span>
          <LifecycleChip lifecycle={lifecycleOf(collateralMarket)} compact />
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close loop transaction panel"
            style={{
              height: "24px",
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            Close
          </button>
        ) : null}
      </header>

      {/* Top-level status banner when the orchestration is gated. */}
      <GateBanner
        tx={tx}
        collateralSymbol={collateralSymbol}
        loanSymbol={loanSymbol}
      />

      {/* Four legs */}
      <LegRow
        n={1}
        title={`Approve ${collateralSymbol}`}
        eligibility={tx.leg1Eligibility}
        isActive={tx.activeLeg === "approve-collateral"}
        isPending={tx.leg1.isPending}
        done={
          tx.stage === "leg-1-complete" ||
          tx.stage === "leg-2-supply-collateral" ||
          tx.stage === "leg-2-complete" ||
          tx.stage === "leg-3-borrow" ||
          tx.stage === "leg-3-complete" ||
          tx.stage === "leg-4-supply-to-venue" ||
          tx.stage === "leg-4-complete"
        }
        onClick={tx.executeLeg1}
      />
      <LegRow
        n={2}
        title={`Supply ${collateralSymbol} collateral`}
        eligibility={tx.leg2Eligibility}
        isActive={tx.activeLeg === "supply-collateral"}
        isPending={tx.leg2.isPending}
        done={
          tx.stage === "leg-2-complete" ||
          tx.stage === "leg-3-borrow" ||
          tx.stage === "leg-3-complete" ||
          tx.stage === "leg-4-supply-to-venue" ||
          tx.stage === "leg-4-complete"
        }
        onClick={tx.executeLeg2}
      />
      <LegRow
        n={3}
        title={`Borrow ${loanSymbol}`}
        eligibility={tx.leg3Eligibility}
        isActive={tx.activeLeg === "borrow"}
        isPending={tx.leg3.isPending}
        done={
          tx.stage === "leg-3-complete" ||
          tx.stage === "leg-4-supply-to-venue" ||
          tx.stage === "leg-4-complete"
        }
        onClick={tx.executeLeg3}
      />
      <LegRow
        n={4}
        title={`Supply ${loanSymbol} to ${venueMarket.symbol}`}
        eligibility={tx.leg4Eligibility}
        isActive={tx.activeLeg === "supply-to-venue"}
        isPending={tx.leg4.isPending}
        done={tx.stage === "leg-4-complete"}
        onClick={tx.executeLeg4}
      />

      {/* Per-leg status lines (locked writers' state). Mounted in
          parallel with their respective leg row. Each is a pure
          presentational surface over the corresponding locked hook
          — no new transaction logic.
          - Leg 1 uses the ERC20 approval writer (F5C). Its stage
            surface has no shared status line in the audit scope;
            we surface leg-1 via the orchestration banner + the
            leg row's own label.
          - Leg 2 uses the supply-collateral writer (F5D); its
            stage surface is shape-compatible with SupplyStatusLine.
          - Leg 3 uses the borrow writer (F6B); BorrowStatusLine.
          - Leg 4 uses the supply writer (F2C); SupplyStatusLine. */}
      <SupplyStatusLine
        stage={tx.leg2.state.stage}
        txHash={tx.leg2.state.txHash}
        errorMessage={tx.leg2.state.errorMessage}
        simulationMessage={tx.leg2.state.simulationMessage}
        tokenLabel={collateralSymbol}
        onDismiss={tx.leg2.reset}
      />
      <BorrowStatusLine
        stage={tx.leg3.state.stage}
        txHash={tx.leg3.state.txHash}
        errorMessage={tx.leg3.state.errorMessage}
        simulationMessage={tx.leg3.state.simulationMessage}
        errorStage={tx.leg3.state.errorStage}
        tokenLabel={loanSymbol}
        onDismiss={tx.leg3.reset}
      />
      <SupplyStatusLine
        stage={tx.leg4.state.stage}
        txHash={tx.leg4.state.txHash}
        errorMessage={tx.leg4.state.errorMessage}
        simulationMessage={tx.leg4.state.simulationMessage}
        tokenLabel={loanSymbol}
        onDismiss={tx.leg4.reset}
      />

      {/* Top-level orchestration error. */}
      {tx.errorMessage ? (
        <div
          role="alert"
          className="zeks-status-line"
          style={{
            borderColor: "var(--down)",
            color: "var(--down)",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{tx.errorMessage}</span>
          <button
            type="button"
            onClick={tx.reset}
            className="zeks-status-line-dismiss"
          >
            Reset
          </button>
        </div>
      ) : null}

      {/* Receipt trail — F8 surface, reused unchanged. */}
      <ActionReceiptTrail
        action={lastReceipt?.action ?? null}
        txHash={lastReceipt?.txHash ?? null}
        tokenSymbol={
          lastReceipt?.action === "SUPPLY_COLLATERAL"
            ? collateralSymbol
            : loanSymbol
        }
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────── */

function LegRow({
  n,
  title,
  eligibility,
  isActive,
  isPending,
  done,
  onClick,
}: {
  n: number
  title: string
  eligibility: { kind: "ready" | "not-ready" | "ineligible"; reason: string }
  isActive: boolean
  isPending: boolean
  done: boolean
  onClick: () => void
}) {
  const disabled =
    isPending ||
    !done === false
      ? false
      : eligibility.kind !== "ready" || (!isActive && !done)

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "var(--background)",
        opacity: done ? 0.7 : 1,
      }}
      data-loop-leg={n}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            color: "var(--muted-foreground)",
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          Leg {n}
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            color: "var(--foreground)",
            lineHeight: 1.3,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            color:
              eligibility.kind === "ready"
                ? "var(--up)"
                : eligibility.kind === "ineligible"
                  ? "var(--down)"
                  : "var(--muted-foreground)",
            marginTop: "2px",
          }}
        >
          {done ? "Complete" : eligibility.reason}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || done}
        style={{
          height: "34px",
          padding: "0 16px",
          fontSize: "12px",
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          borderRadius: "6px",
          backgroundColor: done
            ? "transparent"
            : eligibility.kind === "ready" && isActive
              ? "var(--primary)"
              : "transparent",
          color:
            done
              ? "var(--muted-foreground)"
              : eligibility.kind === "ready" && isActive
                ? "var(--primary-foreground)"
                : "var(--muted-foreground)",
          border: done
            ? "1px solid var(--border)"
            : "1px solid var(--border)",
          cursor: done || disabled ? "default" : "pointer",
          lineHeight: 1,
          opacity: disabled ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {done ? "Done" : isPending ? "Pending…" : isActive ? "Run leg →" : "Awaiting"}
      </button>
    </div>
  )
}

function GateBanner({
  tx,
  collateralSymbol,
  loanSymbol,
}: {
  tx: ReturnType<typeof useLoopTransaction>
  collateralSymbol: string
  loanSymbol: string
}) {
  const _void = loanSymbol // suppress unused
  void _void
  if (tx.stage === "disconnected") {
    return (
      <Banner tone="warn">
        Wallet disconnected. Connect a wallet on Robinhood Chain (chainId 4663) to open the loop.
      </Banner>
    )
  }
  if (tx.stage === "wrong-network") {
    return (
      <Banner tone="warn">
        Wrong network. Switch the connected wallet to Robinhood Chain (chainId 4663).
      </Banner>
    )
  }
  if (tx.stage === "ineligible") {
    return (
      <Banner tone="err">
        This {collateralSymbol} market is not transaction-eligible on Robinhood Chain.
        Open Loop is disabled.
      </Banner>
    )
  }
  if (tx.stage === "leg-4-complete") {
    return (
      <Banner tone="ok">
        Loop complete — collateral supplied, {collateralSymbol} on loan, and the borrowed
        stablecoin is now earning yield at the venue.
      </Banner>
    )
  }
  return null
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "err"
  children: React.ReactNode
}) {
  const color =
    tone === "ok" ? "var(--up)" : tone === "err" ? "var(--down)" : "var(--muted-foreground)"
  return (
    <div
      className="zeks-status-line"
      style={{
        borderColor: color,
        color,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}
