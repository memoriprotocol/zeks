"use client"

/**
 * MarketUserSection
 *
 * Live, per-market user position block on the market-detail page.
 *
 *   - Disconnected / wrong-network → compact CTA card
 *   - Empty (no position) → "No position in this market"
 *   - Live → 4 mini-metrics (Supplied / Borrowed / Collateral / Position value)
 *            + APY context, all in a single dense hero card.
 *
 * Sourced from the per-market Morpho position query (per-wallet),
 * NEUTRAL of the user's interaction with this page beyond the
 * explicit wallet connect.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { formatPrice, formatApy } from "@/lib/markets/format"
import { formatUnits } from "@/lib/markets/onchain/format-units"
import { useMarketUserPosition } from "@/components/markets/use-market-user-position"
import type { LendingMarket } from "@/lib/markets/lending"
import type { RawMorphoUserPosition } from "@/lib/markets/morpho/user-positions"

interface MarketUserSectionProps {
  market: LendingMarket
}

export default function MarketUserSection({ market }: MarketUserSectionProps) {
  const wallet = useWallet()
  const { state } = useMarketUserPosition(market.marketId)

  // Disconnected or initializing
  if (
    state.kind === "idle" ||
    state.kind === "no-wallet" ||
    wallet.status === "initializing" ||
    wallet.status === "idle" ||
    wallet.status === "available" ||
    wallet.status === "disconnected"
  ) {
    return <Empty title="No position in this market" body="Connect your wallet to read your position.">
      <WalletButton />
    </Empty>
  }

  if (state.kind === "wrong-network") {
    return (
      <Empty
        title="Switch to Robinhood Chain"
        body={`Wrong network · chain ${state.chainId ?? "—"}`}
      >
        <WalletButton />
      </Empty>
    )
  }

  if (state.kind === "loading") {
    return <LoadingCard />
  }

  if (state.kind === "unavailable") {
    return (
      <Empty
        title="Live data unavailable"
        body={state.reason}
      />
    )
  }

  if (state.kind === "empty") {
    return <Empty title="No position in this market" body="This wallet does not supply, borrow or post collateral in this Morpho market." />
  }

  // kind === "live"
  return <PositionCard market={market} position={state.position} />
}

/* ────────────────────────────────────────────────────────────────── */

function PositionCard({
  market,
  position,
}: {
  market: LendingMarket
  position: RawMorphoUserPosition
}) {
  const suppliedUsd = position.supplyAssetsUsd ?? null
  const borrowedUsd = position.borrowAssetsUsd ?? null
  const collateralUsd = position.collateralUsd ?? null
  const marginUsd = position.marginUsd ?? null
  const borrowPnlUsd = position.borrowPnlUsd ?? null

  // Total position value = collateral (assets locked) + supplied (assets lent out) − borrowed (debt)
  // When None of those are present on this market, fall back to supplied only.
  const hasCollateral = (position.collateralRaw ?? BigInt(0)) > BigInt(0)
  const hasSupplied = (position.supplyAssetsRaw ?? BigInt(0)) > BigInt(0)
  const hasBorrowed = (position.borrowAssetsRaw ?? BigInt(0)) > BigInt(0)

  const positionValueUsd = computePositionValue(
    suppliedUsd,
    borrowedUsd,
    collateralUsd,
    marginUsd,
  )

  return (
    <section
      aria-label="Your position in this market"
      className="rounded-2xl border border-border bg-card p-5 md:p-6 min-w-0"
      data-market-user-section
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          POSITION
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
          Live · Morpho
        </span>
      </header>

      <div className="mt-2">
        <span className="zeks-num-xl text-foreground">
          {positionValueUsd != null ? formatPrice(positionValueUsd) : "—"}
        </span>
        <span className="ml-2 font-mono text-[10px] tracking-wider text-muted-foreground/70">
          {market.symbol} · {market.collateralAssetSymbol}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4">
        <Leg
          label="Supplied"
          amount={formatUnits(position.supplyAssetsRaw, 18)}
          usd={suppliedUsd}
          apy={position.marketSupplyApy}
          active={hasSupplied}
        />
        <Leg
          label="Borrowed"
          amount={formatUnits(position.borrowAssetsRaw, 18)}
          usd={borrowedUsd}
          apy={position.marketBorrowApy}
          active={hasBorrowed}
          tone="down"
        />
        <Leg
          label="Collateral"
          amount={formatUnits(position.collateralRaw, 18)}
          usd={collateralUsd}
          apy={null}
          active={hasCollateral}
        />
      </div>

      <footer className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {marginUsd != null ? (
          <Row label="Margin" value={formatPrice(marginUsd)} />
        ) : null}
        {borrowPnlUsd != null ? (
          <Row
            label="Borrow PnL"
            value={formatPrice(borrowPnlUsd)}
            tone={borrowPnlUsd >= 0 ? "up" : "down"}
          />
        ) : null}
        {position.lltv != null ? (
          <Row label="LLTV" value={`${(position.lltv * 100).toFixed(2)}%`} />
        ) : null}
        {position.marketUtilization != null ? (
          <Row
            label="Utilization"
            value={formatApy(position.marketUtilization)}
          />
        ) : null}
      </footer>
    </section>
  )
}

