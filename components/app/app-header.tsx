"use client"

import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { Toaster } from "sonner"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import MarketTicker from "@/components/app/market-ticker"
import {
  resolveTickerSymbols,
  TICKER_MAX_VISIBLE,
  type MarketQuote,
} from "@/lib/markets/client"

interface AppHeaderProps {
  /** Robinhood asset registry (symbols + logoUrls). */
  tickerAssets?: { symbol: string; logoUrl?: string | null }[]
  /** Live quotes keyed by symbol. */
  tickerQuotes?: Record<string, MarketQuote>
}

/**
 * AppHeader (v4 — single toolbar)
 *
 * Replaces the old two-row header+ticker stack with a single 48px toolbar:
 *
 *   [ continuously scrolling stock ticker                              ] [ Robinhood Chain ] [ wallet ]
 *
 * Removed:
 *   - "LIVE" text + animated dot
 *   - "Updated just now" timestamp
 *   - page-name title text (titles live inside page content)
 *
 * Data: same server-side source as the old TickerStrip.
 * No new polling, no new endpoints.
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
            title: "text-xs font-mono",
            description: "text-[10px] font-mono text-muted-foreground",
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
      {/* LEFT — stock ticker (flex-grow, scrolls) */}
      <div className="zeks-toolbar-ticker">
        <MarketTicker assets={tickerAssets} quotes={tickerQuotes} />
        {/* Fade mask at the right edge so ticker disappears before right controls */}
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
