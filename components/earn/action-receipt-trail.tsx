"use client"

/**
 * ActionReceiptTrail — display-only audit row for the most recent
 * successful Earn action.
 *
 * Phase F8. NO TRANSACTIONS, NO RPC, NO POLLING, NO PERSISTENCE.
 *
 * Purpose: surface the onchain txHash that the existing F2C / F3B /
 * F6B / F6C / F6D transaction hooks returned via `onSuccess(txHash)`,
 * so the user has a verifiable audit trail of the action they just
 * performed inside the Earn action panel.
 *
 * Design contract:
 *   - Pure presentational component. No side effects.
 *   - Never fabricates a txHash. The `txHash` prop is null when there
 *     is no completed action to show; the row renders nothing in that
 *     case.
 *   - The explorer link is derived from the verified
 *     `explorerTxUrl(txHash)` helper in `lib/explorer/robinhood-chain`.
 *   - Resets are owned by the parent — the trail does not poll, listen,
 *     or otherwise auto-clear itself. The parent must clear `txHash`
 *     on wallet change / market change / action-tab change.
 *
 * Visual style intentionally matches the muted helper rows already
 * present in `earn-detail.tsx` (DM Sans, 11.5px, `var(--muted-foreground)`).
 */

import * as React from "react"
import { explorerTxUrl } from "@/lib/explorer/robinhood-chain"

export type EarnActionKind =
  | "SUPPLY"
  | "WITHDRAW"
  | "BORROW"
  | "REPAY"
  | "WITHDRAW_COLLATERAL"
  // F13 — Loop page's supplyCollateral leg labels the receipt trail
  // separately so users can tell which Morpho direction each txHash
  // corresponds to.
  | "SUPPLY_COLLATERAL"

export interface ActionReceiptTrailProps {
  /** The most recent successfully-confirmed action label. */
  action: EarnActionKind | null
  /** The verified onchain txHash returned by the transaction writer. */
  txHash: `0x${string}` | null
  /**
   * Optional loan-token symbol, used only for the action label.
   * Falls back to "loan" when not provided.
   */
  tokenSymbol?: string | null
}

/* ------------------------------------------------------ */
/* Helpers                                                  */
/* ------------------------------------------------------ */

/** Shorten a txHash for display: 0xabcd…1234. */
function shortenTxHash(hash: `0x${string}`): string {
  if (hash.length < 12) return hash
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

function actionLabel(
  action: EarnActionKind,
  tokenSymbol: string | null | undefined,
): string {
  const sym = tokenSymbol ?? "loan"
  switch (action) {
    case "SUPPLY":
      return `Supplied ${sym}`
    case "WITHDRAW":
      return `Withdrew ${sym}`
    case "BORROW":
      return `Borrowed ${sym}`
    case "REPAY":
      return `Repaid ${sym}`
    case "WITHDRAW_COLLATERAL":
      return "Withdrew collateral"
    case "SUPPLY_COLLATERAL":
      // F13 — supply-collateral leg of the Loop flow. The token
      // symbol in this case is the COLLATERAL symbol (stock
      // token), not the loan token.
      return `Supplied ${sym} collateral`
  }
}

/* ------------------------------------------------------ */
/* Component                                                */
/* ------------------------------------------------------ */

export function ActionReceiptTrail({
  action,
  txHash,
  tokenSymbol,
}: ActionReceiptTrailProps): React.ReactNode {
  // Display-only. Render nothing unless the parent has a real,
  // completed-receipt pair to show.
  if (action === null || txHash === null) return null

  const url = explorerTxUrl(txHash)

  return (
    <div
      data-testid="earn-detail-action-receipt"
      style={{
        marginTop: "6px",
        padding: "9px 12px",
        border: "1px solid var(--up)",
        borderRadius: "6px",
        backgroundColor: "var(--card-soft)",
        fontFamily: "var(--font-sans)",
        fontSize: "10.5px",
        letterSpacing: "0.04em",
        color: "var(--muted-foreground)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        flexWrap: "wrap",
      }}
    >
      <span
        className="zeks-eyebrow uppercase"
        style={{ fontWeight: 500, letterSpacing: "0.08em", color: "var(--up)" }}
      >
        Last action: {actionLabel(action, tokenSymbol)}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="earn-detail-action-receipt-link"
        style={{
          color: "var(--foreground)",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
          fontWeight: 500,
        }}
      >
        View receipt · {shortenTxHash(txHash)}
      </a>
    </div>
  )
}
