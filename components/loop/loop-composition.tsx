"use client"

/**
 * LoopComposition — ZEKS Loop product page (final rebuild).
 *
 * Reads from the existing `useLoopMarkets` hook. No new data sources.
 * Layout follows the locked ZEKS design system (Dashboard reference):
 *
 *   · 64px sidebar shell, max-w-6xl content, 28px desktop padding
 *   · Section gap 32–40px, card gap 16px, card radius 16px, pad 20px
 *   · Warm off-white (--card-soft) surface, thin borders, no giant
 *     lime full-width buttons.
 *
 * Page order (single visual column):
 *
 *   1. Loop intro          — compact header (title + supporting copy + status)
 *   2. Stock collateral    — 3-column card grid (one card per curated stock)
 *   3. Yield venues        — 3 equal cards (one per verified vault)
 *   4. Loop economics      — 2-column (carry panel + route visualization)
 *
 * No data is fabricated. Missing values render as "—". AMZN's real
 * limitation (no Morpho market on Robinhood Chain) is rendered
 * honestly. SPCX's missing Chainlink feed renders "—" for oracle.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import { PageTitle, SectionTitle } from "@/components/zeks/page-title"
import { useLoopMarkets } from "@/components/loop/use-loop-markets"
import { useNetworkStatus } from "@/components/zeks/use-network-status"
// F13 — wallet wiring (H1/H2 unchanged). Used only to render the
// wallet chip + switch-network CTA in the page chrome; F13 never
// touches H1/H2 internals.
import { useWallet } from "@/components/app/wallet/use-wallet"
// F13 — read-only F12 hook that polls the locked
// /api/markets/lending/earn endpoint. The Loop page reuses it
// unchanged so the F12 lifecycle / transaction-eligibility fields
// are available alongside the slim LoopMarket projection.
import { useEarnLendingMarkets } from "@/components/earn/use-lending-markets"
// F13 — display-only chip from the locked F12 chip registry.
import { LifecycleChip, lifecycleOf } from "@/components/earn/lifecycle-chip"
// F13 — minimal amount inputs (pure presentational).
import {
  LoopAmountInputs,
  type LoopAmountInputsValues,
} from "@/components/loop/loop-amount-inputs"
// F13 — Loop transaction panel (composes the locked writers).
import { LoopTransactionPanel } from "@/components/loop/loop-transaction-panel"
// F13 — pure mapper from LoopMarket / YieldVenue to the full
// LendingMarket shape the locked writers consume.
import {
  adaptLoopMarketToLendingMarket,
  adaptYieldVenueToLendingMarket,
} from "@/lib/markets/loop/adapter"
import {
  CURATED_STOCKS,
  LOOP_ESTIMATED_FEES_PERCENT,
  STOCK_TOKEN_CAPITAL_LABEL,
} from "@/lib/markets/loop/constants"
import {
  computeNetCarry,
  assessLoopRisk,
  type NetCarry,
  type LoopRiskStatus,
  type LoopMarket,
  type YieldVenue,
} from "@/lib/markets/loop/types"
import {
  formatPrice,
  formatApy,
  formatCompact,
  relativeUpdated,
} from "@/lib/markets/format"

const STOCK_PRIORITY = new Map<string, number>(
  CURATED_STOCKS.map((s, i) => [s, i] as const),
)

export default function LoopComposition() {
  const { markets, yieldVenues, loading, error, fetchedAt } = useLoopMarkets()
  const network = useNetworkStatus()
  // F13 — wallet hook (H1/H2 unchanged). Read-only use here:
  // surface wallet status in the page chrome and (in future)
  // gate the panel. F13 does NOT mutate the wallet state.
  const wallet = useWallet()
  // F13 — locked F12 hook that fetches the full LendingMarket[]
  // (with F12 lifecycle + transactionEligible fields). Polled in
  // parallel with useLoopMarkets; both endpoints share no state.
  const { markets: lendingMarkets } = useEarnLendingMarkets()

  const [selectedSymbol, setSelectedSymbol] = React.useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = React.useState<string | null>(null)
  // F13 — typed amounts and panel-open state. The panel is closed
  // by default; the StockCard's "Open Loop" CTA opens it.
  const [amounts, setAmounts] = React.useState<LoopAmountInputsValues>({
    collateralAmount: "",
    loanAmount: "",
  })
  const [panelOpen, setPanelOpen] = React.useState(false)

  // Sort markets: curated priority first, then alphabetical
  const sortedMarkets = React.useMemo(() => {
    return markets.slice().sort((a, b) => {
      const sa = a.symbol.toUpperCase()
      const sb = b.symbol.toUpperCase()
      const ia = STOCK_PRIORITY.get(sa)
      const ib = STOCK_PRIORITY.get(sb)
      if (ia != null && ib != null) return ia - ib
      if (ia != null) return -1
      if (ib != null) return 1
      return sa.localeCompare(sb)
    })
  }, [markets])

  // Default selection — first live curated market (real Morpho preferred),
  // then first unlisted, then first row.
  React.useEffect(() => {
    if (selectedSymbol || sortedMarkets.length === 0) return
    const live =
      sortedMarkets.find((m) => m.sourceMode === "real-morpho") ??
      sortedMarkets.find((m) => m.sourceMode === "real-morpho-unlisted") ??
      sortedMarkets[0]
    if (live) setSelectedSymbol(live.symbol)
  }, [sortedMarkets, selectedSymbol])

  React.useEffect(() => {
    if (selectedVenueId || yieldVenues.length === 0) return
    const live =
      yieldVenues.find((v) => v.status === "live") ??
      yieldVenues.find((v) => v.status === "candidate") ??
      yieldVenues[0]
    if (live) setSelectedVenueId(live.id)
  }, [yieldVenues, selectedVenueId])

  const selectedMarket =
    sortedMarkets.find((m) => m.symbol === selectedSymbol) ?? null
  const selectedVenue =
    yieldVenues.find((v) => v.id === selectedVenueId) ?? null

  const liveVenueCount = yieldVenues.filter((v) => v.status === "live").length
  const liveMarketCount = markets.filter(
    (m) =>
      m.sourceMode === "real-morpho" || m.sourceMode === "real-morpho-unlisted",
  ).length

  return (
    <div
      className="zeks-page"
      data-loop-composition
    >
      {/* 1 · Loop intro */}
      <LoopIntro
        marketCount={markets.length}
        liveMarketCount={liveMarketCount}
        liveVenueCount={liveVenueCount}
        totalVenues={yieldVenues.length}
        network={network}
        fetchedAt={fetchedAt}
      />

      {/* 2 · Stock collateral */}
      <section className="flex flex-col">
        <SectionTitle
          trailing={
            loading && markets.length === 0
              ? "Loading…"
              : error
                ? "Live data unavailable"
                : fetchedAt
                  ? `Updated ${relativeUpdated(fetchedAt)}`
                  : "—"
          }
        >
          Stock Collateral
        </SectionTitle>
        {loading && sortedMarkets.length === 0 ? (
          <PanelEmpty text="Loading markets…" />
        ) : sortedMarkets.length === 0 ? (
          <PanelEmpty text="No stock markets available." />
        ) : (
          <ul
            className="grid"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--dash-card-gap)",
            }}
          >
            {sortedMarkets.map((m) => (
              <li key={m.marketId ?? m.symbol} className="h-full">
                <StockCard
                  market={m}
                  active={selectedSymbol === m.symbol}
                  onSelect={setSelectedSymbol}
                  selectedVenue={selectedVenue}
                  collateralMarketAdapter={adaptLoopMarketToLendingMarket(m, lendingMarkets)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 · Yield venues */}
      <section className="flex flex-col">
        <SectionTitle trailing={`${liveVenueCount} live · ${yieldVenues.length} total`}>
          Yield Venues
        </SectionTitle>
        {yieldVenues.length === 0 ? (
          <PanelEmpty text="Loading venues…" />
        ) : (
          <ul
            className="grid"
            style={{
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "var(--dash-card-gap)",
            }}
          >
            {yieldVenues.map((v) => (
              <li key={v.id} className="h-full">
                <VenueCard
                  venue={v}
                  active={selectedVenueId === v.id}
                  onSelect={setSelectedVenueId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4 · Loop economics */}
      <section className="flex flex-col">
        <SectionTitle>Loop Economics</SectionTitle>
        <LoopEconomics
          market={selectedMarket}
          venue={selectedVenue}
          collateralMarketAdapter={
            selectedMarket
              ? adaptLoopMarketToLendingMarket(selectedMarket, lendingMarkets)
              : null
          }
          venueAdapter={
            selectedVenue ? adaptYieldVenueToLendingMarket(selectedVenue) : null
          }
          amounts={amounts}
          onAmountsChange={setAmounts}
          panelOpen={panelOpen}
          onOpenLoop={() => setPanelOpen(true)}
          walletStatus={wallet.status}
          walletChainId={wallet.chainId ?? null}
          onSwitchNetwork={async () => {
            try {
              await wallet.switchToRobinhoodChain()
            } catch {
              /* user rejection — silently absorbed; the next
                 render of the wallet hook will reflect the new
                 chainId if the switch succeeded. */
            }
          }}
        />
      </section>

      {/* F13 — Loop transaction panel (renders below the page
          when open). Reads from the same `selectedMarket` /
          `selectedVenue` state the rest of the page already
          maintains. */}
      {panelOpen && selectedMarket && selectedVenue ? (
        <section className="flex flex-col">
          <SectionTitle>Open Loop</SectionTitle>
          <LoopTransactionPanel
            collateralMarket={
              adaptLoopMarketToLendingMarket(selectedMarket, lendingMarkets).row
            }
            venueMarket={adaptYieldVenueToLendingMarket(selectedVenue).row}
            collateralAmount={amounts.collateralAmount}
            loanAmount={amounts.loanAmount}
            collateralSymbol={selectedMarket.symbol.toUpperCase()}
            loanSymbol={selectedVenue.asset ?? selectedVenue.id.toUpperCase()}
            onClose={() => setPanelOpen(false)}
          />
        </section>
      ) : null}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * 1 · Loop intro
 * ═══════════════════════════════════════════════════════════════════ */

function LoopIntro({
  marketCount,
  liveMarketCount,
  liveVenueCount,
  totalVenues,
  network,
  fetchedAt,
}: {
  marketCount: number
  liveMarketCount: number
  liveVenueCount: number
  totalVenues: number
  network: ReturnType<typeof useNetworkStatus>
  fetchedAt: string | null
}) {
  return (
    <header
      className="flex items-end justify-between gap-6 flex-wrap"
      style={{ marginBottom: "var(--dash-heading-gap)" }}
      data-loop-intro
    >
      {/* Left — title + supporting copy */}
      <div className="min-w-0 max-w-[640px]">
        <PageTitle>Loop</PageTitle>
        <p
          className="mt-2"
          style={{
            fontSize: "var(--font-body)",
            color: "var(--muted-foreground)",
            lineHeight: 1.55,
          }}
        >
          Deposit tokenized stock as collateral. Borrow stablecoin. Route
          capital into a yield venue. Net carry = venue yield − borrow
          rate − costs.
        </p>
        <p
          className="font-sans mt-2"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
          }}
        >
          Read-only · Robinhood Chain · Morpho Blue
        </p>
      </div>

      {/* Right — compact status */}
      <ul
        className="zeks-surface-padded flex items-center gap-5 flex-wrap"
        style={{
          padding: "10px 14px",
        }}
      >
        <IntroStat
          label="Curated"
          value={`${marketCount}/8`}
          tone={marketCount === 8 ? "up" : "muted"}
        />
        <IntroStat
          label="Live markets"
          value={String(liveMarketCount)}
          tone={liveMarketCount > 0 ? "up" : "muted"}
        />
        <IntroStat
          label="Live venues"
          value={`${liveVenueCount}/${totalVenues}`}
          tone={liveVenueCount > 0 ? "up" : "muted"}
        />
        <IntroDivider />
        <IntroStatus
          label="Morpho"
          state={network.morphoApi}
        />
        <IntroStatus
          label="RH RPC"
          state={network.robinhoodRpc}
        />
        <IntroStatus
          label="Chainlink"
          state={network.chainlink === "ready" ? "live" : "unknown"}
        />
      </ul>
    </header>
  )
}

function IntroStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "up" | "muted"
}) {
  return (
    <li className="flex flex-col gap-1">
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color:
            tone === "up" ? "var(--foreground)" : "var(--muted-foreground)",
        }}
      >
        {value}
      </span>
    </li>
  )
}

function IntroDivider() {
  return (
    <li
      aria-hidden="true"
      style={{
        width: "1px",
        height: "24px",
        backgroundColor: "var(--border)",
      }}
    />
  )
}

function IntroStatus({
  label,
  state,
}: {
  label: string
  state: "live" | "unreachable" | "unknown"
}) {
  const color =
    state === "live"
      ? "var(--up)"
      : state === "unreachable"
        ? "var(--down)"
        : "var(--muted-foreground)"
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{
          width: "6px",
          height: "6px",
          backgroundColor: color,
        }}
      />
      <span
        className="font-sans"
        style={{
          fontSize: "11px",
          color: "var(--foreground)",
        }}
      >
        {label}
      </span>
    </li>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * 2 · Stock collateral card
 * ═══════════════════════════════════════════════════════════════════ */

function StockCard({
  market: m,
  active,
  onSelect,
  selectedVenue,
  collateralMarketAdapter,
}: {
  market: LoopMarket
  active: boolean
  onSelect: (s: string) => void
  selectedVenue: YieldVenue | null
  collateralMarketAdapter: ReturnType<
    typeof adaptLoopMarketToLendingMarket
  >
}) {
  // Compute live carry if both sides have data.
  const liveCarry: NetCarry | null = React.useMemo(() => {
    if (!selectedVenue) return null
    const venueApy = selectedVenue.apy
    const borrowApy = m.borrowApy
    if (venueApy == null || borrowApy == null) return null
    return {
      venueApy,
      borrowApy,
      gross: venueApy - borrowApy,
      fees: LOOP_ESTIMATED_FEES_PERCENT,
      feesUnknown: false,
      incomplete: false,
      net: venueApy - borrowApy - LOOP_ESTIMATED_FEES_PERCENT,
      profitable: venueApy - borrowApy - LOOP_ESTIMATED_FEES_PERCENT > 0,
    }
  }, [selectedVenue, m.borrowApy])

  const isMock = m.sourceMode === "mock"
  const isUnlisted = m.sourceMode === "real-morpho-unlisted"

  return (
    <article
      aria-label={`${m.name ?? m.symbol} market`}
      className="flex flex-col h-full"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: active ? "var(--accent)" : "var(--card-soft)",
        border: `1px solid ${active ? "var(--foreground)" : "var(--border)"}`,
        minHeight: "var(--dash-card-min-h)",
        transition: "background-color 160ms ease, border-color 160ms ease",
        cursor: "pointer",
      }}
      onClick={() => onSelect(m.symbol)}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--background)"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active
          ? "var(--accent)"
          : "var(--card-soft)"
      }}
      data-loop-stock-card
    >
      {/* 1 · Header — logo · symbol · company · status */}
      <header className="flex items-center gap-3">
        <AssetLogo
          symbol={m.symbol}
          name={m.name ?? m.symbol}
          src={m.logoUrl ?? undefined}
          size={40}
          shape="rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--font-card-symbol)",
                color: "var(--foreground)",
                fontWeight: 500,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
              }}
            >
              {m.symbol}
            </span>
            <SourceChip mode={m.sourceMode} />
            {/* F13 — surface the F12 lifecycle / eligibility verdict
                on every stock card. Pure display; no transactions.
                Reads the `lifecycle` field from the same
                LendingMarket row the adapter already produced. */}
            <LifecycleChip
              lifecycle={lifecycleOf(collateralMarketAdapter.row)}
              compact
            />
          </div>
          <div
            className="font-sans truncate"
            style={{
              fontSize: "var(--font-card-company)",
              color: "var(--muted-foreground)",
              marginTop: "4px",
              letterSpacing: "0.02em",
            }}
          >
            {cleanCompany(m.name) ?? m.symbol}
          </div>
        </div>
      </header>

      {/* 2 · Oracle price */}
      <div
        style={{
          paddingTop: "14px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          {m.oraclePrice != null ? "Chainlink Oracle" : "Chainlink Oracle"}
        </div>
        <div
          className="zeks-num-price"
          style={{
            color:
              m.oraclePrice != null ? "var(--foreground)" : "var(--muted-foreground)",
            marginTop: "2px",
            opacity: m.oraclePrice != null ? 1 : 0.55,
          }}
        >
          {m.oraclePrice != null ? formatPrice(m.oraclePrice) : "—"}
        </div>
        <div
          className="font-sans"
          style={{
            fontSize: "10px",
            color: "var(--muted-foreground)",
            marginTop: "4px",
            letterSpacing: "0.02em",
          }}
        >
          {m.oraclePrice != null
            ? "Robinhood Chain · live"
            : "No Chainlink feed deployed"}
        </div>
      </div>

      {/* 3 · Risk / market block */}
      <dl
        className="grid grid-cols-3"
        style={{
          columnGap: "8px",
          paddingTop: "12px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <StatField
          label="LLTV"
          value={m.lltv != null ? `${(m.lltv * 100).toFixed(1)}%` : "—"}
        />
        <StatField
          label="Borrow APY"
          value={m.borrowApy != null ? formatApy(m.borrowApy) : "—"}
          tone={m.borrowApy != null ? "down" : undefined}
        />
        <StatField
          label={m.supplyApy != null ? "Supply APY" : "Supply APY"}
          value={m.supplyApy != null ? formatApy(m.supplyApy) : "—"}
          tone={m.supplyApy != null ? "up" : undefined}
          muted={m.supplyApy == null && isMock}
        />
      </dl>

      {/* 4 · Liquidity + capital */}
      <dl
        className="grid grid-cols-2"
        style={{
          columnGap: "8px",
          paddingTop: "12px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <StatField
          label="Liquidity"
          value={
            m.availableLiquidityUsd != null
              ? formatCompact(m.availableLiquidityUsd)
              : m.totalSupplyUsd != null
                ? formatCompact(m.totalSupplyUsd)
                : "—"
          }
        />
        <StatField
          label={STOCK_TOKEN_CAPITAL_LABEL}
          value={
            m.rhMultiplier != null
              ? `×${m.rhMultiplier.toFixed(4)}`
              : "—"
          }
        />
      </dl>

      {/* 5 · Strategy block */}
      <div
        style={{
          paddingTop: "12px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          Strategy
        </div>
        {isMock ? (
          <p
            className="font-sans"
            style={{
              fontSize: "11.5px",
              color: "var(--muted-foreground)",
              marginTop: "4px",
              lineHeight: 1.5,
            }}
          >
            No Morpho market for this collateral on Robinhood Chain.
            Carry and venue routing unavailable.
          </p>
        ) : !selectedVenue ? (
          <p
            className="font-sans"
            style={{
              fontSize: "11.5px",
              color: "var(--muted-foreground)",
              marginTop: "4px",
              lineHeight: 1.5,
            }}
          >
            Select a yield venue below to preview carry.
          </p>
        ) : (
          <div
            className="flex items-baseline justify-between gap-2"
            style={{ marginTop: "4px" }}
          >
            <span
              className="font-sans"
              style={{
                fontSize: "11.5px",
                color: "var(--foreground)",
              }}
            >
              {selectedVenue.name}
            </span>
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12.5px",
                color:
                  liveCarry?.net != null
                    ? liveCarry.profitable
                      ? "var(--up)"
                      : "var(--down)"
                    : "var(--muted-foreground)",
              }}
            >
              {liveCarry?.net != null
                ? `${liveCarry.profitable ? "+" : ""}${formatApy(liveCarry.net)}`
                : "—"}
            </span>
          </div>
        )}
        {liveCarry?.gross != null && !isMock ? (
          <div
            className="font-sans"
            style={{
              fontSize: "10px",
              color: "var(--muted-foreground)",
              marginTop: "2px",
              letterSpacing: "0.02em",
            }}
          >
            gross {liveCarry.gross >= 0 ? "+" : ""}
            {liveCarry.gross.toFixed(2)}% · fees {LOOP_ESTIMATED_FEES_PERCENT.toFixed(2)}%
          </div>
        ) : null}
        {isUnlisted ? (
          <div
            className="font-sans"
            style={{
              fontSize: "10px",
              color: "var(--muted-foreground)",
              marginTop: "2px",
              letterSpacing: "0.02em",
            }}
          >
            Morpho · Unlisted
          </div>
        ) : null}
      </div>

      {/* 6 · Footer — compact primary Configure → + quiet secondary View market →
          Configure is hidden when the market is mock (no Morpho market on
          Robinhood Chain) — there is nothing to configure. */}
      <div
        className="flex items-center gap-2"
        style={{ marginTop: "auto", paddingTop: "14px" }}
      >
        {isMock ? (
          <span
            className="zeks-eyebrow uppercase"
            data-loop-configure-disabled
            title="No Morpho market for this collateral on Robinhood Chain"
            style={{
              height: "34px",
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              fontSize: "11px",
              letterSpacing: "0.06em",
              borderRadius: "6px",
              border: "1px dashed var(--border)",
              color: "var(--muted-foreground)",
              backgroundColor: "transparent",
              lineHeight: 1,
            }}
          >
            Unavailable
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(m.symbol)
            }}
            className="zeks-action-btn zeks-action-btn--lime"
            style={{ height: "34px", padding: "0 14px", fontSize: "12px" }}
          >
            Configure →
          </button>
        )}
        <Link
          href={`/terminal/markets/${encodeURIComponent(m.symbol)}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center transition-colors"
          style={{
            height: "34px",
            padding: "0 14px",
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            color: "var(--muted-foreground)",
            backgroundColor: "transparent",
            textDecoration: "none",
            lineHeight: 1,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--foreground)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--muted-foreground)")
          }
        >
          View market →
        </Link>
      </div>
    </article>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * 3 · Yield venue card
 * ═══════════════════════════════════════════════════════════════════ */

function VenueCard({
  venue: v,
  active,
  onSelect,
}: {
  venue: YieldVenue
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <article
      className="flex flex-col h-full"
      style={{
        padding: "var(--dash-card-pad)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: active ? "var(--accent)" : "var(--card-soft)",
        border: `1px solid ${active ? "var(--foreground)" : "var(--border)"}`,
        minHeight: "var(--dash-card-min-h)",
        transition: "background-color 160ms ease, border-color 160ms ease",
        cursor: "pointer",
      }}
      onClick={() => onSelect(v.id)}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--background)"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active
          ? "var(--accent)"
          : "var(--card-soft)"
      }}
      data-loop-venue-card
    >
      {/* Header */}
      <header
        className="flex items-start justify-between gap-2"
        style={{ paddingBottom: "12px" }}
      >
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-card-symbol)",
              color: "var(--foreground)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            {v.name}
          </div>
          {v.asset ? (
            <div
              className="font-sans truncate"
              style={{
                fontSize: "var(--font-card-company)",
                color: "var(--muted-foreground)",
                marginTop: "4px",
                letterSpacing: 0,
              }}
            >
              {v.asset} · {riskLabel(v.risk)}
            </div>
          ) : null}
        </div>
        <StatusChip status={v.status} />
      </header>

      {/* APY hero */}
      <div
        style={{
          paddingTop: "12px",
          paddingBottom: "12px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          Supply APY
        </div>
        <div
          className="zeks-num-price"
          style={{
            color: v.apy != null ? "var(--up)" : "var(--muted-foreground)",
            marginTop: "2px",
            opacity: v.apy != null ? 1 : 0.55,
          }}
        >
          {v.apy != null ? formatApy(v.apy) : "—"}
        </div>
      </div>

      {/* Stat strip */}
      <dl
        className="grid grid-cols-2"
        style={{
          columnGap: "12px",
          paddingTop: "12px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <StatField
          label="TVL"
          value={formatVaultTvl(v)}
        />
        <StatField
          label="Liquidity"
          value={v.liquidity != null ? formatCompact(v.liquidity) : "—"}
        />
      </dl>

      {/* Footer */}
      <div
        className="flex items-center justify-between"
        style={{ marginTop: "auto", paddingTop: "12px" }}
      >
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          {sourceLabel(v.source)}
        </span>
        {v.assetAddress ? (
          <span
            className="font-sans truncate"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              opacity: 0.7,
              fontVariantNumeric: "tabular-nums",
              maxWidth: "120px",
            }}
            title={v.assetAddress}
            data-loop-vault-address
          >
            <span
              style={{ opacity: 0.65, marginRight: "6px", letterSpacing: "0.04em" }}
            >
              Vault
            </span>
            {shortAddress(v.assetAddress)}
          </span>
        ) : null}
      </div>
    </article>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * 4 · Loop economics
 * ═══════════════════════════════════════════════════════════════════ */

function LoopEconomics({
  market,
  venue,
  collateralMarketAdapter,
  venueAdapter,
  amounts,
  onAmountsChange,
  panelOpen,
  onOpenLoop,
  walletStatus,
  walletChainId,
  onSwitchNetwork,
}: {
  market: LoopMarket | null
  venue: YieldVenue | null
  collateralMarketAdapter: ReturnType<
    typeof adaptLoopMarketToLendingMarket
  > | null
  venueAdapter: ReturnType<typeof adaptYieldVenueToLendingMarket> | null
  amounts: LoopAmountInputsValues
  onAmountsChange: (next: LoopAmountInputsValues) => void
  panelOpen: boolean
  onOpenLoop: () => void
  walletStatus: ReturnType<typeof useWallet>["status"]
  walletChainId: number | null
  onSwitchNetwork: () => void | Promise<void>
}) {
  if (!market || !venue) {
    return (
      <div
        className="flex items-center gap-2"
        style={{
          padding: "16px 20px",
          borderRadius: "var(--dash-card-radius)",
          border: "1px solid var(--border)",
          backgroundColor: "var(--card-soft)",
        }}
        data-loop-economics-empty
      >
        <span
          className="font-sans"
          style={{
            fontSize: "11px",
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
          }}
        >
          Pick a stock collateral card and an approved yield venue to see
          the carry breakdown.
        </span>
      </div>
    )
  }

  const collateralRaw =
    amounts.collateralAmount.trim() === ""
      ? null
      : Number(amounts.collateralAmount)
  const loanRaw =
    amounts.loanAmount.trim() === "" ? null : Number(amounts.loanAmount)
  const position = {
    market,
    venue,
    collateralAmount: collateralRaw,
    loanAmount: loanRaw,
    estimatedLtv: null,
  }
  const carry = computeNetCarry(position, LOOP_ESTIMATED_FEES_PERCENT)
  const estimatedLtvFrac = market.lltv != null ? market.lltv * 0.5 : null
  const risk: LoopRiskStatus =
    market.lltv != null
      ? assessLoopRisk(estimatedLtvFrac, market.lltv)
      : "unknown"

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
        gap: "var(--dash-card-gap)",
      }}
      data-loop-economics
    >
      {/* LEFT · Carry breakdown */}
      <section
        className="flex flex-col"
        style={{
          padding: "var(--dash-card-pad)",
          borderRadius: "var(--dash-card-radius)",
          backgroundColor: "var(--card-soft)",
          border: "1px solid var(--border)",
        }}
      >
        <CarryPanel
          market={market}
          venue={venue}
          carry={carry}
          estimatedLtv={estimatedLtvFrac}
          risk={risk}
        />
        {/* F13 — minimal amount inputs. Pure presentational. */}
        <div style={{ marginTop: "16px" }}>
          <LoopAmountInputs
            values={amounts}
            onChange={onAmountsChange}
            collateralSymbol={market.symbol.toUpperCase()}
            loanSymbol={venue.asset ?? venue.id.toUpperCase()}
            disabled={false}
          />
        </div>
        {/* F13 — Open Loop CTA. Disabled when the underlying
            market is not F12 transaction-eligible, when no wallet
            is connected, when the wallet is on the wrong chain, or
            when a typed amount is invalid. Reuses the F12 verdict
            the adapter already produced. */}
        <OpenLoopCta
          collateralMarketAdapter={collateralMarketAdapter}
          venueAdapter={venueAdapter}
          collateralAmount={amounts.collateralAmount}
          loanAmount={amounts.loanAmount}
          panelOpen={panelOpen}
          onOpenLoop={onOpenLoop}
          walletStatus={walletStatus}
          walletChainId={walletChainId}
          onSwitchNetwork={onSwitchNetwork}
          venue={venue}
        />
      </section>

      {/* RIGHT · Route visualization */}
      <section
        className="flex flex-col"
        style={{
          padding: "var(--dash-card-pad)",
          borderRadius: "var(--dash-card-radius)",
          backgroundColor: "var(--card-soft)",
          border: "1px solid var(--border)",
        }}
      >
        <RouteVisualization market={market} venue={venue} />
      </section>
    </div>
  )
}

/* F13 — Open Loop CTA. Pure presentational; consumes the adapter
   verdict (F12) and the wallet state to decide whether to enable
   the button. Never submits a transaction itself — it just opens
   the `LoopTransactionPanel` which composes the locked writers. */
function OpenLoopCta({
  collateralMarketAdapter,
  venueAdapter,
  collateralAmount,
  loanAmount,
  panelOpen,
  onOpenLoop,
  walletStatus,
  walletChainId,
  onSwitchNetwork,
  venue,
}: {
  collateralMarketAdapter: ReturnType<
    typeof adaptLoopMarketToLendingMarket
  > | null
  venueAdapter: ReturnType<typeof adaptYieldVenueToLendingMarket> | null
  collateralAmount: string
  loanAmount: string
  panelOpen: boolean
  onOpenLoop: () => void
  walletStatus: ReturnType<typeof useWallet>["status"]
  walletChainId: number | null
  onSwitchNetwork: () => void | Promise<void>
  venue: YieldVenue
}) {
  const ROBINHOOD_CHAIN_ID = 4663
  const venueAsset = venue.asset ?? venue.id.toUpperCase()
  const collateralInvalid =
    collateralAmount.trim() === "" ||
    isNaN(Number(collateralAmount)) ||
    Number(collateralAmount) <= 0
  const loanInvalid =
    loanAmount.trim() === "" ||
    isNaN(Number(loanAmount)) ||
    Number(loanAmount) <= 0

  let disabledReason: string | null = null
  if (collateralMarketAdapter?.marketUnconfigured) {
    disabledReason = collateralMarketAdapter.reason ?? "Market is unconfigured."
  } else if (venueAdapter?.marketUnconfigured) {
    disabledReason = venueAdapter.reason ?? "Venue is unconfigured."
  } else if (walletStatus !== "connected") {
    disabledReason = "Connect a wallet to open the loop."
  } else if (walletChainId !== ROBINHOOD_CHAIN_ID) {
    disabledReason = "Switch to Robinhood Chain to open the loop."
  } else if (collateralInvalid) {
    disabledReason = "Enter a positive collateral amount."
  } else if (loanInvalid) {
    disabledReason = `Enter a positive ${venueAsset} borrow amount.`
  }

  const disabled = disabledReason !== null

  // The wallet is currently unfunded — the F5C-readiness will
  // surface insufficient-balance as soon as the panel mounts and
  // reads the wallet's collateral balance. That is the EXPECTED
  // runtime behavior; F13 does not bypass it.
  void collateralAmount
  void loanAmount

  if (walletStatus === "connected" && walletChainId !== ROBINHOOD_CHAIN_ID) {
    return (
      <button
        type="button"
        onClick={() => {
          void onSwitchNetwork()
        }}
        data-loop-cta-switch-network
        className="zeks-action-btn zeks-action-btn--lime"
        style={{ marginTop: "12px" }}
      >
        Switch to Robinhood Chain
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpenLoop}
      disabled={disabled}
      aria-disabled={disabled}
      data-loop-cta-open-loop
      className={
        "zeks-action-btn " + (disabled ? "" : "zeks-action-btn--lime")
      }
      style={{ marginTop: "12px" }}
    >
      {panelOpen ? "Loop panel open ↓" : "Open Loop →"}
      {disabled && disabledReason ? (
        <span
          style={{
            marginLeft: "8px",
            fontSize: "11px",
            color: "var(--muted-foreground)",
            fontWeight: 400,
          }}
        >
          {disabledReason}
        </span>
      ) : null}
    </button>
  )
}

function CarryPanel({
  market,
  venue,
  carry,
  estimatedLtv,
  risk,
}: {
  market: LoopMarket
  venue: YieldVenue
  carry: NetCarry
  estimatedLtv: number | null
  risk: LoopRiskStatus
}) {
  const net = carry.net
  const gross = carry.gross
  const showNet = net != null
  const showGross = !showNet && gross != null
  const showNone = !showNet && !showGross

  return (
    <>
      {/* Hero — estimated carry */}
      <div>
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          {showNet ? "Estimated net carry" : "Carry (before fees)"}
        </div>

        {showNet ? (
          <>
            <div
              className="zeks-num-xl"
              style={{
                color: carry.profitable ? "var(--up)" : "var(--down)",
                marginTop: "8px",
              }}
            >
              {`${carry.profitable ? "+" : ""}${formatApy(net)}`}
            </div>
            <div
              className="font-sans"
              style={{
                fontSize: "11px",
                color: "var(--muted-foreground)",
                marginTop: "8px",
                letterSpacing: "0.02em",
              }}
            >
              gross {gross != null ? `${gross >= 0 ? "+" : ""}${gross.toFixed(2)}%` : "—"}
              {" · "}
              fees {carry.fees != null ? `${carry.fees.toFixed(2)}%` : "—"}
            </div>
          </>
        ) : showGross ? (
          <>
            <div
              className="zeks-num-xl"
              style={{
                color: gross >= 0 ? "var(--up)" : "var(--down)",
                marginTop: "8px",
              }}
            >
              {`${gross >= 0 ? "+" : ""}${formatApy(gross)}`}
            </div>
            <div
              className="font-sans"
              style={{
                fontSize: "11px",
                color: "var(--muted-foreground)",
                marginTop: "8px",
                letterSpacing: "0.02em",
              }}
            >
              before fees — fees unavailable
            </div>
          </>
        ) : (
          <>
            <div
              className="zeks-num-xl"
              style={{
                color: "var(--muted-foreground)",
                opacity: 0.4,
                marginTop: "8px",
              }}
            >
              —
            </div>
            <div
              className="font-sans"
              style={{
                fontSize: "11px",
                color: "var(--muted-foreground)",
                marginTop: "8px",
              }}
            >
              Insufficient data — both venue and borrow APY required.
            </div>
          </>
        )}
      </div>

      {/* Breakdown rows */}
      <dl
        className="grid grid-cols-2"
        style={{
          columnGap: "16px",
          rowGap: "12px",
          paddingTop: "20px",
          paddingBottom: "20px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          marginTop: "16px",
        }}
      >
        <DetailRow
          label="Borrow APY"
          value={carry.borrowApy != null ? formatApy(carry.borrowApy) : "—"}
        />
        <DetailRow
          label="Venue APY"
          value={carry.venueApy != null ? formatApy(carry.venueApy) : "—"}
        />
        <DetailRow
          label="Est. LTV"
          value={
            estimatedLtv != null ? `${(estimatedLtv * 100).toFixed(1)}%` : "—"
          }
        />
        <DetailRow
          label="LLTV"
          value={market.lltv != null ? `${(market.lltv * 100).toFixed(1)}%` : "—"}
        />
      </dl>

      {/* Risk */}
      <div
        className="flex items-center justify-between"
        style={{ paddingTop: "14px" }}
      >
        <div>
          <div
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "var(--font-micro)",
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
            }}
          >
            Risk indicator
          </div>
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              color: "var(--foreground)",
              marginTop: "4px",
            }}
          >
            {riskLabelFull(risk)}
          </div>
        </div>
        <div className="text-right">
          <div
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "var(--font-micro)",
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
            }}
          >
            Target util
          </div>
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              color: "var(--foreground)",
              marginTop: "4px",
            }}
          >
            {estimatedLtv != null ? `${(estimatedLtv * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Footer — read-only note */}
      <div
        className="font-sans"
        style={{
          marginTop: "auto",
          paddingTop: "16px",
          fontSize: "10px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.04em",
        }}
      >
        Supply · Borrow · Loop transactions
      </div>
    </>
  )
}

function RouteVisualization({
  market,
  venue,
}: {
  market: LoopMarket
  venue: YieldVenue
}) {
  return (
    <>
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        Loop route
      </div>

      <div
        className="flex flex-col"
        style={{
          marginTop: "14px",
          gap: "0",
        }}
      >
        <RouteStep
          label="Collateral"
          primary={market.symbol}
          secondary={cleanCompany(market.name) ?? market.symbol}
        />
        <RouteArrow caption="deposit as Morpho collateral" />

        <RouteStep
          label="Borrow"
          primary={venue.asset ?? "USDG"}
          secondary={
            market.borrowApy != null
              ? `${formatApy(market.borrowApy)} borrow APY`
              : "borrow APY —"
          }
        />
        <RouteArrow caption="route into verified vault" />

        <RouteStep
          label="Yield venue"
          primary={venue.name}
          secondary={
            venue.apy != null
              ? `${formatApy(venue.apy)} supply APY`
              : "APY —"
          }
        />
        <RouteArrow caption="compounds into USDG supply" />

        <RouteStep
          label="Net"
          primary={
            <span className="zeks-num-summary">
              {venue.apy != null && market.borrowApy != null
                ? `${venue.apy - market.borrowApy - LOOP_ESTIMATED_FEES_PERCENT >= 0 ? "+" : ""}${(venue.apy - market.borrowApy - LOOP_ESTIMATED_FEES_PERCENT).toFixed(2)}%`
                : "—"}
            </span>
          }
          secondary="net carry · before oracle price"
        />
      </div>

      {/* Footer note */}
      <div
        className="font-sans"
        style={{
          marginTop: "auto",
          paddingTop: "16px",
          fontSize: "10px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.04em",
        }}
      >
        Onchain verified vaults · Robinhood Chain
      </div>
    </>
  )
}

function RouteStep({
  label,
  primary,
  secondary,
}: {
  label: string
  primary: React.ReactNode
  secondary: string
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2"
      style={{
        paddingTop: "10px",
        paddingBottom: "10px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="min-w-0">
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "var(--font-micro)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </div>
        <div
          className="zeks-num-md"
          style={{
            color: "var(--foreground)",
            marginTop: "2px",
          }}
        >
          {primary}
        </div>
      </div>
      <div
        className="font-sans truncate"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
          textAlign: "right",
          maxWidth: "60%",
        }}
      >
        {secondary}
      </div>
    </div>
  )
}

function RouteArrow({ caption }: { caption: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        paddingTop: "4px",
        paddingBottom: "4px",
        paddingLeft: "10px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "1px",
          height: "16px",
          backgroundColor: "var(--border-strong)",
        }}
      />
      <span
        className="font-sans"
        style={{
          fontSize: "10px",
          color: "var(--muted-foreground)",
          letterSpacing: "0.04em",
        }}
      >
        {caption}
      </span>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Atoms
 * ═══════════════════════════════════════════════════════════════════ */

function SourceChip({ mode }: { mode: LoopMarket["sourceMode"] }) {
  const isLive = mode === "real-morpho"
  const isUnlisted = mode === "real-morpho-unlisted"
  const label = isLive ? "LIVE" : isUnlisted ? "UNLISTED" : "MOCK"
  const color = isLive
    ? "var(--up)"
    : isUnlisted
      ? "var(--muted-foreground)"
      : "var(--down)"
  return (
    <span
      className="zeks-eyebrow uppercase inline-flex items-center gap-1 shrink-0"
      style={{
        fontSize: "9px",
        color,
        letterSpacing: "0.08em",
        opacity: 0.85,
        padding: "2px 5px",
        border: `1px solid ${color}`,
        borderRadius: "4px",
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={{ width: "4px", height: "4px", backgroundColor: color }}
      />
      {label}
    </span>
  )
}

function StatusChip({ status }: { status: YieldVenue["status"] }) {
  const label = statusText(status)
  const color = statusTone(status)
  return (
    <span
      className="zeks-eyebrow uppercase inline-flex items-center gap-1 shrink-0"
      style={{
        fontSize: "9px",
        color,
        letterSpacing: "0.08em",
        opacity: 0.85,
        padding: "2px 5px",
        border: `1px solid ${color}`,
        borderRadius: "4px",
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={{ width: "4px", height: "4px", backgroundColor: color }}
      />
      {label}
    </span>
  )
}

function StatField({
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
  const color = muted
    ? "var(--muted-foreground)"
    : tone === "up"
      ? "var(--up)"
      : tone === "down"
        ? "var(--down)"
        : "var(--foreground)"
  return (
    <div>
      <dt
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </dt>
      <dd
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          color,
          marginTop: "3px",
        }}
      >
        {value}
      </dd>
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          color: "var(--foreground)",
          marginTop: "3px",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PanelEmpty({ text }: { text: string }) {
  return (
    <div
      className="font-sans"
      style={{
        padding: "20px",
        fontSize: "12px",
        color: "var(--muted-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
      }}
    >
      {text}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Format a vault's onchain `totalAssets()` share-token value into a
 * human-readable USDG figure.
 *
 * The raw value coming from `fetchVaultTotalAssets` is in share-token
 * base units (18 decimals for Loopr USDG vaults). We:
 *
 *   1. Convert to token units via the vault's `decimals` (always 18
 *      for verified vaults — see `lib/markets/protocol/verified-vaults.ts`).
 *   2. Tag as USDG because every verified vault wraps USDG supply.
 *   3. Use the same compact / grouped formatting as `formatCompact`.
 *
 * If the raw value is null or not finite, return "—".
 */
function formatVaultTvl(venue: YieldVenue): string {
  if (venue.tvl == null || !Number.isFinite(venue.tvl)) return "—"
  const abs = Math.abs(venue.tvl)
  if (abs === 0) return "$0"
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(2)}B USDG`
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M USDG`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(2)}K USDG`
  if (abs >= 1) return `$${venue.tvl.toFixed(2)} USDG`
  // Sub-unit: format with up to 6 decimals to avoid precision noise.
  return `$${venue.tvl.toFixed(6)} USDG`
}

function cleanCompany(name: string | null | undefined): string | null {
  if (!name) return null
  // Strip the " · Robinhood Token" suffix for cleaner display.
  const stripped = name.split(" · Robinhood")[0]
  return stripped.trim() || null
}

function statusText(s: YieldVenue["status"]): string {
  switch (s) {
    case "live":        return "LIVE"
    case "candidate":   return "CANDIDATE"
    case "inactive":    return "INACTIVE"
    case "stale":       return "STALE"
    case "unlisted":    return "UNLISTED"
    case "unavailable": return "UNAVAILABLE"
    case "mock":        return "MOCK"
  }
}

function statusTone(s: YieldVenue["status"]): string {
  switch (s) {
    case "live":        return "var(--up)"
    case "candidate":   return "var(--muted-foreground)"
    case "inactive":    return "var(--down)"
    case "stale":       return "var(--muted-foreground)"
    case "unlisted":    return "var(--muted-foreground)"
    case "unavailable": return "var(--down)"
    case "mock":        return "var(--down)"
  }
}

function riskLabel(r: YieldVenue["risk"]): string {
  switch (r) {
    case "low":    return "low risk"
    case "medium": return "med risk"
    case "high":   return "high risk"
  }
}

function riskLabelFull(r: LoopRiskStatus): string {
  switch (r) {
    case "safe":    return "Safe — ≤50% of LLTV"
    case "warning": return "Caution — 50–80% of LLTV"
    case "danger":  return "Danger — >80% of LLTV"
    case "unknown": return "—"
  }
}

function sourceLabel(s: YieldVenue["source"]): string {
  switch (s) {
    case "morpho-supply":     return "Morpho · live"
    case "verified-onchain":  return "Verified · onchain"
    case "mock":              return "Mock"
  }
}

function shortMarketId(id: string): string {
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

/** "0xBeEf…0ddD" for an Ethereum address. */
function shortAddress(addr: string): string {
  if (!addr) return "—"
  // Expect `0x` + 40 hex chars. If shorter, return as-is.
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
