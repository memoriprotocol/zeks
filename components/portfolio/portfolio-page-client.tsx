"use client"

/**
 * PortfolioPageClient
 *
 * Wallet-aware router for /terminal/portfolio.
 *
 *   Disconnected   → hero CTA. No data shells.
 *   Wrong-network  → switch-network prompt. No data shells.
 *   Connected      → live portfolio shells (Morpho + wallet RPC +
 *                    Blockscout). Real balances, supply/borrow
 *                    positions, weighted APY, and recent activity
 *                    where available. No fabrication.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import PortfolioDisconnected from "./portfolio-disconnected"
import PortfolioWrongNetwork from "./portfolio-wrong-network"
import PortfolioLive from "./portfolio-live"

interface PortfolioPageClientProps {
  /** Reserved for future real wallet-position data sources. */
  _assetsReserved?: never
}

export default function PortfolioPageClient({}: PortfolioPageClientProps) {
  const { status } = useWallet()

  const isWrongNetwork = status === "wrong-network"
  const isDisconnected =
    status === "idle" ||
    status === "available" ||
    status === "disconnected" ||
    status === "connecting"
  return (
    <div className="w-full" data-wallet-status={status}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
          PORTFOLIO
        </div>
        <h1 className="font-serif text-2xl md:text-3xl leading-tight text-foreground mt-1.5">
          Your portfolio
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
          Wallet positions, supplied assets, debt and collateral on Robinhood
          Chain.
        </p>
      </div>

      {/* ── Wallet gate ─────────────────────────────────────────────────── */}
      {isWrongNetwork ? (
        <PortfolioWrongNetwork />
      ) : isDisconnected ? (
        <PortfolioDisconnected />
      ) : (
        <PortfolioLive />
      )}
    </div>
  )
}
