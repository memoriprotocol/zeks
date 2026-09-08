"use client"

/**
 * PortfolioEmptyState
 *
 * Compact, deliberate empty-state atom used across every Portfolio
 * shell section. Renders inside a single bordered surface — never
 * a giant blank box.
 *
 * Variants:
 *   - "unavailable"  — connected wallet but the data source is not
 *                      available. Default product-state copy.
 *   - "loading"      — transient state during initial hydration.
 *   - "neutral"      — generic placeholder, no specific reason.
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
  return (
    <div
      className="rounded-md border border-dashed border-border/70 px-4 py-5"
      data-testid={testId}
      data-variant={variant}
    >
      {variant === "loading" ? (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="relative inline-flex w-1.5 h-1.5 shrink-0">
            <span className="absolute inset-0 rounded-full opacity-70 animate-ping bg-muted-foreground" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          </span>
          <span>{title}</span>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-foreground">{title}</div>
          {description ? (
            <div className="text-[10px] font-mono text-muted-foreground/70">
              {description}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
