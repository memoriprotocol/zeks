"use client"

/**
 * FeaturedMarkets — compact 4-column grid of 8 curated tickers.
 *
 *   AAPL · TSLA · NVDA · MSFT · META · GOOGL · AMZN · SPCX
 *
 *   · Logo + symbol (serif) + company (mono)
 *   · Oracle price (28px serif, hidden when missing)
 *   · Compact metric strip: LLTV · Borrow · Liquidity
 *   · Subtle lime outline CTA, no SaaS button
 *
 *   Reads live data only. Fields with no underlying data hide.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import {
  formatPrice,
  formatApy,
  formatCompact,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface FeaturedMarketsProps {
  markets: LendingMarket[]
}

const PRIORITY: readonly string[] = [
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
  "META",
  "GOOGL",
  "AMZN",
  "SPCX",
]

const PRIORITY_INDEX = new Map<string, number>(
  PRIORITY.map((s, i) => [s, i] as const),
)

export function FeaturedMarkets({ markets }: FeaturedMarketsProps) {
  const priority = React.useMemo<LendingMarket[]>(() => {
    const bySymbol = new Map<string, LendingMarket>()
    for (const m of markets) bySymbol.set(m.symbol.toUpperCase(), m)
    return PRIORITY.map((sym) => bySymbol.get(sym))
      .filter((m): m is LendingMarket => Boolean(m))
      .sort(
        (a, b) =>
          (PRIORITY_INDEX.get(a.symbol.toUpperCase()) ?? 0) -
          (PRIORITY_INDEX.get(b.symbol.toUpperCase()) ?? 0),
      )
  }, [markets])

  return (
    <div data-testid="featured-markets" className="flex flex-col gap-3">
      {priority.length === 0 ? (
        <p className="zeks-eyebrow text-muted-foreground/70 px-0.5">
          None of the 8 curated tickers are currently live.
        </p>
      ) : (
        <ul
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: "var(--dash-card-gap)" }}
        >
          {priority.map((m) => (
            <li key={m.marketId ?? m.symbol}>
              <FeaturedCard market={m} />
            </li>
          ))}
        </ul>
      )}

      <p className="zeks-eyebrow text-muted-foreground/60 px-0.5">
        {priority.length} / {PRIORITY.length} curated live
      </p>
    </div>
  )
}

function FeaturedCard({ market: m }: { market: LendingMarket }) {
  const hasPrice = m.oraclePrice != null
  const hasLltv = m.lltv != null
  const hasBorrow = m.borrowApy != null
  const liquidity = m.availableLiquidity ?? m.totalSupply ?? null
  const hasLiq = liquidity != null

  return (
    <article
      className="rounded-[14px] border border-border flex flex-col h-full"
      style={{
        padding: "14px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="featured-card"
    >
      {/* Header — logo · symbol · company */}
      <header className="flex items-center gap-2.5">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          rhLogoUrl={m.rhLogoUrl ?? undefined}
          contractAddress={m.contractAddress ?? m.rhContractAddress ?? undefined}
          size={28}
        />
        <div className="min-w-0 flex-1">
          <div
            className="zeks-symbol-sm text-foreground truncate"
            style={{ fontSize: "16px", lineHeight: 1.1 }}
          >
            {m.symbol}
          </div>
          <div
            className="zeks-eyebrow text-muted-foreground/70 truncate"
            style={{ fontSize: "10.5px", marginTop: "3px" }}
          >
            {m.name ?? m.symbol}
          </div>
        </div>
      </header>

      {/* Oracle price (only when present) */}
      {hasPrice ? (
        <div className="mt-3">
          <div
            className="zeks-eyebrow text-muted-foreground/70 uppercase"
            style={{ fontSize: "9px" }}
          >
            Price
          </div>
          <div
            className="zeks-num-summary text-foreground"
            style={{ marginTop: "4px" }}
          >
            {formatPrice(m.oraclePrice as number)}
          </div>
        </div>
      ) : null}

      {/* Compact field strip */}
      <dl
        className="mt-3 grid grid-cols-3"
        style={{ columnGap: "8px" }}
      >
        {hasLltv ? (
          <Field
            label="LLTV"
            value={`${((m.lltv as number) * 100).toFixed(1)}%`}
          />
        ) : (
          <Field label="LLTV" value="—" muted />
        )}
        {hasBorrow ? (
          <Field
            label="Borrow"
            value={formatApy(m.borrowApy as number)}
            tone="down"
          />
        ) : (
          <Field label="Borrow" value="—" muted />
        )}
        {hasLiq ? (
          <Field
            label="Liq"
            value={formatCompact(liquidity as number)}
          />
        ) : (
          <Field label="Liq" value="—" muted />
        )}
      </dl>

      {/* CTA — compact, subtle lime */}
      <div className="mt-auto pt-3">
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          className="inline-flex items-center justify-center rounded-[8px] border border-primary/40 bg-primary/15 text-foreground h-7 px-3 text-[11.5px] font-medium hover:bg-primary/25 transition-colors"
        >
          Explore
        </Link>
      </div>
    </article>
  )
}

function Field({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: string
  tone?: "up" | "down"
  muted?: boolean
}) {
  const cls =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : muted
          ? "text-muted-foreground"
          : "text-foreground"
  return (
    <div>
      <dt
        className="zeks-eyebrow text-muted-foreground/70 uppercase"
        style={{ fontSize: "9px" }}
      >
        {label}
      </dt>
      <dd
        className={[
          "tabular-nums font-sans",
          cls,
        ].join(" ")}
        style={{ fontSize: "12px", marginTop: "3px" }}
      >
        {value}
      </dd>
    </div>
  )
}
