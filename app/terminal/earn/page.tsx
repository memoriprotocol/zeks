import AppShell from "@/components/app/app-shell"
import EarnLive from "@/components/earn/earn-live"
import { fetchLendingMarkets } from "@/lib/markets/lending"

export const metadata = { title: "ZEKS Terminal — Earn" }
export const dynamic = "force-dynamic"

export default async function TerminalEarnPage() {
  const result = await fetchLendingMarkets(undefined, { debug: false })

  const initialMarkets =
    result.kind === "error" ? [] : result.payload.markets
  const initialFetchedAt =
    result.kind === "error"
      ? new Date().toISOString()
      : result.payload.fetchedAt
  const initialError = result.kind === "error" ? result.message : null

  return (
    <AppShell current="earn" title="EARN">
      <EarnLive
        initialMarkets={initialMarkets}
        initialFetchedAt={initialFetchedAt}
        initialError={initialError}
      />
    </AppShell>
  )
}
