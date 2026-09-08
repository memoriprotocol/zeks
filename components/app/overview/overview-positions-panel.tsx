"use client"

/**
 * OverviewPositionsPanel
 *
 * Wallet-aware positions panel on the Overview page.
 *
 *   Disconnected / wrong-network → compact CTA.
 *   Connected / no positions     → single-line clean empty state.
 *   Connected / has positions    → three grouped blocks (supplied,
 *                                   borrowed, collateral).
 *
 * Designed to be scan-friendly: only position totals + asset rows.
 * No fake balances.
 */

import * as React from "react"
import Link from "next/link"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { usePortfolio } from "@/components/portfolio/use-portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"

export default function OverviewPositionsPanel() {
  const { status } = useWallet()
  const { snapshot, loading } = usePortfolio()

  return (
    <section
      aria-label="Your positions"
      data-testid="overview-positions-panel"
      className="bg-card border border-border rounded-2xl p-5 md:p-6 min-w-0"
    >
      <div className="flex items-baseline justify-between mb-4 gap-2 flex-wrap">
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          YOUR POSITIONS
        </span>
        <Link
          href="/terminal/portfolio"
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground tracking-wider"
        >
          View portfolio →
        </Link>
      </div>

      {status !== "connected" ? (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-5">
          <p className="text-sm font-mono text-foreground">
            {status === "wrong-network"
              ? "Switch to Robinhood Chain"
              : "Connect your wallet"}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground/70 mt-1">
            Your supplied, borrowed and collateral positions will appear
            here.
          </p>
          <div className="mt-3">
            <WalletButton />
          </div>
        </div>
      ) : snapshot === null ? (
        <p className="text-[11px] font-mono text-muted-foreground/70">
          {loading ? "Loading positions…" : "Data unavailable"}
        </p>
      ) : (
        <PositionsBody snapshot={snapshot} />
      )}
    </section>
  )
}

function PositionsBody({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const supplied = snapshot.supplied
  const borrowed = snapshot.borrowed
  const collateral = snapshot.collateral

  if (supplied.length === 0 && borrowed.length === 0 && collateral.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-4 py-5">
        <p className="text-sm font-mono text-foreground">No active positions</p>
        <p className="text-[11px] font-mono text-muted-foreground/70 mt-1">
          Supply to a Morpho market to start earning.
        </p>
        <Link
          href="/terminal/earn"
          className="mt-3 inline-block text-[11px] font-mono text-muted-foreground hover:text-foreground tracking-wider"
        >
          Browse yield →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {supplied.length > 0 ? (
        <PositionRow
          title="Supplied"
          rows={supplied.map((s) => ({
            key: s.marketId ?? s.symbol,
            symbol: s.symbol,
            apy: s.supplyApy,
            usd: s.balanceUsd,
          }))}
          tone="positive"
        />
      ) : null}
      {borrowed.length > 0 ? (
        <PositionRow
          title="Borrowed"
          rows={borrowed.map((b) => ({
            key: b.marketId ?? b.symbol,
            symbol: b.symbol,
            apy: b.borrowApy,
            usd: b.balanceUsd,
          }))}
          tone="negative"
        />
      ) : null}
      {collateral.length > 0 ? (
        <PositionRow
          title="Collateral"
          rows={collateral.map((c) => ({
            key: c.marketId ?? c.symbol,
            symbol: c.symbol,
            apy: null,
            usd: c.balanceUsd,
          }))}
          tone="neutral"
        />
      ) : null}
    </div>
  )
}

function PositionRow({
  title,
  rows,
  tone,
}: {
  title: string
  rows: Array<{ key: string; symbol: string; apy: number | null; usd: number | null }>
  tone: "positive" | "negative" | "neutral"
}) {
  const apyColor =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : "text-foreground"
  return (
    <div>
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70 mb-2">
        {title.toUpperCase()}
      </div>
      <div className="rounded-xl border border-border/70 overflow-hidden">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={
              "flex items-center justify-between gap-3 px-3 h-10 " +
              (i > 0 ? "border-t border-border/70 " : "")
            }
          >
            <span className="font-mono text-sm truncate">{r.symbol}</span>
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className={apyColor}>
                {r.apy != null ? formatApy(r.apy) : "—"}
              </span>
              <span className="text-foreground text-right min-w-[80px]">
                {r.usd != null ? formatPrice(r.usd) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
