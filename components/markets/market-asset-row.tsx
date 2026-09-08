"use client"

/**
 * MarketAssetRow
 *
 * One row in the lending-markets table. Clickable — navigates to
 * /terminal/markets/[symbol].
 *
 * Data shape: a single `LendingMarket` from the lending service.
 * No bid/ask, no daily trading volume — those trading fields are
 * de-emphasized for the new Loopr-style onchain lending view.
 *
 * No fabricated fields. Missing fields render as "—".
 */

import Link from "next/link"
import * as React from "react"
import AssetLogo from "@/components/asset-logo"
import { formatPrice, formatApy, formatCompact, formatUtilization } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface MarketAssetRowProps {
  market: LendingMarket
}

export default function MarketAssetRow({ market }: MarketAssetRowProps) {
  return (
    <Link
      href={`/terminal/markets/${encodeURIComponent(market.symbol)}`}
      data-symbol={market.symbol}
      data-status={market.status}
      data-source-mode={market.sourceMode}
      className="grid items-center gap-3 px-3 h-11 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors"
      style={{
        gridTemplateColumns:
          "minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.9fr)",
      }}
    >
      {/* Asset identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <AssetLogo
          symbol={market.symbol}
          name={market.name}
          src={market.logoUrl ?? undefined}
          size={26}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-mono font-semibold text-foreground leading-none truncate">
            {market.symbol}
          </div>
          <div className="text-[10.5px] font-mono text-muted-foreground leading-none truncate mt-1">
            {market.name}
          </div>
        </div>
      </div>

      {/* Oracle Price */}
      <div className="text-right text-[13px] font-mono tabular-nums text-foreground">
        {formatPrice(market.oraclePrice)}
      </div>

      {/* Supply APY */}
      <div className="text-right text-[13px] font-mono tabular-nums text-up">
        {formatApy(market.supplyApy)}
      </div>

      {/* Borrow APY */}
      <div className="text-right text-[13px] font-mono tabular-nums text-foreground">
        {formatApy(market.borrowApy)}
      </div>

      {/* Total Supply */}
      <div className="text-right text-[12.5px] font-mono tabular-nums text-muted-foreground">
        {formatCompact(market.totalSupply)}
      </div>

      {/* Total Borrow */}
      <div className="text-right text-[12.5px] font-mono tabular-nums text-muted-foreground">
        {formatCompact(market.totalBorrow)}
      </div>

      {/* Utilization */}
      <div className="text-right text-[12.5px] font-mono tabular-nums text-foreground">
        {formatUtilization(market.utilization)}
      </div>

      {/* Available Liquidity */}
      <div className="text-right text-[12.5px] font-mono tabular-nums text-muted-foreground">
        {formatCompact(market.availableLiquidity)}
      </div>

      {/* Status */}
      <div className="text-right">
        <StatusBadge status={market.status} />
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: LendingMarket["status"] }) {
  if (status === "paused") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-destructive/10 border border-destructive/30 text-[10px] font-mono tracking-wider text-destructive"
        data-status="paused"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        PAUSED
      </span>
    )
  }
  if (status === "delisted") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-secondary border border-border text-[10px] font-mono tracking-wider text-muted-foreground"
        data-status="delisted"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        DELISTED
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-secondary border border-border text-[10px] font-mono tracking-wider text-foreground/80"
      data-status="active"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/70" />
      ACTIVE
    </span>
  )
}
