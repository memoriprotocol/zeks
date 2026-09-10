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
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {visible.map((issue, i) => (
        <div
          key={i}
          className="text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          data-portfolio-issue={issue.kind}
        >
          {labelFor(issue)}
        </div>
      ))}
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
