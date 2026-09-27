import AppShell from "@/components/app/app-shell"
import EarnLive from "@/components/earn/earn-live"
import { filterToSupportedEarnMarkets } from "@/lib/markets/lending/supported"

/**
 * Earn SSR bootstrap.
 *
 * Calls the dedicated Earn route
 * (`/api/markets/lending/earn`) — NOT the shared
 * `/api/markets/lending` route.
 *
 * The Earn route is responsible for:
 *   - rejecting `sourceMode === "mock"` rows
 *   - reusing the seven real Morpho rows from the shared pipeline
 *     (AAPL / TSLA / NVDA / GOOGL / MSFT / META / SPCX)
 *   - performing a dedicated AMZN lookup by exact marketId
 *   - reporting AMZN as unavailable (no mock fallback, no synthesis)
 *     when that lookup fails or returns no market
 *
 * This server component does NOT call `fetchLendingMarkets`
 * directly and does NOT touch the shared `/api/markets/lending`
 * pipeline. The Dashboard's lending pipeline remains untouched.
 */

export const metadata = { title: "ZEKS Terminal — Earn" }
export const dynamic = "force-dynamic"

const EARN_API = "http://127.0.0.1:3000/api/markets/lending/earn"

interface EarnApiResponse {
  ok: boolean
  markets: import("@/lib/markets/lending").LendingMarket[]
  amznUnavailableReason: string | null
  fetchedAt: string
  message?: string
}

async function fetchEarnServerSide(): Promise<{
  markets: import("@/lib/markets/lending").LendingMarket[]
  amznUnavailableReason: string | null
  fetchedAt: string
  error: string | null
}> {
  try {
    const res = await fetch(EARN_API, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    })
    if (!res.ok) {
      return {
        markets: [],
        amznUnavailableReason: null,
        fetchedAt: new Date().toISOString(),
        error: `HTTP ${res.status}`,
      }
    }
    const json = (await res.json()) as EarnApiResponse
    if (!json.ok) {
      return {
        markets: [],
        amznUnavailableReason: null,
        fetchedAt: new Date().toISOString(),
        error: json.message ?? "Earn endpoint error",
      }
    }
    // The Earn API has already filtered mock rows and enforced the
    // AMZN-by-id lookup, but we still pass through the supported
    // symbol filter to satisfy caller-side invariants.
    const filtered = filterToSupportedEarnMarkets(json.markets ?? [])
    return {
      markets: filtered,
      amznUnavailableReason: json.amznUnavailableReason ?? null,
      fetchedAt: json.fetchedAt ?? new Date().toISOString(),
      error: null,
    }
  } catch (err) {
    return {
      markets: [],
      amznUnavailableReason: null,
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}

export default async function TerminalEarnPage() {
  const data = await fetchEarnServerSide()

  return (
    <AppShell>
      <EarnLive
        initialMarkets={data.markets}
        initialAmznUnavailableReason={data.amznUnavailableReason}
        initialFetchedAt={data.fetchedAt}
        initialError={data.error}
      />
    </AppShell>
  )
}
