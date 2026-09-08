"use client"

/**
 * OverviewHero
 *
 * Featured portfolio / liquidity block in the top-left of the
 * dashboard.
 *
 *   - Big serif net-value headline.
 *   - 3-column "key metrics" row underneath (Supplied / Borrowed /
 *     Supply APY) with mono numbers.
 *   - Soft paper surface (no harsh borders).
 *   - Right-aligned wallet status pill.
 *
 * Compact when no wallet: small placeholder + Connect CTA inline.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { usePortfolio } from "@/components/portfolio/use-portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"

interface OverviewHeroProps {
  className?: string
}

export default function OverviewHero({ className }: OverviewHeroProps) {
  const { status, shortAddress } = useWallet()
  const { snapshot, loading } = usePortfolio()

  const connected = status === "connected"
  const wrong = status === "wrong-network"

  return (
    <section
      aria-label="Your portfolio"
      data-testid="overview-hero"
      data-wallet-status={status}
      className={
        "relative rounded-2xl border border-border bg-card p-5 md:p-6 " +
        (className ?? "")
      }
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          NET VALUE
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
          {shortAddress ?? "Not connected"}
        </span>
      </div>

      {!connected ? (
        <DisconnectedBody wrong={wrong} />
      ) : (
        <ConnectedBody snapshot={snapshot} loading={loading} />
      )}

      {/* Footer row */}
      <div className="mt-5 pt-4 border-t border-border flex items-center gap-4 flex-wrap">
        <Link
          href="/terminal/portfolio"
          className="group inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:text-foreground/80"
        >
          Open portfolio
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/terminal/earn"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Browse yield
        </Link>
        <span className="ml-auto text-[10px] font-mono tracking-wider text-muted-foreground/60">
          Morpho · Robinhood Chain
        </span>
      </div>
    </section>
  )
}

function DisconnectedBody({ wrong }: { wrong: boolean }) {
  return (
    <div className="mt-3">
      <p className="font-serif text-[28px] md:text-[32px] leading-[1.05] tracking-tight text-foreground/80">
        {wrong ? "Switch to Robinhood Chain" : "Connect your wallet"}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground max-w-md leading-relaxed">
        {wrong
          ? "Your wallet is on a different network. Switch to Robinhood Chain (4663) to view your portfolio."
          : "See your supplied assets, borrow positions and earned yield across Morpho on Robinhood Chain."}
      </p>
      <div className="mt-4">
        <WalletButton />
      </div>
    </div>
  )
}

function ConnectedBody({
  snapshot,
  loading,
}: {
  snapshot: ReturnType<typeof usePortfolio>["snapshot"]
  loading: boolean
}) {
  const net = snapshot?.netValueUsd ?? null
  const supplied = snapshot?.totalSuppliedUsd ?? null
  const borrowed = snapshot?.totalBorrowedUsd ?? null
  const apy = snapshot?.weightedSupplyApy ?? null

  const hasPositions =
    (snapshot?.supplied.length ?? 0) +
      (snapshot?.borrowed.length ?? 0) +
      (snapshot?.collateral.length ?? 0) >
    0

  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={
            "font-serif leading-none tabular-nums text-[44px] md:text-[56px] tracking-tight " +
            (net == null
              ? "text-foreground/40"
              : net >= 0
                ? "text-foreground"
                : "text-down")
          }
          data-testid="overview-hero-net"
        >
          {net != null ? formatPrice(net) : "—"}
        </span>
      </div>

      <p className="mt-2 text-[11px] font-mono tracking-wider text-muted-foreground/70">
        {loading && !snapshot
          ? "Loading…"
          : hasPositions
            ? "Live"
            : "No active positions"}
      </p>

      {/* 3-column key metrics, mono numbers */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Metric label="Supplied" value={formatPrice(supplied)} tone="up" />
        <Metric label="Borrowed" value={formatPrice(borrowed)} tone="down" />
        <Metric
          label="Supply APY"
          value={apy != null ? formatApy(apy * 100) : "—"}
          tone={apy != null ? "up" : "neutral"}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "up" | "down" | "neutral"
}) {
  const toneClass =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"
  return (
    <div className="border-l border-border pl-3">
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className={`font-mono tabular-nums text-[15px] mt-1 ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}
