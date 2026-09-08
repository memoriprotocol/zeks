"use client"

/**
 * AssetNotFound
 *
 * Clean "Market not found" surface for `/terminal/markets/[symbol]`
 * when:
 *
 *   1. The requested symbol is not in the live Robinhood-Chain
 *      ACTIVE stock-token universe (typo, delisted, fictional ticker).
 *   2. The asset universe request itself failed AND the symbol is
 *      not in our local static fallback registry.
 *
 * Renders inside the existing AppShell chrome so the back link and
 * terminal layout are preserved. No new design system; uses the same
 * chrome as the rest of the Markets surfaces.
 */

import * as React from "react"
import Link from "next/link"

interface AssetNotFoundProps {
  symbol: string
  /**
   * Optional human-readable reason — surfaced subtly below the
   * headline. ALWAYS phrased as a downstream observation rather
   * than blaming any provider.
   */
  reason?: string | null
}

export default function AssetNotFound({
  symbol,
  reason,
}: AssetNotFoundProps) {
  return (
    <>
      <div className="px-4 md:px-6 pt-5 pb-3">
        <Link
          href="/terminal/markets"
          className="text-[10px] font-mono text-muted-foreground tracking-wider hover:text-foreground transition-colors"
        >
          ← MARKETS
        </Link>
      </div>

      <div className="px-4 md:px-6 pb-6">
        <section
          aria-label="Market not found"
          data-testid="asset-not-found"
          className="bg-card border border-border rounded-xl px-6 py-12 text-center"
          role="alert"
        >
          <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
            ASSET DETAIL
          </p>
          <h1 className="font-serif text-[24px] md:text-[28px] leading-tight text-foreground mt-2">
            Market not found
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
            The ticker{" "}
            <span className="font-mono text-foreground">{symbol}</span>{" "}
            is not an active Robinhood-Chain Stock Token right now.
          </p>
          {reason ? (
            <p className="text-[11px] font-mono text-muted-foreground/70 mt-2 max-w-md mx-auto">
              {reason}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/terminal/markets"
              className="inline-flex items-center h-9 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-mono hover:bg-primary/90 transition-colors"
            >
              Back to markets
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
