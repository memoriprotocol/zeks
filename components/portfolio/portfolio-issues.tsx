"use client"

/**
 * PortfolioIssues
 *
 * Renders the typed `PortfolioIssue` array as compact amber info
 * chips. Surfaces user-visible reasons for missing or incomplete
 * data — never hides them silently.
 */

import * as React from "react"
import type { PortfolioIssue } from "./use-portfolio"

export default function PortfolioIssues({
  issues,
}: {
  issues: PortfolioIssue[]
}) {
  if (!issues.length) return null
  const visible = issues.filter((i) => i.kind !== "no-position")
  if (visible.length === 0) return null
  // Cap visible chips to avoid the "N issues" development-style list
  // when the wallet contains unrelated tokens. Group the overflow
  // into a single chip so the panel stays compact.
  const MAX_VISIBLE = 1
  const shown = visible.slice(0, MAX_VISIBLE)
  const overflow = visible.length - shown.length
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {shown.map((issue, i) => (
        <div
          key={i}
          className="zeks-eyebrow px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          data-portfolio-issue={issue.kind}
        >
          {labelFor(issue)}
        </div>
      ))}
      {overflow > 0 ? (
        <div
          className="zeks-eyebrow px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          data-portfolio-issue="more"
        >
          +{overflow} more
        </div>
      ) : null}
    </div>
  )
}

function labelFor(issue: PortfolioIssue): string {
  switch (issue.kind) {
    case "wrong-network":
      return "Switch to Robinhood Chain to view your portfolio."
    case "morpho-unavailable":
    case "rpc-unavailable":
    case "missing-token-info":
      return "Live data unavailable."
    case "no-position":
      return "No active positions."
    default:
      return "Live data unavailable."
  }
}
