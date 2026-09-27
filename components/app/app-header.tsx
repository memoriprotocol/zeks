"use client"

import * as React from "react"
import { toast } from "sonner"
import { Toaster } from "sonner"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import MarketTicker from "@/components/app/market-ticker"
import type { MarketQuote } from "@/lib/markets/client"

interface AppHeaderProps {
  /** Robinhood asset registry (symbols + logoUrls). */
  tickerAssets?: { symbol: string; logoUrl?: string | null }[]
  /** Live quotes keyed by symbol. */
  tickerQuotes?: Record<string, MarketQuote>
}

/**
 * AppHeader (UI-1B · clean horizontal top bar)
 *
 *   [ ticker stream · fills available width │ Robinhood Chain · wallet ]
 *
 *   · 56px toolbar
 *   · No left context, no page-name repeated
 *   · Right controls stay anchored
 *
 *   Ticker + wallet logic preserved from v4.
 */
export default function AppHeader(props: AppHeaderProps) {
  return (
    <>
      <Toaster
        position="top-right"
        theme="light"
        toastOptions={{
          classNames: {
            toast: "border border-border bg-card text-foreground rounded-xl",
            title: "text-xs font-medium",
            description: "text-[11px] text-muted-foreground",
          },
        }}
      />
      <AppHeaderChrome {...props} />
    </>
  )
}

function AppHeaderChrome({ tickerAssets = [], tickerQuotes = {} }: AppHeaderProps) {
  const { lastError, status, switchToRobinhoodChain } = useWallet()

  React.useEffect(() => {
    if (!lastError) return
    const id = toast.error(lastError.message, {
      description: "Robinhood Chain",
      duration: 4500,
    })
    return () => {
      toast.dismiss(id)
    }
  }, [lastError])

  const isWrongNetwork = status === "wrong-network"

  return (
    <header className="zeks-toolbar">
      {/* CENTER — stock ticker (flex-grow, scrolls) */}
      <div className="zeks-toolbar-ticker">
        <MarketTicker assets={tickerAssets} quotes={tickerQuotes} />
        <span className="zeks-toolbar-ticker-fade" aria-hidden="true" />
      </div>

      {/* RIGHT — network + wallet (fixed, never scrolls) */}
      <div className="zeks-toolbar-right">
        {isWrongNetwork ? (
          <button
            type="button"
            onClick={() => void switchToRobinhoodChain()}
            className="zeks-toolbar-network-btn"
            aria-label="Switch to Robinhood Chain"
          >
            <span className="zeks-toolbar-dot zeks-toolbar-dot-warn" />
            <span>Switch network</span>
          </button>
        ) : (
          <div className="zeks-toolbar-network" aria-label="Network: Robinhood Chain">
            <span className="zeks-toolbar-dot" />
            <span>Robinhood Chain</span>
          </div>
        )}
        <WalletButton />
      </div>
    </header>
  )
}
