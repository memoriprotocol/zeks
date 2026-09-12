/**
 * /terminal/portfolio
 *
 * Portfolio Shell V1.
 *
 * Architecture:
 *
 *   - Server component: this page does not block on any upstream
 *     data. The connected-state shells render with every numeric
 *     value as "—" because real wallet positions, balances, PnL,
 *     yield, debt, and activity are not implemented yet.
 *
 *   - Client component (`PortfolioPageClient`): owns the
 *     wallet-aware routing between three states:
 *
 *       1. Disconnected  — wallet not connected. Hero with a
 *                          single ZEKS lime "Connect Wallet" CTA.
 *
 *       2. Connected     — wallet connected. Five shells render
 *                          with empty states and every financial
 *                          value as "—".
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
    <AppShell current="portfolio">
      <PortfolioPageClient />
    </AppShell>
  )
}
