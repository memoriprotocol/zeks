"use client"

/**
 * PortfolioEmptyState
 *
 * Deliberate empty-state atom used across every Portfolio shell
 * section. Uses the shared `.zeks-empty` token for consistent
 * rhythm with the rest of the page — never a giant blank box.
 *
 * Variants:
 *   - "unavailable" — connected wallet but the data source is not
 *                     available. Default product-state copy.
 *   - "loading"     — transient state during initial hydration.
 *   - "neutral"     — generic placeholder, no specific reason.
 *
 * No fake numbers, balances, PnL, yield, debt, or transactions.
 */

import * as React from "react"

interface PortfolioEmptyStateProps {
  variant?: "unavailable" | "loading" | "neutral"
  title: string
  description?: string
  testId?: string
}

export default function PortfolioEmptyState({
  variant = "unavailable",
  title,
  description,
  testId,
}: PortfolioEmptyStateProps) {
  if (variant === "loading") {
    return (
      <div className="zeks-empty" data-testid={testId} data-variant={variant}>
        <span className="flex items-center gap-2 zeks-meta">
          <span className="zeks-live-dot" data-live="true" />
          {title}
        </span>
      </div>
    )
  }

  return (
    <div className="zeks-empty" data-testid={testId} data-variant={variant}>
      <span className="font-mono text-[12px] text-foreground">{title}</span>
      {description ? (
        <span className="zeks-dim">{description}</span>
      ) : null}
    </div>
  )
}
