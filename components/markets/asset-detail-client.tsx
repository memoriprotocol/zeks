"use client"

/**
 * AssetDetailClient
 *
 * Phase 2A — Asset Detail Shell + Real Current Data.
 *
 *   - Receives the initial real `MarketAsset` + `MarketQuote` from
 *     the server (see `app/terminal/markets/[symbol]/page.tsx`).
 *   - Owns the 20 s quote-polling loop on the client. Same pattern
 *     as `MarketsPageClient` so the whole terminal shares one
 *     refresh cadence.
 *   - On poll failure, keeps the prior quote visible and surfaces a
 *     `STALE` indicator (spec §25).
 *   - All fields on screen come from the upstream Robinhood Stock
 *     Token API via `MarketQuote` / `MarketAsset`. No fake numbers,
 *     no fabricated contract addresses, no "execution price" naming.
 *
 * Phase 2B (not in this commit) will replace the `ChartPlaceholder`
 * with a real historical chart fed by Chainlink Data Streams or
 * whatever the next-phase data source turns out to be.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import AssetHistoryChart from "@/components/markets/asset-history-chart"
import {
  absoluteTimestamp,
  formatUsd,
  formatVolume,
  relativeUpdated,
  ROBINHOOD_CHAIN_ID,
  type MarketAsset,
  type MarketQuote,
} from "@/lib/markets/client"

const REFRESH_INTERVAL_MS = 20_000

interface AssetDetailClientProps {
  asset: MarketAsset
  initialQuote: MarketQuote | null
  initialQuotesFetchedAt: string
  /** Server-rendered `Date.now()` for hydration-stable "Updated Xs ago". */
  initialNowMs: number
  /** True when the initial server fetch had to fall back to no-quote. */
  initialQuoteUnavailable: boolean
}

