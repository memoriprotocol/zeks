import AppShell from "@/components/app/app-shell"
import EarnLive from "@/components/earn/earn-live"
import { fetchLendingMarkets } from "@/lib/markets/lending"
import { filterToSupportedEarnMarkets } from "@/lib/markets/lending/supported"

export const metadata = { title: "ZEKS Terminal — Earn" }
export const dynamic = "force-dynamic"

export default async function TerminalEarnPage() {
  const result = await fetchLendingMarkets(undefined, { debug: false })

  // Filter to the supported 8 Stock-Token tickers BEFORE SSR → client.
  // The filter is symbol-based (case-insensitive, trimmed) — it does
  // NOT consult logoUrl.
  const allMarkets =
    result.kind === "error" ? [] : result.payload.markets
  const initialMarkets = filterToSupportedEarnMarkets(allMarkets)
  const initialFetchedAt =
    result.kind === "error"
      ? new Date().toISOString()
      : result.payload.fetchedAt
  const initialError = result.kind === "error" ? result.message : null

  return (
    <AppShell>
      <EarnLive
        initialMarkets={initialMarkets}
        initialFetchedAt={initialFetchedAt}
        initialError={initialError}
      />
    </AppShell>
  )
}
