"use client"

/**
 * PortfolioPositions (v4)
 *
 * Unified position card on the Portfolio page.
 *
 *   - Wallet balances (top group)
 *   - Supplied / Borrowed / Collateral (Morpho)
 *   - Empty state is compact and intentional — no giant blank card.
 *
 * Densely formatted for finance app feel.
 * No transaction buttons, no supply/borrow enablement.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PortfolioSnapshot } from "@/lib/markets/portfolio"
import { formatRawAmount } from "@/lib/markets/format-display"
import { formatPrice, formatApy } from "@/lib/markets/format"
import { PortfolioPositionLink } from "./portfolio-position-link"

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
          <span className="zeks-eyebrow text-muted-foreground/80">
            Positions
          </span>
          <span className="zeks-eyebrow text-muted-foreground/70">
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
                    type: null,
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
                    type: null,
                    apy: s.supplyApy,
                    usd: s.balanceUsd,
                    kind: "supplied" as const,
                    marketSymbol: s.collateralSymbol ?? null,
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
                    type: "debt",
                    apy: b.borrowApy,
                    usd: b.balanceUsd,
                    kind: "borrowed" as const,
                    marketSymbol: b.collateralSymbol ?? null,
                  }))}
                />
              ) : null}
              {collateral.length > 0 ? (
                <Group
                  label="Collateral"
                  rows={collateral.map((c) => ({
                    key: c.marketId ?? c.symbol,
                    symbol: c.symbol,
                    type: "collateral",
                    apy: null,
                    usd: c.balanceUsd,
                    kind: "collateral" as const,
                    marketSymbol: c.collateralSymbol ?? null,
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
        <span className="zeks-eyebrow text-muted-foreground/80">
          Positions
        </span>
        <span className="zeks-eyebrow text-muted-foreground/70">
          Wallet · Morpho
        </span>
      </header>
      <div className="p-5 md:p-6">
        <p className="zeks-secondary">
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
      <p className="zeks-section-title text-[15px] text-foreground leading-snug">
        No active positions
      </p>
      <p className="mt-1 zeks-secondary leading-relaxed">
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
    type: string | null
    apy: number | null
    usd: number | null
    raw?: bigint
    kind?: "supplied" | "borrowed" | "collateral"
    marketSymbol?: string | null
  }>
}) {
  return (
    <div>
      <div className="zeks-eyebrow text-muted-foreground/70 mb-1.5">
        {label}
      </div>
      <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,90px)_minmax(0,auto)] items-center gap-3 px-3 h-11"
          >
            <span className="font-sans text-[12.5px] font-semibold text-foreground truncate">
              {r.symbol}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              {r.type ? (
                <span
                  className={
                    "zeks-eyebrow " +
                    (r.type === "debt" ? "text-down" : "text-muted-foreground")
                  }
                >
                  {r.type}
                </span>
              ) : null}
              <span
                className={
                  "tabular-nums font-sans text-[11.5px] " +
                  (tone === "up"
                    ? "text-up"
                    : tone === "down"
                      ? "text-down"
                      : "text-muted-foreground")
                }
              >
                {r.apy != null
                  ? formatApy(r.apy)
                  : r.raw != null
                    ? formatRawAmount(r.raw, 18)
                    : "—"}
              </span>
            </div>
            <span className="tabular-nums font-sans text-[11.5px] text-foreground text-right">
              {r.usd != null ? formatPrice(r.usd) : "—"}
            </span>
            <span className="zeks-meta text-muted-foreground text-right whitespace-nowrap">
              {r.kind ? (
                <PortfolioPositionLink
                  kind={r.kind}
                  symbol={r.symbol}
                  marketSymbol={r.marketSymbol ?? null}
                  short
                />
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
