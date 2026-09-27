/**
 * /terminal/portfolio
 *
 * Wallet-aware Portfolio Shell.
 *
 * Architecture:
 *
 *   - Server component: this page does not block on any upstream
 *     data. The client component (`PortfolioPageClient`) routes
 *     between three wallet states:
 *
 *       1. Disconnected  — wallet not connected. Hero with a
 *                          single ZEKS lime "Connect Wallet" CTA.
 *
 *       2. Connected     — wallet connected. PortfolioLive
 *                          renders real wallet balances (Blockscout),
 *                          Morpho supplied / borrowed / collateral
 *                          positions, weighted APY, and recent
 *                          activity where available.
 *
 *       3. Wrong-network — wallet on a chain other than Robinhood.
 *                          A focused prompt with a switch action.
 *
 * No fake balances, PnL, yield, debt, or transactions.
 */

import AppShell from "@/components/app/app-shell"
import PortfolioPageClient from "@/components/portfolio/portfolio-page-client"

export const metadata = { title: "ZEKS Terminal — Portfolio" }

export default function TerminalPortfolioPage() {
  return (
    <AppShell>
      <PortfolioPageClient />
    </AppShell>
  )
}

