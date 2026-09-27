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
 *
 * P2B polish: header rhythm matches P1B mono-caps (9.5px, 0.12em).
 * Transaction pill upgraded to P1B terminal chip rhythm
 * (10.5px, 0.04em tracking, weight 400). No data-shape change.
 * No fetch / polling / decoding change.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useMarketActivity } from "@/components/markets/use-market-activity"
import type { LendingMarket } from "@/lib/markets/lending"
import { explorerTxUrl } from "@/lib/explorer/robinhood-chain"

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
      className="zeks-card p-0 overflow-hidden"
    >
      <header
        className="flex items-baseline justify-between gap-2 border-b border-border"
        style={{ padding: "8px 14px", minHeight: "32px" }}
        data-market-activity-header
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--foreground)",
              fontWeight: 500,
            }}
          >
            ACTIVITY
          </span>
          <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>
            ·
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: "10.5px",
              letterSpacing: "0.04em",
              color: "var(--muted-foreground)",
              fontWeight: 400,
            }}
          >
            Recent onchain transactions
          </span>
        </div>
        <Link
          href="/terminal/activity"
          className="group inline-flex items-center gap-1 zeks-eyebrow uppercase shrink-0"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          Open activity
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      <div style={{ padding: "12px 14px" }}>
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
                  href={explorerTxUrl(a.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-[6px] hover:bg-secondary/30 transition-colors"
                  style={{ padding: "8px 10px" }}
                  data-market-activity-row
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex items-center zeks-eyebrow uppercase shrink-0"
                      style={{
                        fontSize: "9.5px",
                        letterSpacing: "0.1em",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--secondary)",
                        color: "var(--foreground)",
                        fontWeight: 500,
                      }}
                    >
                      Transaction
                    </span>
                    <span
                      className="font-sans truncate"
                      style={{
                        fontSize: "11.5px",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {shortenHash(a.hash)}
                    </span>
                    {a.reverted ? (
                      <span
                        className="zeks-eyebrow uppercase shrink-0"
                        style={{
                          fontSize: "9.5px",
                          letterSpacing: "0.08em",
                          color: "var(--down)",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--down)",
                          backgroundColor: "transparent",
                          fontWeight: 500,
                        }}
                      >
                        REVERTED
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="tabular-nums font-sans shrink-0"
                    style={{
                      fontSize: "11px",
                      color: "var(--muted-foreground)",
                    }}
                  >
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
    <p
      className="font-sans"
      style={{
        fontSize: "11.5px",
        color: "var(--muted-foreground)",
        letterSpacing: "0.02em",
      }}
    >
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
