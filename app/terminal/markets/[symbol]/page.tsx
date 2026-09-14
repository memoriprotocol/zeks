import AppShell from "@/components/app/app-shell"
import { notFound } from "next/navigation"
import LendingMarketDetail from "@/components/markets/lending-market-detail"
import { fetchLendingMarket } from "@/lib/markets/lending"

export const dynamic = "force-dynamic"

/**
 * /terminal/markets/[symbol]
 *
 * Loopr-style lending market detail page. Read-only; no Supply /
 * Borrow / wallet / health factor logic yet.
 *
 * Phase 2: the per-symbol market is resolved by the lending
 * service, which tries live Morpho first and falls back to mock
 * when no Morpho market exists for that symbol.
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