export default function AssetDetailClient({
  asset,
  initialQuote,
  initialQuotesFetchedAt,
  initialNowMs,
  initialQuoteUnavailable,
}: AssetDetailClientProps) {
  const [quote, setQuote] = React.useState<MarketQuote | null>(initialQuote)
  const [quotesFetchedAt, setQuotesFetchedAt] = React.useState<string>(
    initialQuotesFetchedAt,
  )
  const [stale, setStale] = React.useState(false)
  const [nowMs, setNowMs] = React.useState<number>(initialNowMs)
  const [quoteUnavailable, setQuoteUnavailable] = React.useState<boolean>(
    initialQuoteUnavailable,
  )

  /**
   * Refresh a single symbol against the existing
   * `/api/markets/quotes?symbols=…` route. We deliberately route
   * through the same JSON surface the rest of the terminal uses
   * so we never fork the Robinhood integration.
   */
  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/markets/quotes?symbols=${encodeURIComponent(asset.symbol)}`,
      )
      if (!res.ok) {
        setStale(true)
        return
      }
      const body = (await res.json()) as {
        ok: boolean
        quotes?: Record<string, MarketQuote>
        fetchedAt?: string
        failedSymbols?: string[]
      }
      if (!body.ok || !body.quotes) {
        setStale(true)
        return
      }
      const next = body.quotes[asset.symbol] ?? null
      if (next) {
        setQuote(next)
        setQuoteUnavailable(false)
      }
      if (body.fetchedAt) setQuotesFetchedAt(body.fetchedAt)
      setStale(false)
    } catch {
      setStale(true)
    }
  }, [asset.symbol])

  // Quote poll — single shared timer (spec §29).
  React.useEffect(() => {
    const id = window.setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  // Tick the freshness clock every 5 s without re-rendering the
  // whole page.
  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000)
    return () => window.clearInterval(id)
  }, [])

  // Derived fields. Each function either returns a real string or
  // returns "—" — never a fabricated or computed-as-fake value.
  const bid = quote?.bid ?? null
  const ask = quote?.ask ?? null
  const referencePrice = quote?.referencePrice ?? null
  const volume = quote?.dailyTradingVolume ?? null
  const halted = quote?.isTradingHalt ?? false

  // Spread = ask − bid. Only defined when BOTH sides are valid
  // finite numbers. NEVER computed against a missing side.
  const bothSides = bid !== null && ask !== null && ask > bid
  const spreadAbs = bothSides ? ask! - bid! : null
  const spreadPct =
    bothSides && referencePrice !== null && referencePrice !== 0
      ? ((ask! - bid!) / referencePrice) * 100
      : null

  return (
    <>
      {/* Breadcrumb */}
      <div className="px-4 md:px-6 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-muted-foreground"
        >
          <Link
            href="/terminal/markets"
            className="hover:text-foreground transition-colors"
          >
            ← MARKETS
          </Link>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <span
            className="text-foreground"
            data-testid="asset-detail-breadcrumb"
          >
            {asset.symbol}
          </span>
        </nav>
        <Freshness
          fetchedAt={quotesFetchedAt}
          nowMs={nowMs}
          stale={stale}
        />
      </div>

      {/* Main content */}
      <div className="px-4 md:px-6 pb-6 space-y-5">
        <AssetHeader asset={asset} halted={halted} />

        <PriceSummary
          asset={asset}
          referencePrice={referencePrice}
          bid={bid}
          ask={ask}
          volume={volume}
          quoteUnavailable={quoteUnavailable}
          halted={halted}
        />

        <AssetHistoryChart symbol={asset.symbol} initialNowMs={initialNowMs} />

        {/* Main column + metadata sidebar on wide desktop, stacked
            on narrow viewports. Main column is allowed to flow
            naturally; details panel sits on the right per
            layout spec (≥lg). */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-5">
          <MarketDataPanel
            referencePrice={referencePrice}
            bid={bid}
            ask={ask}
            spreadAbs={spreadAbs}
            spreadPct={spreadPct}
            volume={volume}
            halted={halted}
            quoteUnavailable={quoteUnavailable}
          />
          <TokenDetailsPanel asset={asset} halted={halted} />
        </div>

        <SourceFooter />
      </div>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Header                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function AssetHeader({
  asset,
  halted,
}: {
  asset: MarketAsset
  halted: boolean
}) {
  return (
    <section
      aria-label="Asset header"
      data-testid="asset-detail-header"
      className="zeks-surface-padded"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <AssetLogo
            symbol={asset.symbol}
            name={asset.displayName}
            src={asset.logoUrl ?? undefined}
            size={48}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-mono tracking-wider text-muted-foreground">
              STOCK TOKEN · ROBINHOOD CHAIN
            </div>
            <h1 className="font-serif text-[28px] md:text-[32px] leading-tight tracking-tight text-foreground mt-1.5">
              {asset.symbol}
            </h1>
            <div className="text-sm font-mono text-muted-foreground mt-1.5 truncate">
              {asset.displayName}
            </div>
          </div>
        </div>
        <StatusPill halted={halted} />
      </div>
    </section>
  )
}

function StatusPill({ halted }: { halted: boolean }) {
  if (halted) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-destructive/10 border border-destructive/30 text-[10px] font-mono tracking-wider text-destructive"
        data-status="halted"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        HALTED
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-primary/10 border border-primary/30 text-[10px] font-mono tracking-wider text-foreground"
      data-status="active"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      ACTIVE
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Price summary                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function PriceSummary({
  asset,
  referencePrice,
  bid,
  ask,
  volume,
  quoteUnavailable,
  halted,
}: {
  asset: MarketAsset
  referencePrice: number | null
  bid: number | null
  ask: number | null
  volume: number | null
  quoteUnavailable: boolean
  halted: boolean
}) {
  return (
    <section
      aria-label={`${asset.symbol} price summary`}
      data-testid="asset-price-summary"
      className="zeks-surface-padded"
    >
      <div className="flex items-baseline gap-3 text-[10px] font-mono tracking-wider text-muted-foreground">
        <span>REFERENCE PRICE</span>
        {halted ? (
          <span className="text-destructive" data-detail="halt-note">
            · HALTED — last known quote
          </span>
        ) : null}
      </div>
      <div
        className={
          "zeks-num-xl mt-2 " +
          (quoteUnavailable ? "text-muted-foreground/60" : "text-foreground")
        }
        data-testid="asset-reference-price"
      >
        {referencePrice === null
          ? "—"
          : formatUsd(referencePrice, 2)}
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-xl border border-border overflow-hidden">
        <SummaryCell
          label="BID"
          value={bid === null ? "—" : formatUsd(bid, 2)}
          testId="asset-bid"
        />
        <SummaryCell
          label="ASK"
          value={ask === null ? "—" : formatUsd(ask, 2)}
          testId="asset-ask"
        />
        <SummaryCell
          label="DAILY VOLUME"
          value={formatVolume(volume)}
          testId="asset-volume"
        />
        <SummaryCell
          label="STATUS"
          value={halted ? "HALTED" : "ACTIVE"}
          testId="asset-status-summary"
          tone={halted ? "destructive" : "primary"}
        />
      </div>

      {quoteUnavailable ? (
        <div
          className="mt-6 px-3 py-2 rounded-md bg-secondary/60 border border-border text-[11px] font-mono text-muted-foreground"
          role="status"
          data-detail="quote-unavailable"
        >
          Quote unavailable for {asset.symbol}. Showing the last known
          metadata until upstream recovers.
        </div>
      ) : null}
    </section>
  )
}

function SummaryCell({
  label,
  value,
  testId,
  tone,
}: {
  label: string
  value: string
  testId?: string
  tone?: "primary" | "destructive"
}) {
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "primary"
        ? "text-foreground"
        : "text-foreground"
  return (
    <div className="min-w-0 px-3.5 py-3 bg-card">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-[16px] mt-1 truncate " + toneClass
        }
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Market data panel (left main column on wide desktop)                       */
/* ────────────────────────────────────────────────────────────────────────── */

function MarketDataPanel({
  referencePrice,
  bid,
  ask,
  spreadAbs,
  spreadPct,
  volume,
  halted,
  quoteUnavailable,
}: {
  referencePrice: number | null
  bid: number | null
  ask: number | null
  spreadAbs: number | null
  spreadPct: number | null
  volume: number | null
  halted: boolean
  quoteUnavailable: boolean
}) {
  return (
    <section
      aria-label="Market data"
      data-testid="asset-market-data"
      className="zeks-surface-padded"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[18px] md:text-[20px] leading-tight text-foreground">
          Market data
        </h2>
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          {quoteUnavailable ? "QUOTE UNAVAILABLE" : "ROBINHOOD STOCK TOKEN API"}
        </span>
      </header>

      <dl className="mt-4 divide-y divide-border">
        <DataRow
          label="Reference Price"
          value={
            referencePrice === null
              ? "—"
              : formatUsd(referencePrice, 2)
          }
          hint="Mid of bid and ask when both sides are valid; one-sided when only one is."
        />
        <DataRow
          label="Bid"
          value={bid === null ? "—" : formatUsd(bid, 2)}
        />
        <DataRow
          label="Ask"
          value={ask === null ? "—" : formatUsd(ask, 2)}
        />
        <DataRow
          label="Spread"
          value={spreadAbs === null ? "—" : formatUsd(spreadAbs, 2)}
          trailing={
            spreadPct !== null ? (
              <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                {spreadPct.toFixed(2)}%
              </span>
            ) : null
          }
          hint="ask − bid. Only shown when both sides are valid."
        />
        <DataRow
          label="Daily Volume"
          value={formatVolume(volume)}
        />
        <DataRow
          label="Status"
          value={halted ? "HALTED" : "ACTIVE"}
          tone={halted ? "destructive" : "primary"}
        />
      </dl>
    </section>
  )
}

function DataRow({
  label,
  value,
  hint,
  trailing,
  tone,
}: {
  label: string
  value: string
  hint?: string
  trailing?: React.ReactNode
  tone?: "primary" | "destructive"
}) {
  const toneClass =
    tone === "destructive" ? "text-destructive" : "text-foreground"
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] sm:gap-4 py-3">
      <dt className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd
        className={
          "font-mono tabular-nums text-sm mt-0.5 sm:mt-0 " + toneClass
        }
      >
        {value}
      </dd>
      <div className="mt-1 sm:mt-0 flex items-center gap-2">
        {trailing}
        {hint ? (
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground/60 hidden md:inline">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Token details (right side panel on wide desktop)                           */
/* ────────────────────────────────────────────────────────────────────────── */

function TokenDetailsPanel({
  asset,
  halted,
}: {
  asset: MarketAsset
  halted: boolean
}) {
  return (
    <aside
      aria-label="Token details"
      data-testid="asset-token-details"
      className="zeks-surface-padded"
    >
      <header>
        <h2 className="font-serif text-[18px] md:text-[20px] leading-tight text-foreground">
          Token details
        </h2>
        <p className="text-[10px] font-mono tracking-wider text-muted-foreground/70 mt-1">
          Real onchain metadata · from the asset registry
        </p>
      </header>

      <dl className="mt-4 divide-y divide-border">
        <ContractRow address={asset.contractAddress} />
        <DetailRow
          label="Network"
          value="Robinhood Chain"
        />
        <DetailRow
          label="Chain ID"
          value={String(ROBINHOOD_CHAIN_ID)}
        />
        <DetailRow
          label="Multiplier"
          value={
            asset.currentMultiplier === null
              ? "—"
              : String(asset.currentMultiplier)
          }
        />
        <DetailRow
          label="Asset status"
          value={asset.status}
          tone={halted ? "destructive" : undefined}
        />
        <DetailRow
          label="Trading"
          value={`Whole ${capabilityLabel(asset.tradingWhole)} · Fractional ${capabilityLabel(asset.tradingFractional)}`}
        />
        <DetailRow
          label="Token decimals"
          value={asset.tokenDecimals === null ? "—" : String(asset.tokenDecimals)}
        />
      </dl>
    </aside>
  )
}

function capabilityLabel(c: string): string {
  if (c === "tradable") return "tradable"
  if (c === "non-tradable") return "off"
  return "—"
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "destructive"
}) {
  const toneClass =
    tone === "destructive" ? "text-destructive" : "text-foreground"
  return (
    <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-3 py-3">
      <dt className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd
        className={
          "font-mono tabular-nums text-xs break-all " + toneClass
        }
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * Contract row — shortened visually, copy-to-clipboard button, and a
 * safe Robinhood-Chain explorer link.
 *
 * - Shortening: `0x0000…c2425be` style. We never truncate to fewer
 *   than 6 leading + 4 trailing characters (the spec is for visual
 *   shortening, not anonymisation).
 * - Explorer URL: Robinhood Chain is a public EVM-compatible chain
 *   with a public block explorer. We only render the link when the
 *   address is present and looks valid. No external logo, no badge.
 * - Copy: a small clipboard button. Falls back to `document.execCommand`
 *   only inside the click handler (never SSR).
 */
function ContractRow({ address }: { address: string | null }) {
  const [copied, setCopied] = React.useState(false)

  if (!address) {
    return <DetailRow label="Contract" value="—" />
  }

  const shortened = shortenAddress(address)
  const valid = /^0x[0-9a-fA-F]{6,}$/.test(address)
  const explorerUrl = valid
    ? `https://explorer.robinhood.com/address/${address}`
    : null

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address)
      } else {
        // Fallback for older browsers — keep narrow.
        const ta = document.createElement("textarea")
        ta.value = address
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Silently noop — clipboard permission may be denied; we
      // never want to interrupt the page over a copy failure.
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-3 py-3">
      <dt className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        Contract
      </dt>
      <dd className="flex items-center gap-2 flex-wrap min-w-0">
        <span
          className="font-mono tabular-nums text-xs text-foreground"
          data-testid="asset-contract"
          title={address}
        >
          {shortened}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label="Copy contract address"
          className="text-[10px] font-mono tracking-wider h-6 px-2 rounded-md border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          data-testid="asset-contract-copy"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono tracking-wider h-6 px-2 rounded-md border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex items-center transition-colors"
            data-testid="asset-contract-explorer"
          >
            EXPLORER ↗
          </a>
        ) : null}
      </dd>
    </div>
  )
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Footer                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function SourceFooter() {
  return (
    <footer
      aria-label="Source"
      data-testid="asset-source-footer"
      className="text-[10px] font-mono tracking-wider text-muted-foreground/70 px-1"
    >
      Source · Robinhood Stock Token API
    </footer>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Freshness chip (top-right of breadcrumb row)                               */
/* ────────────────────────────────────────────────────────────────────────── */

function Freshness({
  fetchedAt,
  nowMs,
  stale,
}: {
  fetchedAt: string
  nowMs: number
  stale: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-muted-foreground">
      <span aria-hidden="true" className="relative inline-flex w-1.5 h-1.5">
        <span
          className={
            "absolute inset-0 rounded-full opacity-70 animate-ping " +
            (stale ? "bg-destructive" : "bg-primary")
          }
        />
        <span
          className={
            "relative inline-block w-1.5 h-1.5 rounded-full " +
            (stale ? "bg-destructive" : "bg-primary")
          }
        />
      </span>
      <span data-testid="asset-freshness">
        Updated {relativeUpdated(fetchedAt, nowMs)} ·{" "}
        {absoluteTimestamp(fetchedAt)}
      </span>
      {stale ? (
        <span
          className="ml-1 px-1.5 h-5 inline-flex items-center rounded bg-destructive/10 border border-destructive/30 text-destructive"
          data-testid="asset-stale-badge"
        >
          STALE
        </span>
      ) : null}
    </div>
  )
}
