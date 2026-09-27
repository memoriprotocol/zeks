"use client"

/**
 * PortfolioWrongNetwork
 *
 * Focused prompt shown when the wallet is on a chain other than
 * Robinhood. Offers a single "Switch to Robinhood Chain" action.
 */

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"

export default function PortfolioWrongNetwork() {
  const { switchToRobinhoodChain, lastError, clearError } = useWallet()
  const [switching, setSwitching] = React.useState(false)

  React.useEffect(() => {
    return () => {
      // Clear any stale error when leaving this view.
      clearError()
    }
  }, [clearError])

  const onSwitch = React.useCallback(async () => {
    setSwitching(true)
    try {
      await switchToRobinhoodChain()
    } finally {
      setSwitching(false)
    }
  }, [switchToRobinhoodChain])

  return (
    <section
      aria-label="Wrong network"
      data-testid="portfolio-wrong-network"
      className="bg-card border border-border rounded-xl p-8 md:p-10"
    >
      <div className="flex items-start gap-4 max-w-2xl">
        <div
          className="w-12 h-12 rounded-md bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="min-w-0">
          <div className="zeks-eyebrow">
            Portfolio · Wrong network
          </div>
          <h2 className="zeks-display text-[22px] mt-1 text-foreground">
            Switch to Robinhood Chain to view your portfolio.
          </h2>
          <p className="zeks-secondary mt-2 leading-relaxed">
            Your wallet is connected to a different chain. ZEKS reads balances
            from Robinhood Chain only.
          </p>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => void onSwitch()}
              disabled={switching}
              className="zeks-btn-primary h-11 px-5 rounded-md gap-2 text-[13px] font-semibold disabled:opacity-70 disabled:cursor-progress"
              data-testid="portfolio-switch-chain"
            >
              {switching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              <span>
                {switching ? "Switching…" : "Switch to Robinhood Chain"}
              </span>
            </button>
            {lastError ? (
              <span className="zeks-eyebrow text-muted-foreground/70">
                {lastError.message}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
