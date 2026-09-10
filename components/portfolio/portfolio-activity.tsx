"use client"

/**
 * PortfolioActivity
 *
 * Read-only wallet activity. Backed by `useWalletActivity` which
 * calls the Robinhood Chain Blockscout explorer API.
 *
 * Source labels (data-source badges):
 *   - Robinhood Chain
 *   - Morpho (when the row is a Morpho method call)
 *   - Blockscout
 *
 * No fake transactions, hashes, timestamps, or amounts.
 */

import * as React from "react"
import PortfolioEmptyState from "./portfolio-empty-state"
import type { ActivityItem } from "@/lib/markets/activity"
import { explorerTxUrl } from "@/lib/explorer/robinhood-chain"

interface PortfolioActivityProps {
  dataUnavailable: boolean
  items?: ActivityItem[]
  loading?: boolean
  unsupported?: boolean
  error?: string | null
}

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : hash
}

function shortAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function fmtTimestamp(iso: string | null): string {
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

export default function PortfolioActivity({
  dataUnavailable,
  items,
  loading,
  unsupported,
  error,
}: PortfolioActivityProps) {
  // Live branch.
  if (items) {
    if (unsupported) {
      return (
        <section
          aria-label="Recent activity"
          data-testid="portfolio-activity"
          className="bg-card border border-border rounded-xl p-5 md:p-6"
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
              RECENT ACTIVITY
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              No explorer feed on this chain
            </span>
          </div>
          <PortfolioEmptyState
            title="Activity feed unavailable."
            description="This chain does not expose a public activity API."
            testId="portfolio-activity-empty"
          />
        </section>
      )
    }

    if (error && items.length === 0) {
      return (
        <section
          aria-label="Recent activity"
          data-testid="portfolio-activity"
          className="bg-card border border-border rounded-xl p-5 md:p-6"
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
              RECENT ACTIVITY
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Blockscout
            </span>
          </div>
          <PortfolioEmptyState
            title="Activity feed unavailable."
            description={`Explorer error: ${error}`}
            testId="portfolio-activity-empty"
          />
        </section>
      )
    }

    if (items.length === 0) {
      return (
        <section
          aria-label="Recent activity"
          data-testid="portfolio-activity"
          className="bg-card border border-border rounded-xl p-5 md:p-6"
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
              RECENT ACTIVITY
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Last transactions
            </span>
          </div>
          {dataUnavailable ? (
            <PortfolioEmptyState
              title="Activity is currently unavailable."
              description="Recent transactions will appear when account data is available."
              testId="portfolio-activity-empty"
            />
          ) : (
            <PortfolioEmptyState
              title="No recent activity."
              description="No transactions on Robinhood Chain in the explorer's recent window."
              testId="portfolio-activity-empty"
            />
          )}
        </section>
      )
    }

    return (
      <section
        aria-label="Recent activity"
        data-testid="portfolio-activity"
        className="bg-card border border-border rounded-xl p-5 md:p-6"
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
            RECENT ACTIVITY
          </h2>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Blockscout · Robinhood Chain
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono tabular-nums">
            <thead>
              <tr className="text-[10px] tracking-wider text-muted-foreground/70">
                <th className="text-left font-normal py-2 pr-3">Hash</th>
                <th className="text-left font-normal py-2 px-3 hidden md:table-cell">
                  Counterparty
                </th>
                <th className="text-right font-normal py-2 px-3">Value</th>
                <th className="text-right font-normal py-2 pl-3 hidden md:table-cell">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="border-t border-border">
              {items.map((it) => (
                <tr
                  key={it.hash}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-2.5 pr-3">
                    <a
                      href={explorerTxUrl(it.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {shortHash(it.hash)}
                    </a>
                    {it.reverted ? (
                      <span className="ml-2 text-[9px] text-red-500">
                        reverted
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                    {it.to ? shortAddress(it.to) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {it.valueRaw > BigInt(0)
                      ? `${(Number(it.valueRaw) / 1e18).toFixed(6)}`
                      : "0"}
                  </td>
                  <td className="py-2.5 pl-3 text-right text-muted-foreground hidden md:table-cell">
                    {fmtTimestamp(it.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <p className="text-[10px] font-mono tracking-wider text-muted-foreground/70 mt-3">
            Refreshing…
          </p>
        ) : null}
      </section>
    )
  }

  // Original placeholder shell.
  const PLACEHOLDER_ROW_COUNT = 5
  return (
    <section
      aria-label="Recent activity"
      data-testid="portfolio-activity"
      className="bg-card border border-border rounded-xl p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          RECENT ACTIVITY
        </h2>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          Last transactions
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums">
          <thead>
            <tr className="text-[10px] tracking-wider text-muted-foreground/70">
              <th className="text-left font-normal py-2 pr-3">Type</th>
              <th className="text-left font-normal py-2 px-3 hidden md:table-cell">
                Asset
              </th>
              <th className="text-right font-normal py-2 px-3">Amount</th>
              <th className="text-right font-normal py-2 pl-3 hidden md:table-cell">
                When
              </th>
            </tr>
          </thead>
          <tbody className="border-t border-border">
            {Array.from({ length: PLACEHOLDER_ROW_COUNT }).map((_, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-b-0"
                data-row-index={i}
              >
                <td className="py-3 pr-3 text-muted-foreground">—</td>
                <td className="py-3 px-3 text-muted-foreground hidden md:table-cell">
                  —
                </td>
                <td className="py-3 px-3 text-right text-muted-foreground">
                  —
                </td>
                <td className="py-3 pl-3 text-right text-muted-foreground hidden md:table-cell">
                  —
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dataUnavailable ? (
        <div className="mt-4">
          <PortfolioEmptyState
            title="Activity is currently unavailable."
            description="Recent transactions will appear when account data is available."
            testId="portfolio-activity-empty"
          />
        </div>
      ) : null}
    </section>
  )
}
