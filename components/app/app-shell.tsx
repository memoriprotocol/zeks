import AppSidebar from "@/components/app/app-sidebar"
import AppHeader from "@/components/app/app-header"
import TickerStrip from "@/components/markets/context-strip"
import { WalletProvider } from "@/components/app/wallet/use-wallet"
import {
  fetchRobinhoodAssets,
  fetchRobinhoodQuotes,
  resolveTickerSymbols,
  type MarketQuote,
} from "@/lib/markets/client"

interface AppShellProps {
  /** Optional compact title shown in the header */
  title?: string
  /** Sidebar active key */
  current?: string
  children: React.ReactNode
}

/**
 * AppShell (v3 — Loopr-density)
 *
 * Slim chrome: 168px sidebar + 48px header + 32px context strip
 * + dense scrollable main content area.
 */
const STRIP_OVERALL_TIMEOUT_MS = 4_000
const ASSETS_OVERALL_TIMEOUT_MS = 5_000

export default async function AppShell({
  title,
  current,
  children,
}: AppShellProps) {
  let tickerAssets: Awaited<ReturnType<typeof fetchRobinhoodAssets>> = []
  let tickerFetchedAt = new Date().toISOString()
  let tickerError: string | null = null
  let tickerQuotes: Record<string, MarketQuote> = {}

  try {
    const assetsResult = await Promise.race<
      Awaited<ReturnType<typeof fetchRobinhoodAssets>> | null
    >([
      fetchRobinhoodAssets(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), ASSETS_OVERALL_TIMEOUT_MS),
      ),
    ])
    tickerAssets = assetsResult ?? []

    if (tickerAssets.length > 0) {
      const symbols = resolveTickerSymbols(tickerAssets.map((a) => a.symbol))
      if (symbols.length > 0) {
        const set: { quotes: Record<string, MarketQuote>; fetchedAt: string } =
          await fetchRobinhoodQuotes(symbols, {
            timeoutMs: STRIP_OVERALL_TIMEOUT_MS,
          })
        tickerFetchedAt = set.fetchedAt
        tickerQuotes = set.quotes
      }
    }
  } catch (err) {
    tickerError =
      err instanceof Error ? err.message : "Failed to load market ticker."
    tickerAssets = []
  }

  return (
    <WalletProvider>
      <div className="min-h-screen bg-background flex">
        <AppSidebar current={current} />
        <div className="flex-1 min-w-0 flex flex-col">
          <AppHeader title={title} />
          {tickerAssets.length > 0 ? (
            <TickerStrip
              assets={tickerAssets.map((a) => ({
                symbol: a.symbol,
                logoUrl: a.logoUrl,
              }))}
              quotes={tickerQuotes}
              fetchedAt={tickerFetchedAt}
              errorReason={tickerError}
            />
          ) : null}
          <main
            className="flex-1 overflow-x-clip paper"
            style={{
              paddingLeft: "var(--content-pad-x)",
              paddingRight: "var(--content-pad-x)",
              paddingTop: "var(--content-pad-y)",
              paddingBottom: "var(--content-pad-y)",
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </WalletProvider>
  )
}
