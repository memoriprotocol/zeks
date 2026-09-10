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
    <div className="zeks-page" data-wallet-status={status}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="zeks-block" style={{ gap: "var(--page-title-gap)" }}>
        <div className="zeks-block" style={{ gap: "6px" }}>
          <span className="zeks-label">Portfolio</span>
          <h1 className="zeks-display">Your portfolio</h1>
          <p
            style={{
              fontSize: "var(--font-body)",
              color: "var(--muted-foreground)",
              maxWidth: "56ch",
              marginTop: "2px",
              lineHeight: 1.5,
            }}
          >
            Wallet positions, supplied assets, debt and collateral on Robinhood
            Chain.
          </p>
        </div>
      </header>

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
