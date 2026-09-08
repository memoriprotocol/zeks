"use client"

/**
 * OverviewProtocol
 *
 * Featured protocol / info banner in the top-right of the dashboard.
 *
 *   - Single soft paper card with a brand stripe on the left.
 *   - Surfaces the canonical protocol identifier (Morpho Blue),
 *     chain, and oracle + a compact "what this is" paragraph.
 *   - Live status footer with morpho + rh-chain state.
 *
 * Deliberately NOT a settings card — feels informational, not
 * administrative.
 */

import * as React from "react"
import { useNetworkStatus } from "./use-network-status"
import { resolveProtocolContractsForChain } from "@/lib/markets/protocol/registry"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"

export default function OverviewProtocol() {
  const network = useNetworkStatus()
  const contracts = resolveProtocolContractsForChain(ROBINHOOD_CHAIN_ID)
  const morphoAddress = contracts.morphoBlueAddress

  return (
    <section
      aria-label="Protocol"
      data-testid="overview-protocol"
      className="relative rounded-2xl border border-border bg-card p-5 md:p-6 overflow-hidden"
    >
      {/* Brand stripe */}
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
      />

      <div className="pl-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            PROTOCOL
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider ${
              network.morphoApi === "live"
                ? "text-up"
                : "text-amber-700 dark:text-amber-300"
            }`}
          >
            <span
              className={
                "w-1.5 h-1.5 rounded-full " +
                (network.morphoApi === "live" ? "bg-up" : "bg-amber-500")
              }
            />
            {network.morphoApi === "live" ? "Live" : "Stale"}
          </span>
        </div>

        <h2 className="font-serif text-[20px] leading-tight text-foreground mt-2">
          Morpho Blue
        </h2>
        <p className="text-[11px] font-mono tracking-wider text-muted-foreground/80 mt-1">
          Robinhood Chain · Chainlink oracles
        </p>

        <p className="mt-3 text-[12px] text-muted-foreground leading-relaxed">
          Peer-to-peer lending markets. Supply assets to earn variable APY,
          or borrow against tokenized collateral.
        </p>

        <dl className="mt-4 space-y-1.5">
          <Row label="Network">
            <span className="text-foreground">Robinhood Chain</span>
            <span className="text-muted-foreground/70 font-mono text-[10px]">
              4663
            </span>
          </Row>
          <Row label="Oracle">
            <span className="text-foreground">Chainlink</span>
          </Row>
          <Row label="Contract">
            <span className="font-mono text-foreground/80">
              {morphoAddress
                ? `${morphoAddress.slice(0, 6)}…${morphoAddress.slice(-4)}`
                : "—"}
            </span>
          </Row>
        </dl>
      </div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <dt className="font-mono tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd className="flex items-center gap-1.5">{children}</dd>
    </div>
  )
}