function Leg({
  label,
  amount,
  usd,
  apy,
  active,
  tone,
}: {
  label: string
  amount: string | null
  usd: number | null
  apy: number | null
  active: boolean
  tone?: "up" | "down"
}) {
  const toneClass =
    tone === "down"
      ? active
        ? "text-down"
        : "text-foreground/40"
      : active
        ? "text-up"
        : "text-foreground/40"
  return (
    <div className="border-l border-border pl-3">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[18px] md:text-[20px] mt-1 " + toneClass
        }
      >
        {usd != null ? formatPrice(usd) : "—"}
      </div>
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mt-1">
        {amount ?? "0"}{apy != null ? ` · ${formatApy(apy)}` : ""}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  const toneClass =
    tone === "down"
      ? "text-down"
      : tone === "up"
        ? "text-up"
        : "text-foreground"
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className={"tabular-nums " + toneClass}>{value}</span>
    </div>
  )
}

function Empty({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-dashed border-border bg-secondary/30 p-5 min-w-0"
      data-position-empty
    >
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
        POSITION
      </span>
      <p className="font-serif text-[18px] mt-1.5 text-foreground leading-snug">
        {title}
      </p>
      <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
        {body}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6 min-w-0">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
        POSITION
      </span>
      <div className="zeks-num-xl mt-2 text-foreground/40">—</div>
      <div className="mt-3 font-mono text-[10px] tracking-wider text-muted-foreground/70">
        Reading onchain state…
      </div>
    </section>
  )
}

/**
 * Total position value (USD):
 *
 *   collateral + supplied − borrowed   (when collateral > 0)
 *   supplied − borrowed                (when only debt and supply)
 *   supplied                          (when only supply)
 *   borrowed (or collateral only)     (otherwise, the largest of the three)
 *
 * Returns null when no USD values are available.
 */
function computePositionValue(
  suppliedUsd: number | null,
  borrowedUsd: number | null,
  collateralUsd: number | null,
  marginUsd: number | null,
): number | null {
  const s = suppliedUsd ?? 0
  const b = borrowedUsd ?? 0
  const c = collateralUsd ?? 0
  const m = marginUsd ?? 0
  // If margin available (a.k.a. equity in Morpho Blue markets) use it.
  if (marginUsd != null) return Math.max(0, marginUsd)
  // Otherwise approximate net position value.
  const v = c + s - b
  if (suppliedUsd == null && borrowedUsd == null && collateralUsd == null) {
    return null
  }
  return Number.isFinite(v) ? v : null
}
