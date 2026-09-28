/**
 * ZEKS Docs — content model.
 *
 * The documentation body is data, not JSX. Keeping it here means
 * the page component stays layout-only, and a content change never
 * risks breaking a React tree.
 *
 * Every quantitative claim is lifted from the module that renders
 * it in the product, so the guide cannot drift from the UI:
 *   · CURATED_STOCKS / SUPPORTED_LOAN_ASSETS -> lib/markets/loop/constants.ts
 *   · assessLoopRisk()                       -> lib/markets/loop/types.ts
 *   · LOOP_ESTIMATED_FEES_PERCENT            -> lib/markets/loop/constants.ts
 *   · history range windows                  -> lib/markets/history/provider.ts
 *   · ROBINHOOD_CHAIN_ID / Morpho deployment -> lib/markets/lending/types.ts, lib/markets/onchain/abi.ts
 *
 * Deliberately absent: any forward-looking commitment ("coming
 * soon", "planned", "will support"). Only shipped behavior is
 * documented. Where a capability is aspirational it is labeled as
 * such in the copy itself.
 */

export interface DocItem {
  /** Stable anchor id, also used for in-page deep links. */
  id: string
  /** Number shown in the sidebar. Matches the doc's position. */
  num: string
  title: string
  /** One line used as the section summary. */
  blurb?: string
}

export interface DocGroup {
  group: string
  items: DocItem[]
}

/** Sidebar ordering, grouped the way the protocol actually reads. */
export const DOC_GROUPS: DocGroup[] = [
  {
    group: "Orientation",
    items: [
      { id: "what-is-zeks", num: "01", title: "What ZEKS is", blurb: "The problem, and the shape of the solution." },
      { id: "the-loop", num: "02", title: "The loop", blurb: "Three legs, one position." },
      { id: "net-carry", num: "03", title: "Net carry", blurb: "The only number worth quoting." },
    ],
  },
  {
    group: "Protocol",
    items: [
      { id: "markets", num: "04", title: "Markets", blurb: "Eight isolated markets and why isolation matters." },
      { id: "oracles", num: "05", title: "Oracles and market hours", blurb: "The 24/5 problem." },
      { id: "yield-venues", num: "06", title: "Yield venues", blurb: "Where borrowed dollars go." },
      { id: "unwinding", num: "07", title: "Unwinding", blurb: "Closing a position." },
    ],
  },
  {
    group: "Position engine",
    items: [
      { id: "risk", num: "08", title: "Risk", blurb: "What can cost you money, roughly in order." },
      { id: "reading-numbers", num: "09", title: "Reading the numbers", blurb: "APY, LTV, LLTV — and how they differ." },
      { id: "fees", num: "10", title: "Fees", blurb: "Every cost in one table." },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "pricing", num: "11", title: "Which price you are looking at", blurb: "Token price, not share price." },
      { id: "architecture", num: "12", title: "How the data works", blurb: "Price pipeline and chart history." },
      { id: "faq", num: "13", title: "FAQ", blurb: "Direct answers." },
    ],
  },
]

/** Hero statistics. Market count and chain are real, not decorative. */
export const DOC_HERO_STATS: { label: string; value: string }[] = [
  { label: "Markets", value: "8" },
  { label: "Chain", value: "4663" },
  { label: "Engine", value: "Morpho" },
]

export const DOC_LAST_UPDATED = "September 2026"
