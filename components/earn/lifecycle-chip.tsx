"use client"

/**
 * ZEKS Markets — F12 Lifecycle chip.
 *
 * Display-only. Renders the verified on-chain MarketParams lifecycle
 * for a `LendingMarket` row. Does NOT touch the F1–F11 readiness /
 * writer / preflight / receipt / network-status / portfolio surfaces.
 *
 * Classification legend (see `lib/markets/lending/types.ts` →
 * `F12MarketLifecycle` and `lib/markets/lending/verify.ts`):
 *
 *   - "active"      → on-chain MarketParams match the row.
 *                     Eligible for transactions.
 *   - "provisional" → on-chain MarketParams read OK but disagree
 *                     with the row. NOT eligible.
 *   - "inactive"    → on-chain LLTV == 1% deployment default OR
 *                     no `marketId`. NOT eligible.
 *   - "unknown"     → verifier could not run. NOT eligible.
 *   - `null`        → no verdict yet (initial render, RPC in
 *                     flight). Rendered as "Verifying…" to match
 *                     the rest of the page chrome.
 */

import * as React from "react"
import type { F12MarketLifecycle, LendingMarket } from "@/lib/markets/lending"

type LifecycleLabel = {
  text: string
  tone: "up" | "muted" | "amber" | "down"
}

const LIFECYCLE_LABEL: Record<F12MarketLifecycle, LifecycleLabel> = {
  active: { text: "Active", tone: "up" },
  provisional: { text: "Provisional", tone: "amber" },
  inactive: { text: "Inactive", tone: "muted" },
  unknown: { text: "Unverified", tone: "muted" },
}

function toneColor(
  tone: LifecycleLabel["tone"],
): { color: string; border: string } {
  switch (tone) {
    case "up":
      return { color: "var(--up)", border: "var(--up)" }
    case "amber":
      return {
        color: "var(--warning, #b45309)",
        border: "var(--warning, #b45309)",
      }
    case "down":
      return {
        color: "var(--down, #b91c1c)",
        border: "var(--down, #b91c1c)",
      }
    case "muted":
    default:
      return {
        color: "var(--muted-foreground)",
        border: "var(--border)",
      }
  }
}

interface LifecycleChipProps {
  lifecycle: F12MarketLifecycle | null | undefined
  /** When true, omit the leading dot (used by compact row variant). */
  compact?: boolean
}

export function LifecycleChip({
  lifecycle,
  compact,
}: LifecycleChipProps) {
  if (lifecycle == null) {
    return (
      <span
        className="zeks-eyebrow uppercase inline-flex items-center shrink-0"
        style={{
          fontSize: compact ? "9px" : "9.5px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.08em",
          padding: compact ? "1px 5px" : "2px 7px",
          border: "1px solid var(--border)",
          borderRadius: compact ? "3px" : "4px",
          lineHeight: 1.4,
          gap: "4px",
        }}
        data-earn-lifecycle="pending"
      >
        Verifying…
      </span>
    )
  }
  const meta = LIFECYCLE_LABEL[lifecycle]
  const { color, border } = toneColor(meta.tone)
  return (
    <span
      className="zeks-eyebrow uppercase inline-flex items-center shrink-0"
      style={{
        fontSize: compact ? "9px" : "9.5px",
        color,
        letterSpacing: "0.08em",
        padding: compact ? "1px 5px" : "2px 7px",
        border: `1px solid ${border}`,
        borderRadius: compact ? "3px" : "4px",
        lineHeight: 1.4,
        gap: "4px",
      }}
      data-earn-lifecycle={lifecycle}
      title={
        lifecycle === "active"
          ? "On-chain MarketParams match the row — transaction-eligible."
          : lifecycle === "provisional"
            ? "On-chain MarketParams disagree with the row. Investigate before writing."
            : lifecycle === "inactive"
              ? "On-chain LLTV is the deployment default (1%). Writes revert at the protocol level."
              : "On-chain verification could not run. Reads may be transiently unavailable."
      }
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: compact ? 4 : 5,
          height: compact ? 4 : 5,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
      {meta.text}
    </span>
  )
}

/** Convenience helper to read the lifecycle off a `LendingMarket` row. */
export function lifecycleOf(
  m: Pick<LendingMarket, "lifecycle">,
): F12MarketLifecycle | null {
  return m.lifecycle ?? null
}
