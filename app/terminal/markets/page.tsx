import AppShell from "@/components/app/app-shell"
import MarketsPageClient from "@/components/markets/markets-page-client"
import { fetchLendingMarkets } from "@/lib/markets/lending"

export const metadata = { title: "ZEKS Terminal — Lending Markets" }
export const dynamic = "force-dynamic"

/**
 * /terminal/markets
 * Server-side hydration of the Morpho GraphQL universe (chainId 4663).
 */
export default async function TerminalMarketsPage() {
  const result = await fetchLendingMarkets(undefined, { debug: false })

  return (
    <AppShell current="markets" title="MARKETS">
      <MarketsPageClient
        initialResult={result}
        initialNowMs={Date.now()}
      />
    </AppShell>
  )
}
