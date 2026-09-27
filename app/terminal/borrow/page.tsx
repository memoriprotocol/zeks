import AppShell from "@/components/app/app-shell"
import BorrowLive from "@/components/borrow/borrow-live"
import { fetchLendingMarkets } from "@/lib/markets/lending"

export const metadata = { title: "ZEKS Terminal — Borrow" }
export const dynamic = "force-dynamic"

export default async function TerminalBorrowPage() {
  const result = await fetchLendingMarkets(undefined, { debug: false })

  const initialMarkets =
    result.kind === "error" ? [] : result.payload.markets
  const initialFetchedAt =
    result.kind === "error"
      ? new Date().toISOString()
      : result.payload.fetchedAt
  const initialError = result.kind === "error" ? result.message : null

  return (
    <AppShell>
      <BorrowLive
        initialMarkets={initialMarkets}
        initialFetchedAt={initialFetchedAt}
        initialError={initialError}
      />
    </AppShell>
  )
}

