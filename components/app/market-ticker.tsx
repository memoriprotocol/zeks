"use client"

/**
 * MarketTicker — continuous horizontal marquee.
 *
 * DOM structure:
 *   .zeks-ticker-viewport          ← clips overflow (overflow:hidden)
 *     .zeks-ticker-row             ← the single flex row that animates
 *       .zeks-ticker-sequence      ← set A (display: flex, gap, flex: none)
 *         .zeks-ticker-item × N
 *       .zeks-ticker-sequence      ← set B (exact duplicate, flex: none)
 *         .zeks-ticker-item × N
 *
 * Only ONE element animates: `.zeks-ticker-row` via `translateX(-50%)`.
 * Items never move on their own; they sit in two flex sequences
 * inside the row. When set A scrolls off the left, set B is in the
 * exact same position so the loop is seamless.
 *
 * Data source: same server-side feed as every other price surface
 * (Robinhood /rhj/assets + /rhj/prices via AppShell). No new
 * fetches. No new endpoints.
 *
 * Accessibility:
 *   - The animated track is `aria-hidden` because it's decorative.
 *   - A separate `sr-only` live region announces current prices.
 */

import * as React from "react"
import {
  resolveTickerSymbols,
  TICKER_MAX_VISIBLE,
  type MarketQuote,
} from "@/lib/markets/client"
import AssetLogo from "@/components/asset-logo"

interface MarketTickerProps {
  /** Asset registry: symbols + logoUrls from Robinhood /rhj/assets. */
  assets: { symbol: string; logoUrl?: string | null }[]
  /** Live quotes keyed by symbol. */
  quotes?: Record<string, MarketQuote>
}

/* ── Ticker item ─────────────────────────────────────── */

function TickerItem({
  symbol,
  logoUrl,
  price,
}: {
  symbol: string
  logoUrl: string | null
  price: number | null
}) {
  return (
    <span className="zeks-ticker-item">
      <AssetLogo
        symbol={symbol}
        src={logoUrl ?? undefined}
        size={20}
        shape="rounded"
        className="zeks-ticker-logo"
      />
      <span className="zeks-ticker-symbol">{symbol}</span>
      {price != null ? (
        <span className="zeks-ticker-price">{formatPrice(price)}</span>
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
  const symbols = React.useMemo(
    () =>
      resolveTickerSymbols(assets.map((a) => a.symbol)).slice(
        0,
        TICKER_MAX_VISIBLE,
      ),
    [assets],
  )

  const logoMap = React.useMemo(() => {
    const m = new Map<string, string | null>()
    for (const a of assets) m.set(a.symbol.toUpperCase(), a.logoUrl ?? null)
    return m
  }, [assets])

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

  return (
    <div
      className="zeks-ticker-viewport"
      aria-label="Live market prices"
      role="marquee"
    >
      {/* Reduced motion: static clipped ticker, no animation */}
      <div className="zeks-ticker-static" aria-hidden="false">
        {items.map((it) => (
          <TickerItem key={`s-${it.symbol}`} {...it} />
        ))}
      </div>

      {/* Animated: single flex row that scrolls left */}
      <div className="zeks-ticker-scroller" aria-hidden="true">
        <div className="zeks-ticker-row">
          {/* Set A */}
          <div className="zeks-ticker-sequence" aria-hidden="true">
            {items.map((it, i) => (
              <TickerItem key={`a-${it.symbol}-${i}`} {...it} />
            ))}
          </div>
          {/* Set B — exact duplicate */}
          <div className="zeks-ticker-sequence" aria-hidden="true">
            {items.map((it, i) => (
              <TickerItem key={`b-${it.symbol}-${i}`} {...it} />
            ))}
          </div>
        </div>
      </div>

      {/* Accessible live region */}
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
