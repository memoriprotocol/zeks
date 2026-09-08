"use client"

/**
 * TickerStrip — measured reference spec marquee.
 *
 *   · height: py-2.5 (40px)
 *   · continuous linear scroll ~32s
 *   · item gap 32px · logo 20x20 · text 12px
 *   · duplicated sequence for seamless loop
 *   · pause on hover
 *
 * Data: live Robinhood asset registry + REST quotes, fed by AppShell.
 * No new endpoints, no schema changes.
 */

import * as React from "react"
import {
  resolveTickerSymbols,
  TICKER_MAX_VISIBLE,
  type MarketQuote,
} from "@/lib/markets/client"

interface TickerStripProps {
  /** Asset registry from /rhj/assets (symbols + logos). */
  assets: { symbol: string; logoUrl?: string | null }[]
  /** Live quotes keyed by symbol (mid price). */
  quotes?: Record<string, MarketQuote>
  fetchedAt: string
  loading?: boolean
  errorReason?: string | null
}

export default function TickerStrip({
  assets,
  quotes = {},
  fetchedAt,
  loading,
  errorReason,
}: TickerStripProps) {
  const symbols = React.useMemo(() => {
    if (!assets || assets.length === 0) return []
    return resolveTickerSymbols(assets.map((a) => a.symbol)).slice(
      0,
      TICKER_MAX_VISIBLE,
    )
  }, [assets])

  const logoFor = React.useMemo(() => {
    const m = new Map<string, string | null>()
    for (const a of assets) m.set(a.symbol.toUpperCase(), a.logoUrl ?? null)
    return m
  }, [assets])

  if (!loading && symbols.length === 0) return null

  const items = symbols.map((s) => ({
    symbol: s,
    logoUrl: logoFor.get(s) ?? null,
    price: quotes[s]?.referencePrice ?? null,
  }))

  return (
    <div
      className="border-b border-border bg-card/60 flex items-center overflow-hidden shrink-0"
      style={{
        height: "var(--shell-strip-h)",
        padding: "10px 0",
      }}
      data-testid="ticker-strip"
    >
      <span
        className="inline-flex items-center gap-1.5 shrink-0"
        style={{
          paddingLeft: "var(--content-pad-x)",
          paddingRight: "16px",
        }}
      >
        <span
          aria-hidden="true"
          className="relative inline-flex w-1.5 h-1.5 shrink-0"
        >
          <span
            className={
              "absolute inset-0 rounded-full opacity-70 " +
              (errorReason ? "bg-amber-500" : "bg-primary animate-ping")
            }
          />
          <span
            className={
              "relative inline-block w-1.5 h-1.5 rounded-full " +
              (errorReason ? "bg-amber-500" : "bg-primary")
            }
          />
        </span>
        <span
          className="font-mono tracking-wider"
          style={{
            fontSize: "11px",
            color: errorReason ? "var(--muted-foreground)" : "var(--foreground)",
          }}
        >
          {errorReason ? "Stale" : "Live"}
        </span>
      </span>

      {/* Marquee track — duplicated for seamless loop */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="zeks-marquee">
          {[...items, ...items].map((it, i) => (
            <TickerItem
              key={`${it.symbol}-${i}`}
              symbol={it.symbol}
              logoUrl={it.logoUrl}
              price={it.price}
            />
          ))}
        </div>
      </div>

      <span
        className="hidden sm:inline-flex items-center gap-1.5 shrink-0"
        style={{
          paddingLeft: "16px",
          paddingRight: "var(--content-pad-x)",
          fontSize: "11px",
          color: "var(--muted-foreground)",
        }}
      >
        <span>Updated</span>
        <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
          {timeAgo(fetchedAt)}
        </span>
      </span>
    </div>
  )
}

/* ── Single ticker item ──────────────────────────────── */

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
    <span
      className="inline-flex items-center shrink-0"
      style={{
        gap: "8px",
        marginRight: "32px",
        fontSize: "12px",
        color: "var(--foreground)",
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          width: "20px",
          height: "20px",
          background: "var(--secondary)",
          border: "1px solid var(--border)",
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          color: "var(--muted-foreground)",
        }}
      >
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            width={20}
            height={20}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          symbol.slice(0, 1)
        )}
      </span>
      <span style={{ fontWeight: 500 }}>{symbol}</span>
      {price != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--muted-foreground)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatPrice(price)}
        </span>
      )}
    </span>
  )
}

/* ── Helpers ────────────────────────────────────────── */

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toFixed(4)}`
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}
