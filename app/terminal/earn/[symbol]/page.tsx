import AppShell from "@/components/app/app-shell"
import EarnDetail from "@/components/earn/earn-detail"
import { notFound } from "next/navigation"
import { filterToSupportedEarnMarkets } from "@/lib/markets/lending/supported"

export const metadata = { title: "ZEKS Terminal — Earn" }
export const dynamic = "force-dynamic"

/**
 * /terminal/earn/[symbol]
 *
 * Per-symbol Earn detail page. Resolves the URL symbol against the
 * canonical Earn dataset returned by `/api/markets/lending/earn`
 * (the same endpoint the Earn index page consumes — no new backend
 * surface, no new shape, no extra API call).
 *
 * Resolution rules:
 *   - If the symbol is not in the supported Earn universe (or the
 *     upstream dataset is empty), we render Next.js's `notFound()`
 *     which the route segment will translate into a clean 404 page
 *     and the client UI handles by routing back to /terminal/earn.
 *   - We deliberately do NOT call `fetchLendingMarket(symbol)` here
 *     because that resolver falls back to mock data — and Earn is
 *     explicitly forbidden from rendering mock rows.
 *
 * EarnDetail wires the locked F2/F3/F5/F6/F7 transaction primitives
 * (Supply / Withdraw / Borrow / Repay / Withdraw-Collateral) gated
 * by F12 lifecycle + F14 readiness.
 */

interface EarnApiResponse {
  ok: boolean
  markets: import("@/lib/markets/lending").LendingMarket[]
  amznUnavailableReason: string | null
  fetchedAt: string
  message?: string
}

const EARN_API = "http://127.0.0.1:3000/api/markets/lending/earn"

async function fetchEarnMarkets(): Promise<
  import("@/lib/markets/lending").LendingMarket[]
> {
  try {
    const res = await fetch(EARN_API, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    })
    if (!res.ok) return []
    const json = (await res.json()) as EarnApiResponse
    if (!json.ok) return []
    return filterToSupportedEarnMarkets(json.markets ?? [])
  } catch {
    return []
  }
}

export default async function TerminalEarnAssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>
}) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase()

  const markets = await fetchEarnMarkets()
  const market = markets.find((m) => m.symbol === symbol) ?? null
  if (!market) notFound()

  return (
    <AppShell>
      <EarnDetail initialMarket={market} initialMarkets={markets} />
    </AppShell>
  )
}
