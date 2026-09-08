"use client"

/**
 * OverviewPositions
 *
 * Bottom-right of the dashboard. Compact positions summary.
 *
 *   - Connected / has positions → 3 grouped mini-rows (Supplied,
 *     Borrowed, Collateral).
 *   - Connected / empty         → compact 1-line "No active
 *     positions" hint + link to Earn.
 *   - Disconnected / wrong      → compact CTA, no giant card.
 *
 * Total cost: a small panel, ~280-360px tall.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { usePortfolio } from "@/components/portfolio/use-portfolio"
import { formatPrice, formatApy } from "@/lib/markets/format"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"

export default function OverviewPositions() {
  const { status } = useWallet()
  const { snapshot } = usePortfolio()

  return (
    <section
      aria-label="Your positions"
      data-testid="overview-positions"
      className="rounded-2xl border border-border bg-card p-5 md:p-6 min-w-0"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            POSITIONS
          </span>
          <span className="text-[11px] text-muted-foreground">
            Onchain across Morpho
          </span>
        </div>
        <Link
          href="/terminal/portfolio"
          className="group inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Open
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {status !== "connected" ? (
        <DisconnectedPositions wrong={status === "wrong-network"} />
      ) : snapshot === null ? (
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
          Loading…
        </p>
      ) : (
        <Positions summary={summaryFrom(snapshot)} />
      )}
    </section>
  )
}

interface Row { symbol: string; apy: number | null; usd: number | null; marketId: string | null }
interface Summary { supplied: Row[]; borrowed: Row[]; collateral: Row[] }

function summaryFrom(snapshot: PortfolioSnapshot): Summary {
  return {
    supplied: snapshot.supplied.map((s) => ({
      symbol: s.symbol,
      apy: s.supplyApy,
      usd: s.balanceUsd,
      marketId: s.marketId,
    })),
    borrowed: snapshot.borrowed.map((b) => ({
      symbol: b.symbol,
      apy: b.borrowApy,
      usd: b.balanceUsd,
      marketId: b.marketId,
    })),
    collateral: snapshot.collateral.map((c) => ({
      symbol: c.symbol,
      apy: null,
      usd: c.balanceUsd,
      marketId: c.marketId,
    })),
  }
}

function DisconnectedPositions({ wrong }: { wrong: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        {wrong
          ? "Switch to Robinhood Chain to see your positions."
          : "Connect to view your positions."}
      </p>
      <div className="mt-3">
        <WalletButton />
      </div>
    </div>
  )
}

function Positions({ summary }: { summary: Summary }) {
  const { supplied, borrowed, collateral } = summary
  const empty = supplied.length === 0 && borrowed.length === 0 && collateral.length === 0

  if (empty) {
    return (
      <div>
        <p className="font-serif text-[15px] text-foreground">No active positions</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
          Supply to a Morpho market to start earning.
        </p>
        <Link
          href="/terminal/earn"
          className="group mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:text-foreground/80"
        >
          Browse yield
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {supplied.length > 0 ? <Group label="Supplied" tone="up" rows={supplied} /> : null}
      {borrowed.length > 0 ? <Group label="Borrowed" tone="down" rows={borrowed} /> : null}
      {collateral.length > 0 ? <Group label="Collateral" rows={collateral} /> : null}
    </div>
  )
}

function Group({
  label,
  tone,
  rows,
}: {
  label: string
  tone?: "up" | "down"
  rows: Row[]
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mb-1">
        {label.toUpperCase()}
      </div>
      <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
        {rows.slice(0, 3).map((r) => (
          <div
            key={r.marketId ?? r.symbol}
            className="flex items-center justify-between gap-3 px-3 h-9"
          >
            <span className="font-mono text-[12px] font-medium text-foreground truncate">
              {r.symbol}
            </span>
            <span className="flex items-center gap-3 shrink-0">
              <span
                className={
                  "font-mono tabular-nums text-[11px] " +
                  (tone === "up"
                    ? "text-up"
                    : tone === "down"
                      ? "text-down"
                      : "text-muted-foreground")
                }
              >
                {r.apy != null ? formatApy(r.apy) : "—"}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-foreground">
                {r.usd != null ? formatPrice(r.usd) : "—"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
