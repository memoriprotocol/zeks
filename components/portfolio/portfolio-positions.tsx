"use client"

/**
 * PortfolioPositions (v3)
 *
 * Compact positioned positions card on the Portfolio page.
 *
 *   - Live → three vertical groups: Wallet token balances · Supplied · Borrowed.
 *   - Empty → compact 1-line state, not a giant card.
 *
 * Densely formatted for finance app feel.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"
import { formatRawAmount } from "@/lib/markets/format-display"
import { formatPrice, formatApy } from "@/lib/markets/format"

interface PortfolioPositionsProps {
  dataUnavailable: boolean
  snapshot?: PortfolioSnapshot | null
  loading?: boolean
}

export default function PortfolioPositions({
  dataUnavailable,
  snapshot,
}: PortfolioPositionsProps) {
  if (snapshot) {
    const wallet = snapshot.walletBalances.slice(0, 6)
    const supplied = snapshot.supplied
    const borrowed = snapshot.borrowed
    const collateral = snapshot.collateral

    const allEmpty =
      wallet.length === 0 &&
      supplied.length === 0 &&
      borrowed.length === 0 &&
      collateral.length === 0

    return (
      <section
        aria-label="Positions"
        data-testid="portfolio-positions"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <header className="px-5 md:px-6 py-3 border-b border-border flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            POSITIONS
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
            Wallet · Morpho
          </span>
        </header>

        <div className="p-5 md:p-6 space-y-5">
          {allEmpty ? (
            <EmptyBlock />
          ) : (
            <>
              {wallet.length > 0 ? (
                <Group
                  label="Wallet"
                  rows={wallet.map((w) => ({
                    key: w.contractAddress ?? w.symbol,
                    symbol: w.symbol,
                    apy: null,
                    usd: w.balanceUsd,
                    raw: w.balanceRaw,
                  }))}
                />
              ) : null}
              {supplied.length > 0 ? (
                <Group
                  label="Supplied"
                  tone="up"
                  rows={supplied.map((s) => ({
                    key: s.marketId ?? s.symbol,
                    symbol: s.symbol,
                    apy: s.supplyApy,
                    usd: s.balanceUsd,
                  }))}
                />
              ) : null}
              {borrowed.length > 0 ? (
                <Group
                  label="Borrowed"
                  tone="down"
                  rows={borrowed.map((b) => ({
                    key: b.marketId ?? b.symbol,
                    symbol: b.symbol,
                    apy: b.borrowApy,
                    usd: b.balanceUsd,
                  }))}
                />
              ) : null}
              {collateral.length > 0 ? (
                <Group
                  label="Collateral"
                  rows={collateral.map((c) => ({
                    key: c.marketId ?? c.symbol,
                    symbol: c.symbol,
                    apy: null,
                    usd: c.balanceUsd,
                  }))}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="Positions"
      data-testid="portfolio-positions"
      className="rounded-2xl border border-border bg-card"
    >
      <header className="px-5 md:px-6 py-3 border-b border-border flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          POSITIONS
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
          Wallet · Morpho
        </span>
      </header>
      <div className="p-5 md:p-6">
        <p className="text-[12px] font-mono text-muted-foreground">
          {dataUnavailable
            ? "Connect your wallet to see your positions."
            : "Loading…"}
        </p>
      </div>
    </section>
  )
}

function EmptyBlock() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5">
      <p className="font-serif text-[16px] text-foreground leading-snug">
        No active positions
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
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

function Group({
  label,
  tone,
  rows,
}: {
  label: string
  tone?: "up" | "down"
  rows: Array<{
    key: string
    symbol: string
    apy: number | null
    usd: number | null
    raw?: bigint
  }>
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mb-1.5">
        {label.toUpperCase()}
      </div>
      <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,80px)] items-center gap-3 px-3 h-10"
          >
            <span className="font-mono text-[12.5px] font-medium text-foreground truncate">
              {r.symbol}
            </span>
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
              {r.apy != null ? formatApy(r.apy) : r.raw != null ? formatRawAmount(r.raw, 18) : "—"}
            </span>
            <span className="font-mono tabular-nums text-[11px] text-foreground tabular-nums text-right">
              {r.usd != null ? formatPrice(r.usd) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
