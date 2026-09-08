"use client"

/**
 * ActivityLive (v3 — Loopr-density)
 *
 * Compact, dense activity feed.
 *
 *   - 32-row pipe to the Blockscout txlist API (refresh ~60s).
 *   - Each row links to the Robinhood Chain explorer.
 *   - Polite states: disconnected / wrong-network / unsupported /
 *     empty / unavailable. No giant empty cards.
 */

import * as React from "react"
import Link from "next/link"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"
import { useWalletActivity } from "@/components/portfolio/use-wallet-activity"

export default function ActivityLive() {
  const { status, shortAddress } = useWallet()
  const { activity, loading, error, unsupported } = useWalletActivity()

  if (
    status === "disconnected" ||
    status === "idle" ||
    status === "available" ||
    status === "connecting"
  ) {
    return <DisconnectedState />
  }

  if (status === "wrong-network") {
    return (
      <section className="w-full max-w-[1080px] mx-auto rounded-2xl border border-border bg-card p-5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          ACTIVITY
        </span>
        <h2 className="font-serif text-[22px] mt-2 text-foreground">
          Switch to Robinhood Chain
        </h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-md leading-relaxed">
          Your wallet is on a different network. Switch to Robinhood Chain
          to view activity.
        </p>
        <div className="mt-4">
          <WalletButton />
        </div>
      </section>
    )
  }

  if (unsupported) {
    return (
      <section className="w-full max-w-[1080px] mx-auto rounded-2xl border border-border bg-card p-5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          ACTIVITY
        </span>
        <h2 className="font-serif text-[22px] mt-2 text-foreground">
          Activity feed unavailable
        </h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-md leading-relaxed">
          This chain does not expose a public activity feed.
        </p>
      </section>
    )
  }

  return (
    <div className="w-full max-w-[1080px] mx-auto">
      <div className="mb-4">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          ACTIVITY
        </span>
        <h1 className="font-serif text-3xl md:text-[34px] leading-[1.1] tracking-tight text-foreground mt-1.5">
          Activity
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
          Recent transactions for{" "}
          <span className="font-mono text-foreground/80">
            {shortAddress ?? "this wallet"}
          </span>
          .
        </p>
      </div>

      {error && activity.length === 0 ? (
        <div className="text-[12px] font-medium px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          Live data unavailable
        </div>
      ) : null}

      {activity.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-secondary/30 px-5 py-6" data-activity-empty>
          <p className="font-serif text-[16px] text-foreground leading-snug">
            No recent activity
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
            This wallet has no transactions on Robinhood Chain.
          </p>
        </section>
      ) : (
        <section
          className="rounded-2xl border border-border bg-card overflow-hidden"
          aria-label="Recent activity"
          data-activity-table
        >
          <ul className="divide-y divide-border">
            {activity.map((a) => (
              <li key={a.hash}>
                <Link
                  href={`https://explorer.robinhood.com/tx/${a.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-4 h-11 hover:bg-secondary/30 transition-colors"
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
                  <div className="flex items-center gap-4 text-[12px] font-mono tabular-nums shrink-0">
                    <span className="text-foreground">
                      {a.valueRaw > BigInt(0)
                        ? `${(Number(a.valueRaw) / 1e18).toFixed(4)}`
                        : "0"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtTimestamp(a.timestamp)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-3 text-[10px] font-mono tracking-wider text-muted-foreground/60">
        {loading ? "Refreshing…" : "Blockscout · Robinhood Chain"}
      </p>
    </div>
  )
}

function DisconnectedState() {
  return (
    <div className="w-full max-w-[1080px] mx-auto">
      <div className="mb-4">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
          ACTIVITY
        </span>
        <h1 className="font-serif text-3xl md:text-[34px] leading-[1.1] tracking-tight text-foreground mt-1.5">
          Activity
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
          Connect your wallet to view recent onchain transactions.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Connect your wallet.
        </p>
        <div className="mt-3">
          <WalletButton />
        </div>
      </div>
    </div>
  )
}

function shortenHash(h: string): string {
  if (h.length < 14) return h
  return `${h.slice(0, 10)}…${h.slice(-4)}`
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
