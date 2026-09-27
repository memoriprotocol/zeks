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
          className="zeks-eyebrow hover:text-foreground transition-colors"
        >
          ← Markets
        </Link>
      </div>

      <div className="px-4 md:px-6 pb-6">
        <section
          aria-label="Market not found"
          data-testid="asset-not-found"
          className="bg-card border border-border rounded-xl px-6 py-12 text-center"
          role="alert"
        >
          <p className="zeks-eyebrow">
            Asset detail
          </p>
          <h1 className="zeks-section-title text-[22px] md:text-[26px] mt-2 text-foreground">
            Market not found
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
            The ticker{" "}
            <span className="zeks-symbol-sm">{symbol}</span>{" "}
            is not an active Robinhood-Chain Stock Token right now.
          </p>
          {reason ? (
            <p className="zeks-secondary text-[11.5px] mt-2 max-w-md mx-auto">
              {reason}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/terminal/markets"
              className="zeks-btn-primary h-9 px-4"
            >
              Back to markets
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
