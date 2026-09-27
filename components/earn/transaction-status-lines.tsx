"use client"

/**
 * ZEKS Markets — Shared F10 transaction status lines.
 *
 * Pure relocation. Extracted from `components/earn/earn-detail.tsx`
 * (F10) so the Loop page (F13) and any other consumer can mount
 * them without depending on the EarnDetail surface area.
 *
 * These components are read-only. They consume the `state` objects
 * that the locked F2A–F7 transaction writers already produce:
 *
 *   - SupplyStatusLine             ← useSupplyTransaction        (F2C)
 *   - BorrowStatusLine              ← useBorrowTransaction        (F6B)
 *   - WithdrawCollateralStatusLine  ← useWithdrawCollateralTransaction (F6D)
 *
 * The bodies, props, types, and rendering semantics are PRESERVED
 * EXACTLY from the originals. No visual changes. No new state
 * machines. No new error stages. No new copy.
 *
 * Locked writers untouched.
 */

import * as React from "react"
import type { useSupplyTransaction } from "./use-supply-transaction"
import type { useBorrowTransaction } from "./use-borrow-transaction"
import type { useWithdrawCollateralTransaction } from "./use-withdraw-collateral-transaction"

/* ──────────────────────────────────────────────────────────────────
 * SupplyStatusLine (F2C — useSupplyTransaction)
 * ──────────────────────────────────────────────────────────────────── */

export interface SupplyStatusLineProps {
  stage: ReturnType<typeof useSupplyTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  tokenLabel: string
  onDismiss: () => void
}

