"use client"

/**
 * ProductBanner — ZEKS Loop headline ("Put tokenized stocks to work
 * on Robinhood Chain.").
 *
 *   - Large serif headline
 *   - One-line positioning (no Loopr wording)
 *   - Compact status pip row + Explore CTA
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useNetworkStatus } from "./use-network-status"

interface ProductBannerProps {
  stockMarketCount: number | null
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
      aria-label="ZEKS product banner"
      data-testid="overview-product-banner"
      className="rounded-xl border border-border bg-card overflow-hidden paper"
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-6 p-5 md:p-6">
        {/* Left — copy */}
        <div className="min-w-0">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
            ZEKS TERMINAL
          </span>

          <h1 className="font-serif text-[34px] md:text-[44px] leading-[1.02] tracking-tight text-foreground mt-3">
            Put tokenized stocks
            <br className="hidden sm:block" /> to work on Robinhood Chain.
          </h1>

          <p className="text-[13px] text-muted-foreground mt-3 max-w-xl leading-relaxed">
            Deposit a stock token as collateral, borrow against it on Morpho,
            and route the stablecoin into a yield venue. The carry math
            updates with the chain.
          </p>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Link
              href="/terminal/loop"
              data-testid="overview-cta-explore-loop"
              className="group inline-flex items-center gap-1.5 rounded-lg bg-ink text-ink-foreground px-3.5 py-2 text-[12.5px] font-medium hover:bg-ink/90 transition-colors"
            >
              Explore strategy
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/terminal/markets"
              className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Browse markets →
            </Link>
          </div>
        </div>

        {/* Right — counts / status */}
        <div className="md:border-l md:border-border md:pl-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="STOCK MARKETS"
              value={stockMarketCount ?? "—"}
            />
            <Stat
              label="YIELD VENUES"
              value={yieldVenueCount ?? "—"}
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
              PROTOCOL
            </span>
            <span
              className={
                "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider " +
                (morphoLive
                  ? "text-up"
                  : "text-amber-700 dark:text-amber-300")
              }
            >
              <span
                className={
                  "w-1.5 h-1.5 rounded-full " +
                  (morphoLive ? "bg-up" : "bg-amber-500")
                }
              />
              {morphoLive ? "Morpho · live" : "Morpho · reachable"}
            </span>
          </div>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            Read-only dashboard · no transactions enabled
          </p>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="font-serif tabular-nums leading-none text-[26px] text-foreground mt-1">
        {value}
      </div>
    </div>
  )
}
