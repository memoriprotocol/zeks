"use client"

/**
 * ProductBanner — Loopr-style ZEKS Loop explainer + CTA
 *
 *   - Strong serif headline
 *   - 3-step explainer (collateral → borrow → yield)
 *   - "Explore Loop" CTA + market count + protocol status pip
 *
 * Read-only. No wallet/signing.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useNetworkStatus } from "./use-network-status"

interface ProductBannerProps {
  /** Total curated stock-collateral market count. Null when unknown. */
  stockMarketCount: number | null
  /** Total aggregated yield venue count (across the loan assets). */
  yieldVenueCount: number | null
}

export default function ProductBanner({
  stockMarketCount,
  yieldVenueCount,
}: ProductBannerProps) {
  const network = useNetworkStatus()
  const morphoLive = network.morphoApi === "live"

  return (
    <section
      aria-label="ZEKS Loop product banner"
      data-testid="overview-product-banner"
      className="relative rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Side stripe — soft lime to set it apart from below sections */}
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
      />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 p-5 md:p-6 pl-4 md:pl-6">
        {/* ── left: copy + steps + CTA ───────────────────────────── */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
              ZEKS LOOP
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
              Robinhood Chain · Morpho Blue
            </span>
          </div>

          <h1 className="font-serif text-[28px] md:text-[36px] leading-[1.05] tracking-tight text-foreground mt-2">
            Stocks as collateral.
            <br />
            Stablecoin to yield.
          </h1>

          <p className="text-[12px] text-muted-foreground mt-2 max-w-md leading-relaxed">
            ZEKS Loop composes Morpho markets into a single carry strategy:
            deposit a stock, borrow against it, and route the loan into a
            yield venue. Net carry math is shown live.
          </p>

          {/* 3-step explainer — dense, mono labels */}
          <ol className="mt-4 grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden border border-border">
            <Step n="01" label="COLLATERAL" body="Stock (AAPL, NVDA…)" />
            <Step n="02" label="BORROW" body="Stablecoin" />
            <Step n="03" label="YIELD" body="Venue supply APY" />
          </ol>

          {/* CTA row */}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link
              href="/terminal/loop"
              data-testid="overview-cta-explore-loop"
              className="group inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-[12px] font-medium hover:bg-primary/90 transition-colors"
            >
              Explore Loop
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/terminal/markets"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Browse markets →
            </Link>
          </div>
        </div>

        {/* ── right: market count + protocol status pip ──────────── */}
        <div className="md:border-l md:border-border md:pl-5 space-y-3">
          <Stat label="STOCKS AVAILABLE" value={stockMarketCount ?? "—"} />
          <Stat label="YIELD VENUES" value={yieldVenueCount ?? "—"} />
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
              PROTOCOL
            </span>
            <span
              className={
                "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider " +
                (morphoLive ? "text-up" : "text-amber-700 dark:text-amber-300")
              }
            >
              <span
                className={
                  "w-1.5 h-1.5 rounded-full " +
                  (morphoLive ? "bg-up" : "bg-amber-500")
                }
              />
              {morphoLive ? "Morpho · Live" : "Morpho · Reachable"}
            </span>
          </div>
          <p className="text-[10px] font-mono tracking-wider text-muted-foreground/60">
            Read-only dashboard · no transactions enabled
          </p>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function Step({ n, label, body }: { n: string; label: string; body: string }) {
  return (
    <li className="bg-card px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
        STEP {n}
      </div>
      <div className="font-mono text-[10px] tracking-wider text-foreground mt-1">
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
        {body}
      </div>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="font-mono tabular-nums text-[22px] text-foreground">
        {value}
      </span>
    </div>
  )
}
