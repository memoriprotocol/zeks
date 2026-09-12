import AppSidebar from "@/components/app/app-sidebar"
import AppHeader from "@/components/app/app-header"
import { WalletProvider } from "@/components/app/wallet/use-wallet"
import {
  fetchRobinhoodAssets,
  fetchRobinhoodQuotes,
  resolveTickerSymbols,
  type MarketQuote,
} from "@/lib/markets/client"

/**
 * AppShell (v4 — single toolbar)
 *
 * Slim chrome: 168px sidebar + 48px toolbar + scrollable main.
 */
const STRIP_OVERALL_TIMEOUT_MS = 4_000
const ASSETS_OVERALL_TIMEOUT_MS = 5_000

export default async function AppShell({
  current,
  children,
}: {
  /** Sidebar active key */
  current?: string
  children: React.ReactNode
}) {
  let tickerAssets: Awaited<ReturnType<typeof fetchRobinhoodAssets>> = []
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
        tickerQuotes = set.quotes
      }
    }
  } catch {
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
            <AppHeader tickerAssets={tickerAssets} tickerQuotes={tickerQuotes} />
          </div>
          <main className="zeks-shell-main paper">
            {children}
          </main>
        </div>
      </div>
    </WalletProvider>
  )
}
