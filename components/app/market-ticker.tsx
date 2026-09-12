"use client"

/**
 * MarketTicker — continuous horizontal marquee of stock tickers.
 *
 * Data flow (server-rendered via AppShell):
 *   AppShell fetches assets + quotes server-side
 *   → passes down to Toolbar → passes to MarketTicker
 *   → resolveTickerSymbols filters to priority list
 *   → MarketTicker renders duplicated sequence with CSS animation
 *
 * Prices use MarketQuote.referencePrice from the Robinhood REST feed
 * (same source as every other price surface in ZEKS).
 * No new polling, no new endpoints.
 *
 * Animation:
 *   - Seamless infinite loop via duplicated sequence
 *   - CSS @keyframes, linear, infinite
 *   - Pause on hover
 *   - Respects prefers-reduced-motion (static clipped view)
 */

import * as React from "react"
import {
  resolveTickerSymbols,
  TICKER_MAX_VISIBLE,
  type MarketQuote,
} from "@/lib/markets/client"
import AssetLogo from "@/components/asset-logo"
import { resolveAssetLogo } from "@/lib/assets/logo"

interface MarketTickerProps {
  /** Asset registry: symbols + logoUrls from Robinhood /rhj/assets. */
  assets: { symbol: string; logoUrl?: string | null }[]
  /** Live quotes keyed by symbol. */
  quotes?: Record<string, MarketQuote>
}

/* ── Ticker item ─────────────────────────────────────── */

function TickerChip({
  symbol,
  logoUrl,
  price,
}: {
  symbol: string
  logoUrl: string | null
  price: number | null
}) {
  return (
    <span className="zeks-ticker-chip">
      <AssetLogo
        symbol={symbol}
        src={logoUrl ?? undefined}
        size={20}
        shape="rounded"
        className="shrink-0"
      />
      <span className="zeks-ticker-symbol">{symbol}</span>
      {price != null ? (
        <span className="zeks-ticker-price">
          {formatPrice(price)}
        </span>
      ) : (
        <span className="zeks-ticker-price zeks-ticker-price-na">—</span>
      )}
    </span>
  )
}

function formatPrice(p: number): string {
  if (p >= 1000) {
    return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  }
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toFixed(4)}`
}

/* ── Marquee container ────────────────────────────────── */

export default function MarketTicker({ assets, quotes = {} }: MarketTickerProps) {
  // Resolve priority-ordered symbol list
  const symbols = React.useMemo(
    () =>
      resolveTickerSymbols(assets.map((a) => a.symbol)).slice(
        0,
        TICKER_MAX_VISIBLE,
      ),
    [assets],
  )

  // Build logo URL map from the asset registry
  const logoMap = React.useMemo(() => {
    const m = new Map<string, string | null>()
    for (const a of assets) m.set(a.symbol.toUpperCase(), a.logoUrl ?? null)
    return m
  }, [assets])

  // Build the ordered item list
  const items = React.useMemo(
    () =>
      symbols.map((s) => ({
        symbol: s,
        logoUrl: logoMap.get(s) ?? null,
        price: quotes[s]?.referencePrice ?? null,
      })),
    [symbols, logoMap, quotes],
  )

  if (items.length === 0) return null

  // Duplicated sequence for seamless infinite loop
  const sequence = [...items, ...items]

  return (
    <div className="zeks-ticker-track" aria-label="Live market prices">
      {/* Reduced motion: static, clipped */}
      <div className="zeks-ticker-static" aria-hidden="true">
        {items.map((it) => (
          <TickerChip key={`s-${it.symbol}`} {...it} />
        ))}
      </div>

      {/* Animated: clipped container + sliding inner */}
      <div className="zeks-ticker-scroller" aria-hidden="true">
        <div className="zeks-ticker-inner">
          {sequence.map((it, i) => (
            <TickerChip key={`m-${it.symbol}-${i}`} {...it} />
          ))}
        </div>
      </div>

      {/* Accessible live region — shows current prices */}
      <ul className="sr-only" aria-live="polite" aria-atomic="true">
        {items.map((it) => (
          <li key={`a11y-${it.symbol}`}>
            {it.symbol}{" "}
            {it.price != null ? formatPrice(it.price) : "price unavailable"}
          </li>
        ))}
      </ul>
    </div>
  )
}
