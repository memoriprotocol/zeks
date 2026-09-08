"use client"

/**
 * MarketActivitySection
 *
 * Read-only recent activity block on the market-detail page. Uses
 * the existing Robinhood Chain Blockscout txlist (the same source
 * the global /terminal/activity page uses).
 *
 *  ┌─ Not connected → "Connect your wallet to see activity."
 *  ├─ Wrong network → "Switch to Robinhood Chain."
 *  ├─ Empty         → "No recent transactions."
 *  ├─ Unavailable   → "Live data unavailable."
 *  └─ Live          → 5 transaction rows (each labelled simply
 *                     "Transaction" — we never invent supply/borrow
 *                     action types from calldata we cannot verify).
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useMarketActivity } from "@/components/markets/use-market-activity"
import type { LendingMarket } from "@/lib/markets/lending"

interface MarketActivitySectionProps {
  market: LendingMarket
}

/**
 * `market` is accepted so future filters can target this market's
 * contract. Today we surface the user's recent txlist as-is,
 * labelled "Transaction" — we never invent supply/borrow action
 * types from calldata we cannot reliably decode.
 */
export default function MarketActivitySection({
  market: _market,
}: MarketActivitySectionProps) {
  const { kind, items } = useMarketActivity()

  return (
    <section
      aria-label="Activity"
      data-market-activity
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <header className="px-5 md:px-6 py-3 border-b border-border flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            ACTIVITY
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
            Recent onchain transactions
          </span>
        </div>
        <Link
          href="/terminal/activity"
          className="group inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Open activity
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      <div className="p-5 md:p-6 min-w-0">
        {kind === "idle" ? (
          <State line="Connect your wallet to see activity." />
        ) : kind === "wrong-network" ? (
          <State line="Switch to Robinhood Chain to see activity." />
        ) : kind === "loading" ? (
          <State line="Loading…" />
        ) : kind === "unavailable" ? (
          <State line="Live data unavailable." />
        ) : kind === "empty" || items.length === 0 ? (
          <State line="No recent transactions." />
        ) : (
          <ol className="space-y-1">
            {items.map((a) => (
              <li key={a.hash}>
                <Link
                  href={`https://explorer.robinhood.com/tx/${a.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center px-2 h-6 rounded-md bg-secondary text-[10px] font-mono tracking-wider text-foreground/80 shrink-0">
                      Transaction
                    </span>
                    <span className="font-mono text-[12px] text-muted-foreground truncate">
                      {shortenHash(a.hash)}
                    </span>
                    {a.reverted ? (
                      <span className="text-[10px] text-down shrink-0">reverted</span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {fmtTime(a.timestamp)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function State({ line }: { line: string }) {
  return (
    <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
      {line}
    </p>
  )
}

function shortenHash(h: string): string {
  if (h.length < 14) return h
  return `${h.slice(0, 10)}…${h.slice(-4)}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const d = new Date(t)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
