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
 *
 * P2B polish: header rhythm aligned to P1B mono-caps (10px caps,
 * 0.1em tracking). Position card density tightened. No fetch /
 * polling / shape change. Existing data-* attributes preserved.
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
    return (
      <Empty
        title="No position"
        body="This wallet has no active position in this market."
        compact
      />
    )
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
      className="zeks-card min-w-0"
      data-market-user-section
    >
      <header
        className="flex items-baseline justify-between gap-2 border-b border-border"
        style={{ padding: "8px 14px", minHeight: "32px", marginBottom: "12px" }}
        data-market-user-section-header
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-sans uppercase"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Position
          </span>
          <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>
            ·
          </span>
          <span
            className="font-sans"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11.5px",
              color: "var(--muted-foreground)",
              fontWeight: 400,
              letterSpacing: 0,
            }}
          >
            Live · Morpho
          </span>
        </div>
        <span
          className="font-sans tabular-nums"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          {market.symbol} · {market.collateralAssetSymbol}
        </span>
      </header>

      <div style={{ padding: "0 14px" }}>
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "26px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            fontWeight: 500,
            color: "var(--foreground)",
          }}
        >
          {positionValueUsd != null ? formatPrice(positionValueUsd) : "—"}
        </span>
        <div
          className="mt-1 font-sans"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          Total position value
        </div>
      </div>

      {/* LTV / LIQ. LTV risk bar — derived from real borrowed + collateral */}
      {collateralUsd != null &&
      collateralUsd > 0 &&
      borrowedUsd != null &&
      position.lltv != null ? (
        <div
          style={{ padding: "14px 14px 0" }}
          data-position-risk-bar
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "11.5px",
                fontWeight: 500,
                color: "var(--muted-foreground)",
                letterSpacing: 0,
              }}
            >
              Current LTV
            </span>
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--foreground)",
                letterSpacing: "-0.01em",
              }}
            >
              {((borrowedUsd / collateralUsd) * 100).toFixed(2)}%
              <span style={{ color: "var(--muted-foreground)" }}>
                {" · "}
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "11.5px",
                  }}
                >
                  LLTV
                </span>{" "}
                {(position.lltv * 100).toFixed(2)}%
              </span>
            </span>
          </div>
          <div
            style={{
              position: "relative",
              height: "6px",
              borderRadius: "999px",
              backgroundColor: "var(--background)",
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "0",
                width: `${Math.min(
                  100,
                  (borrowedUsd / collateralUsd / position.lltv) * 100,
                )}%`,
                backgroundColor:
                  borrowedUsd / collateralUsd / position.lltv > 0.8
                    ? "var(--down-strong)"
                    : borrowedUsd / collateralUsd / position.lltv > 0.5
                      ? "var(--up-strong)"
                      : "var(--up)",
                transition: "width 200ms ease-out",
              }}
            />
          </div>
        </div>
      ) : null}

      <div
        className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4"
        style={{ padding: "0 14px" }}
      >
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

      <footer
        className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-x-4 gap-y-2"
        style={{ padding: "0 14px 12px" }}
      >
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
    <div
      className="border-l border-border pl-3"
    >
      <div
        className="font-sans uppercase"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className={
          "tabular-nums mt-1 " + toneClass
        }
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "18px",
          lineHeight: 1.1,
          fontWeight: 500,
          letterSpacing: "-0.015em",
        }}
      >
        {usd != null ? formatPrice(usd) : "—"}
      </div>
      <div
        className="font-sans tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          marginTop: "4px",
          fontWeight: 400,
          letterSpacing: 0,
        }}
      >
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
  const toneColor =
    tone === "down"
      ? "var(--down)"
      : tone === "up"
        ? "var(--up)"
        : "var(--foreground)"
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="font-sans"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          fontWeight: 400,
          letterSpacing: 0,
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums font-sans"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          color: toneColor,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Empty({
  title,
  body,
  children,
  compact,
}: {
  title: string
  body: string
  children?: React.ReactNode
  compact?: boolean
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-dashed border-border bg-secondary/30 min-w-0"
      style={{ padding: compact ? "12px 14px" : "20px" }}
      data-position-empty
      data-empty-compact={compact ? "true" : "false"}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          Position
        </span>
        <span
          className="tabular-nums font-sans"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            fontWeight: 500,
            color: "var(--foreground)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
      </div>
      <p
        className="mt-1"
        style={{
          fontSize: "12px",
          color: "var(--muted-foreground)",
          lineHeight: 1.5,
          fontFamily: "var(--font-sans)",
        }}
      >
        {body}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function LoadingCard() {
  return (
    <section className="zeks-card min-w-0">
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        POSITION
      </span>
      <div
        className="zeks-num-xl mt-2"
        style={{ color: "var(--foreground)", opacity: 0.4 }}
      >
        —
      </div>
      <div
        className="mt-3 zeks-eyebrow"
        style={{
          fontSize: "10.5px",
          letterSpacing: "0.04em",
          color: "var(--muted-foreground)",
          fontWeight: 400,
        }}
      >
        Reading onchain state…
      </div>
    </section>
  )
}

/**
 * Total position value (USD):
 *
 *   margin available -> marginUsd (Morpho Blue equity)
 *   otherwise       -> c + s - b (net position: collateral + supplied - borrowed)
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
