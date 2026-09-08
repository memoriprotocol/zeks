"use client"

/**
 * NetworkFlow — live onchain activity feed.
 *
 *   - IN      : tx with native value > 0  (incoming native)
 *   - TRANSFER: zero-value, non-reverted (contract call / token move)
 *   - REVERTED: tx reverted on-chain
 *
 * Outbound (OUT) is intentionally NOT labeled — without full address
 * comparison we can't safely infer OUT vs TRANSFER.
 *
 * Read-only.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import { useWalletActivity } from "@/components/portfolio/use-wallet-activity"

interface FeedItem {
  key: string
  title: string
  meta: string
  when: string
  kind: "in" | "transfer" | "reverted"
}

export default function NetworkFlow() {
  const { status, shortAddress } = useWallet()
  const { activity, loading } = useWalletActivity()

  const items = React.useMemo<FeedItem[]>(() => {
    if (!activity || activity.length === 0) return []
    return activity.slice(0, 8).map<FeedItem>((a) => {
      const value = Number(a.valueRaw) / 1e18
      if (a.reverted) {
        return {
          key: a.hash,
          title: "Reverted",
          meta: `${value.toFixed(4)} RHLD · reverted`,
          when: timeAgo(a.timestamp),
          kind: "reverted",
        }
      }
      if (value > 0) {
        return {
          key: a.hash,
          title: "IN",
          meta: `${value.toFixed(4)} RHLD`,
          when: timeAgo(a.timestamp),
          kind: "in",
        }
      }
      return {
        key: a.hash,
        title: "Transfer",
        meta: "0 value · contract call",
        when: timeAgo(a.timestamp),
        kind: "transfer",
      }
    })
  }, [activity])

  return (
    <section
      aria-label="Live network flow"
      data-testid="overview-network-flow"
      className="rounded-xl border border-border bg-card overflow-hidden h-full flex flex-col"
    >
      <header className="px-4 py-2.5 border-b border-border flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
            LIVE NETWORK FLOW
          </span>
          <span className="text-[11px] text-muted-foreground">
            Onchain events
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
          {shortAddress ?? "Not connected"}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-2 font-mono text-[10.5px] tracking-wider text-muted-foreground/60">
          {status === "connected"
            ? loading
              ? "Loading…"
              : "No recent transactions for this wallet"
            : status === "wrong-network"
              ? "Switch to Robinhood Chain to view activity"
              : "Connect a wallet to see recent transactions"}
        </p>
      ) : (
        <ol className="relative flex-1">
          <span
            aria-hidden="true"
            className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
          />
          {items.map((it, i) => (
            <li
              key={it.key}
              className="relative pl-6 pr-3 py-2"
              data-feed-row={i}
            >
              <span
                aria-hidden="true"
                className={
                  "absolute left-[3px] top-3 w-2.5 h-2.5 rounded-full bg-card border-2 " +
                  (it.kind === "in"
                    ? "border-up"
                    : it.kind === "transfer"
                      ? "border-muted-foreground/60"
                      : "border-down")
                }
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {it.title}
                </span>
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 tabular-nums shrink-0">
                  {it.when}
                </span>
              </div>
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground/70 mt-0.5 truncate">
                {it.meta}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const ms = Math.max(0, Date.now() - t)
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
