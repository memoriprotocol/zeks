"use client"

/**
 * PortfolioDisconnected
 *
 * Wallet-aware disconnected hero. Shown when:
 *   - status === "idle"
 *   - status === "available"
 *   - status === "disconnected"
 *
 * Single ZEKS lime "Connect Wallet" CTA that opens the wallet
 * selection modal. Below the CTA: a compact description of what
 * the page will show once connected (no fake numbers).
 */

import * as React from "react"
import { Wallet } from "lucide-react"
import WalletSelectModal from "@/components/app/wallet/wallet-select-modal"

interface PortfolioDisconnectedProps {
  /** Optional reason surfaced beneath the CTA. */
  hint?: string
}

export default function PortfolioDisconnected({
  hint,
}: PortfolioDisconnectedProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <section
      aria-label="Connect wallet to view portfolio"
      data-testid="portfolio-disconnected"
      className="bg-card border border-border rounded-xl p-8 md:p-10"
    >
      <div className="flex items-start gap-4 max-w-2xl">
        <div
          className="w-12 h-12 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Wallet className="w-5 h-5 text-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-mono tracking-wider text-muted-foreground">
            PORTFOLIO · ROBINHOOD CHAIN
          </div>
          <h2 className="font-serif text-2xl text-foreground mt-1">
            Connect a wallet to view your portfolio.
          </h2>
          <p className="text-sm font-mono text-muted-foreground mt-2 leading-relaxed">
            Account summary, Stock Token positions, onchain earn positions,
            borrow positions, and recent activity will appear here once your
            wallet is connected to Robinhood Chain.
          </p>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-xs font-mono font-semibold tracking-wider hover:bg-primary/90 transition-colors"
              data-testid="portfolio-connect-wallet"
              aria-haspopup="dialog"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {hint ?? "EIP-1193 · No data leaves your browser."}
            </span>
          </div>
        </div>
      </div>

      <WalletSelectModal open={open} onOpenChange={setOpen} />
    </section>
  )
}
