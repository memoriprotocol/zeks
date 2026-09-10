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
      <div
        className="zeks-shell"
        data-app-shell
      >
        <AppSidebar current={current} />
        <div className="zeks-shell-body">
          <div className="zeks-shell-chrome">
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
          </div>
          <main className="zeks-shell-main paper">
            {children}
          </main>
        </div>
      </div>
    </WalletProvider>
  )
}
