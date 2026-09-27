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
    <div
      className="zeks-page"
      data-wallet-status={status}
      style={{ gap: "16px" }}
    >
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header
        className="zeks-page-title-row"
        style={{ alignItems: "flex-end", gap: "16px", rowGap: "10px" }}
      >
        <div
          className="zeks-block"
          style={{ gap: "6px", minWidth: 0, flex: "1 1 auto" }}
        >
          <span className="zeks-label" style={{ color: "var(--muted-foreground)" }}>
            Portfolio
          </span>
          <h1
            className="zeks-display"
            style={{
              fontSize: "26px",
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            Your portfolio
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted-foreground)",
              maxWidth: "60ch",
              lineHeight: 1.5,
              letterSpacing: "-0.005em",
            }}
          >
            Wallet positions, supplied assets, debt and collateral on
            Robinhood Chain.
          </p>
        </div>
        <PortfolioStatusChip status={status} />
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

function PortfolioStatusChip({ status }: { status: string }) {
  let tone: "up" | "warn" | "muted" = "muted"
  let label = "Idle"
  switch (status) {
    case "connected":
      tone = "up"
      label = "Connected"
      break
    case "connecting":
      tone = "warn"
      label = "Connecting"
      break
    case "wrong-network":
      tone = "warn"
      label = "Wrong network"
      break
    case "disconnected":
    case "available":
    case "idle":
    default:
      tone = "muted"
      label = "Disconnected"
  }
  const dotColor =
    tone === "up"
      ? "var(--up)"
      : tone === "warn"
        ? "var(--warning, #b45309)"
        : "var(--muted-foreground)"
  const color =
    tone === "up"
      ? "var(--up)"
      : tone === "warn"
        ? "var(--warning, #b45309)"
        : "var(--muted-foreground)"
  return (
    <span
      className="zeks-eyebrow uppercase inline-flex items-center shrink-0"
      aria-label={`Wallet status: ${label}`}
      data-portfolio-status={status}
      data-portfolio-tone={tone}
      style={{
        gap: "6px",
        fontSize: "10px",
        letterSpacing: "0.08em",
        padding: "4px 9px",
        border: `1px solid ${tone === "muted" ? "var(--border-strong)" : dotColor}`,
        borderRadius: "3px",
        color,
        backgroundColor: "transparent",
        lineHeight: 1.3,
        marginBottom: "4px",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: dotColor,
        }}
      />
      {label}
    </span>
  )
}
