/**
 * /docs — public documentation site.
 *
 *   Separate from /terminal: this is a scrollable reading
 *   experience with its own doc rail, not the app shell. It shares
 *   the ZEKS light theme so the brand is continuous, but it carries
 *   no product chrome, fetches no markets, and reads no wallet.
 *
 *   /terminal/docs remains the in-app quick guide for traders
 *   already using the terminal. This route is the full reference.
 */

import DocsLayout from "@/components/docs/docs-layout"

export const metadata = {
  title: "ZEKS Docs — Tokenized stock lending",
  description:
    "How the loop works, how to read the numbers, where the risk sits, and which price you are actually looking at.",
}

export default function DocsRoute() {
  return <DocsLayout />
}