export function SupplyStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  tokenLabel,
  onDismiss,
}: SupplyStatusLineProps) {
  const tone: "ok" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "reverted" ||
          stage === "rejected" ||
          stage === "simulation-failed" ||
          stage === "rpc-error" ||
          stage === "timeout" ||
          stage === "wrong-network" ||
          stage === "validation-failed" ||
          stage === "protocol-not-configured"
        ? "err"
        : "info"

  const toneColor = tone === "ok" ? "var(--up)" : "var(--down)"

  const humanStage = (() => {
    switch (stage) {
      case "simulating":
        return "Simulating supply…"
      case "awaiting_signature":
        return "Awaiting wallet signature…"
      case "submitted":
        return "Supply submitted…"
      case "confirming":
        return "Waiting for confirmation…"
      case "success":
        return `Supplied ${tokenLabel}`
      case "rejected":
        return "Supply rejected in wallet."
      case "reverted":
        return "Supply reverted on-chain."
      case "timeout":
        return "Supply confirmation timed out."
      case "simulation-failed":
        return simulationMessage
          ? `Supply simulation reverted: ${simulationMessage}`
          : "Supply simulation reverted."
      case "rpc-error":
        return errorMessage ?? "Supply RPC error."
      case "wrong-network":
        return "Wrong network."
      case "validation-failed":
        return errorMessage ?? "Supply validation failed."
      case "protocol-not-configured":
        return errorMessage ?? "Protocol not configured."
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        backgroundColor: "var(--background)",
      }}
      data-testid="earn-detail-supply-status"
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          letterSpacing: 0,
          color: toneColor,
          lineHeight: 1.45,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 500 }}>{humanStage}</div>
        {txHash !== null ? (
          <div
            style={{
              fontFamily:
                "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "10.5px",
              marginTop: "3px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
              letterSpacing: "0.02em",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * BorrowStatusLine (F6B — useBorrowTransaction)
 * ──────────────────────────────────────────────────────────────────── */

export interface BorrowStatusLineProps {
  stage: ReturnType<typeof useBorrowTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  errorStage: ReturnType<typeof useBorrowTransaction>["state"]["errorStage"]
  tokenLabel: string
  onDismiss: () => void
}

export function BorrowStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  errorStage,
  tokenLabel,
  onDismiss,
}: BorrowStatusLineProps) {
  const tone: "ok" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "error"
        ? "err"
        : "info"

  const toneColor = tone === "ok" ? "var(--up)" : "var(--down)"

  const humanStage = (() => {
    switch (stage) {
      case "preparing":
        return "Simulating borrow…"
      case "awaiting_wallet":
        return "Confirm borrow in wallet…"
      case "pending":
        return "Borrow submitted…"
      case "success":
        return `Borrowed ${tokenLabel}`
      case "error":
        switch (errorStage) {
          case "simulation-failed":
            return simulationMessage
              ? `Borrow simulation reverted: ${simulationMessage}`
              : "Borrow simulation reverted."
          case "rejected":
            return "Borrow rejected in wallet."
          case "reverted":
            return "Borrow reverted on-chain."
          case "timeout":
            return "Borrow confirmation timed out."
          case "rpc-error":
            return errorMessage ?? "Borrow RPC error."
          case "wrong-network":
            return "Wrong network."
          case "validation-failed":
            return errorMessage ?? "Borrow validation failed."
          case "protocol-not-configured":
            return errorMessage ?? "Protocol not configured."
          case "gas-balance":
            return errorMessage ?? "Insufficient gas balance."
          case "no-provider":
            return errorMessage ?? "Wallet provider unavailable."
          default:
            return errorMessage ?? "Borrow failed."
        }
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        backgroundColor: "var(--background)",
      }}
      data-testid="earn-detail-borrow-status"
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          letterSpacing: 0,
          color: toneColor,
          lineHeight: 1.45,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 500 }}>{humanStage}</div>
        {txHash !== null ? (
          <div
            style={{
              fontFamily:
                "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "10.5px",
              marginTop: "3px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
              letterSpacing: "0.02em",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * WithdrawCollateralStatusLine (F6D — useWithdrawCollateralTransaction)
 * ──────────────────────────────────────────────────────────────────── */

export interface WithdrawCollateralStatusLineProps {
  stage: ReturnType<typeof useWithdrawCollateralTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  errorStage: ReturnType<
    typeof useWithdrawCollateralTransaction
  >["state"]["errorStage"]
  onDismiss: () => void
}

export function WithdrawCollateralStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  errorStage,
  onDismiss,
}: WithdrawCollateralStatusLineProps) {
  const tone: "ok" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "error"
        ? "err"
        : "info"

  const toneColor = tone === "ok" ? "var(--up)" : "var(--down)"

  const humanStage = (() => {
    switch (stage) {
      case "preparing":
        return "Simulating withdraw…"
      case "awaiting_wallet":
        return "Confirm withdraw in wallet…"
      case "pending":
        return "Withdraw submitted…"
      case "success":
        return "Withdrew collateral"
      case "error":
        switch (errorStage) {
          case "simulation-failed":
            return simulationMessage
              ? `Withdraw simulation reverted: ${simulationMessage}`
              : "Withdraw simulation reverted."
          case "rejected":
            return "Withdraw rejected in wallet."
          case "reverted":
            return "Withdraw reverted on-chain."
          case "timeout":
            return "Withdraw confirmation timed out."
          case "rpc-error":
            return errorMessage ?? "Withdraw RPC error."
          case "wrong-network":
            return "Wrong network."
          case "disconnected":
            return "Wallet disconnected."
          case "validation-failed":
            return errorMessage ?? "Withdraw validation failed."
          case "no-collateral":
            return "No collateral to withdraw."
          case "no-safe-withdraw":
            return errorMessage ?? "Withdrawal would breach LTV."
          case "protocol-not-configured":
            return errorMessage ?? "Protocol not configured."
          case "gas-balance":
            return errorMessage ?? "Insufficient gas balance."
          case "no-provider":
            return errorMessage ?? "Wallet provider unavailable."
          default:
            return errorMessage ?? "Withdraw failed."
        }
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        backgroundColor: "var(--background)",
      }}
      data-testid="earn-detail-withdraw-collateral-status"
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          letterSpacing: 0,
          color: toneColor,
          lineHeight: 1.45,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 500 }}>{humanStage}</div>
        {txHash !== null ? (
          <div
            style={{
              fontFamily:
                "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "10.5px",
              marginTop: "3px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
              letterSpacing: "0.02em",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}
