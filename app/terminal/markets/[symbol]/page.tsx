import AppShell from "@/components/app/app-shell"
import { notFound } from "next/navigation"
import LendingMarketDetail from "@/components/markets/lending-market-detail"
import { fetchLendingMarket } from "@/lib/markets/lending"

export const dynamic = "force-dynamic"

/**
 * /terminal/markets/[symbol]
 *
 * Per-symbol Morpho lending market detail page. Wires the full
 * 5-tab MarketsActionPanel (SUPPLY / WITHDRAW / BORROW / REPAY /
 * WITHDRAW_COLLATERAL) via the locked F2/F3/F5/F6/F7 primitives.
 * F12 lifecycle + transaction-eligibility gate every CTA.
 */
export default async function LendingMarketDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>
}) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase()

  const market = await fetchLendingMarket(symbol)
  if (!market) notFound()

  return (
    <AppShell>
      <LendingMarketDetail market={market} />
    </AppShell>
  )
}
