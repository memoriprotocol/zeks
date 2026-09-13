"use client"

/**
 * MarketTicker — continuous horizontal marquee of stock tickers.
 *
 * Each item shows: [logo] [SYMBOL] [$price] [±change%]
 * SYMBOL is the most visually prominent text in each item.
 * 24h % change is sourced from MarketQuote.previousClose (the same
 * upstream Robinhood /rhj/prices payload as the price itself) — it
 * is NEVER fabricated. When previousClose is missing or zero, the
 * change column renders a muted "—" placeholder.
 *
 * DOM structure (animated by ONE node only):
 *   .zeks-ticker-viewport        ← overflow: hidden
 *     .zeks-ticker-scroller      ← overflow: hidden
 *       .zeks-ticker-row         ← width: max-content, the animated row
 *         .zeks-ticker-sequence  ← flex container, set A
 *           .zeks-ticker-item × N
 *         .zeks-ticker-sequence  ← set B (exact duplicate)
 *           .zeks-ticker-item × N
 *
 * Items never move individually — only the row translates -50%.
 * Two sequences inside the row make the loop seamless.
 *
 * Accessibility:
 *   - Animated tracks are aria-hidden.
 *   - A sr-only live region announces the current prices.
 *   - Static row takes over under prefers-reduced-motion.
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

/* ── Single ticker item ───────────────────────────────── */

interface ItemProps {
  symbol: string
  logoUrl: string | null
  price: number | null
  changePct: number | null
}

function TickerItem({ symbol, logoUrl, price, changePct }: ItemProps) {
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
      <span className="zeks-ticker-price">
        {price != null ? formatPrice(price) : "—"}
      </span>
      <ChangeBadge pct={changePct} />
    </span>
  )
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="zeks-ticker-change zeks-ticker-change-flat">—</span>
  }
  const sign = pct > 0 ? "+" : pct < 0 ? "" : ""
  const cls =
    pct > 0
      ? "zeks-ticker-change-up"
      : pct < 0
        ? "zeks-ticker-change-down"
        : "zeks-ticker-change-flat"
  return (
    <span className={`zeks-ticker-change ${cls}`}>
      {sign}
      {pct.toFixed(2)}%
    </span>
  )
}

/* ── Helpers ──────────────────────────────────────────── */

function formatPrice(p: number): string {
  if (p >= 1000) {
    return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  }
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toFixed(4)}`
}

/** 24h % change derived from MarketQuote.previousClose — real
 * upstream field, never a fabricated value. Returns null when the
 * upstream payload lacks a usable previousClose. */
function computeChangePct(
  price: number | null,
  previousClose: number | null,
): number | null {
  if (price == null || previousClose == null) return null
  if (!Number.isFinite(price) || !Number.isFinite(previousClose)) return null
  if (previousClose <= 0) return null
  return ((price - previousClose) / previousClose) * 100
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
      symbols.map((s) => {
        const q = quotes[s]
        const price = q?.referencePrice ?? null
        return {
          symbol: s,
          logoUrl: logoMap.get(s) ?? null,
          price,
          changePct: computeChangePct(price, q?.previousClose ?? null),
        }
      }),
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
          <div className="zeks-ticker-sequence">
            {items.map((it, i) => (
              <TickerItem key={`a-${it.symbol}-${i}`} {...it} />
            ))}
          </div>
          <div className="zeks-ticker-sequence">
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
            {it.changePct != null
              ? `, ${it.changePct >= 0 ? "+" : ""}${it.changePct.toFixed(2)} percent`
              : ", change unavailable"}
          </li>
        ))}
      </ul>
    </div>
  )
}
