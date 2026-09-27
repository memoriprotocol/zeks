"use client"

/**
 * PortfolioPositionLink — F16 minimal per-position action link.
 *
 * Renders a single, explicit navigation link to the existing locked
 * transaction surface for one Portfolio position. The link does NOT
 *   - request a wallet signature
 *   - submit a transaction
 *   - approve a token
 *   - auto-execute any writer
 *
 * It is pure navigation. The destination page recomputes readiness,
 * eligibility, balances, and allowances from real onchain state on
 * mount. Nothing from this link (or its query string) is ever
 * trusted as a financial primitive.
 *
 * Position kinds:
 *   "supplied"   → Markets Detail page (locked F15 / F2 / F3 writers).
 *   "borrowed"   → Markets Detail page (locked F15 / F7B / F7C writers).
 *   "collateral" → Markets Detail page (locked F15 / F7D / F6D writers).
 *
 * Wallet balances do NOT render this component — there is no
 * canonical transaction surface for "transfer your wallet balance".
 *
 * P2C — Portfolio ⇄ Markets Detail integration:
 *   The link carries ONE non-financial navigation hint: a stable
 *   `?action=<withdraw|repay|withdraw-collateral>` query parameter
 *   that the destination's MarketsActionPanel reads as an initial
 *   tab suggestion. The Markets Detail page treats this as a hint
 *   only; every action remains gated by:
 *     - the page-level F14 mirror (F12 transactionEligible)
 *     - the existing per-tab readiness hook
 *     - the existing approval flow
 *     - the existing receipt trail
 *   A position with no `collateralSymbol` (e.g. wallet-only leg) is
 *   non-navigable: the link renders nothing. The brief's "STOP if the
 *   required identity cannot be derived from existing real data" rule
 *   is honored by skipping the link instead of guessing a symbol.
 *
 * Visual treatment matches the existing Portfolio table rows.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export type PortfolioPositionKind = "supplied" | "borrowed" | "collateral"

type ActionHint = "withdraw" | "repay" | "withdraw-collateral"

interface PortfolioPositionLinkProps {
  kind: PortfolioPositionKind
  /** Display symbol (loan asset for supplied/borrowed, collateral for
   *  collateral legs). Used as the link's visible label and the
   *  `data-portfolio-symbol` attribute. */
  symbol: string
  /** Optional disambiguator shown next to the action label. */
  short?: boolean
  /**
   * The COLLATERAL asset symbol — the stable market identity used by
   * the Markets Detail route (`/terminal/markets/[symbol]`). Required
   * for the link to render; absent → no link (the brief forbids
   * guessing financial identity from display text).
   */
  marketSymbol: string | null
}

function destination(
  kind: PortfolioPositionKind,
  marketSymbol: string,
): { href: string; hint: ActionHint } {
  const enc = encodeURIComponent(marketSymbol)
  // The locked MarketsActionPanel owns its tab state and defaults to
  // SUPPLY on mount. We pass a non-binding `?action=` hint that the
  // panel can read once at mount time. The hint NEVER bypasses the
  // page-level F14 mirror or the per-tab readiness gates.
  switch (kind) {
    case "supplied":
      return { href: `/terminal/markets/${enc}?action=withdraw`, hint: "withdraw" }
    case "borrowed":
      return { href: `/terminal/markets/${enc}?action=repay`, hint: "repay" }
    case "collateral":
      return {
        href: `/terminal/markets/${enc}?action=withdraw-collateral`,
        hint: "withdraw-collateral",
      }
  }
}

function label(kind: PortfolioPositionKind): string {
  switch (kind) {
    case "supplied":
      return "Withdraw"
    case "borrowed":
      return "Repay"
    case "collateral":
      return "Withdraw collateral"
  }
}

export function PortfolioPositionLink({
  kind,
  symbol,
  short = false,
  marketSymbol,
}: PortfolioPositionLinkProps) {
  // Hard rule: no `collateralSymbol` → no link. We do not guess
  // market identity from the display symbol (which is the loan
  // asset for supplied / borrowed legs).
  if (!marketSymbol) return null

  const { href } = destination(kind, marketSymbol)
  return (
    <Link
      href={href}
      data-portfolio-action={kind}
      data-portfolio-symbol={symbol}
      data-portfolio-market={marketSymbol}
      className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground/80"
      aria-label={`${label(kind)} ${symbol}`}
    >
      {short ? "" : label(kind)}
      <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
