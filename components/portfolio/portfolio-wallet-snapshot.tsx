"use client"

/**
 * PortfolioWalletSnapshot (v3)
 *
 * Compact wallet + chain card on the Portfolio page.
 * Always renders, even when there are no Morpho positions.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { useNetworkStatus } from "@/components/zeks/use-network-status"
import { usePortfolio } from "./use-portfolio"
import { formatUnits } from "@/lib/markets/onchain/format-units"

export default function PortfolioWalletSnapshot() {
  const wallet = useWallet()
  const network = useNetworkStatus()
  const { snapshot } = usePortfolio()
  const balances = React.useMemo(() => {
    return (snapshot?.walletBalances ?? []).slice(0, 6)
  }, [snapshot])

  return (
    <section
      aria-label="Wallet"
      data-testid="portfolio-wallet-snapshot"
      className="rounded-2xl border border-border bg-card p-5 md:p-6 min-w-0"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <span className="zeks-eyebrow text-muted-foreground/80">
          Wallet
        </span>
        <span
          className={`inline-flex items-center gap-1 zeks-eyebrow ${
            network.robinhoodRpc === "live"
              ? "text-up"
              : "text-amber-700 dark:text-amber-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={
              "w-1.5 h-1.5 rounded-full " +
              (network.robinhoodRpc === "live" ? "bg-up" : "bg-amber-500")
            }
          />
          {network.robinhoodRpc === "live" ? "Live" : "Stale"}
        </span>
      </div>

      {wallet.status !== "connected" ? (
        <div>
          <p className="zeks-secondary leading-relaxed">
            {wallet.status === "wrong-network"
              ? "Switch to Robinhood Chain."
              : "Connect your wallet."}
          </p>
          <div className="mt-3">
            <WalletButton />
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[12px] text-foreground/90 truncate zeks-tech-sm">
            {wallet.shortAddress ?? wallet.address}
          </div>
          <div className="mt-1 flex items-center gap-1.5 zeks-eyebrow text-muted-foreground/80">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-primary"
            />
            Robinhood Chain
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <div className="zeks-eyebrow text-muted-foreground/70 mb-2">
              Token balances
            </div>
            {balances.length === 0 ? (
              <p className="zeks-secondary text-[11.5px]">
                No balances found
              </p>
            ) : (
              <ul className="space-y-1">
                {balances.map((b) => {
                  const amount = formatAmount(b.balanceRaw)
                  return (
                    <li
                      key={b.contractAddress ?? b.symbol}
                      className="flex items-center justify-between text-[11.5px] font-sans"
                    >
                      <span className="text-foreground">{b.symbol}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {amount}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Compact display of a token balance:
 *   - Bigint → decimal string via formatUnits.
 *   - Trims to at most 4 fractional digits.
 */
function formatAmount(raw: bigint): string {
  const full = formatUnits(raw, 18)
  const [whole, frac] = full.split(".")
  if (!frac) return whole
  if (frac.length <= 4) return full
  return `${whole}.${frac.slice(0, 4).replace(/0+$/, "") || whole}`
}

