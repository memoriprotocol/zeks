"use client"

/**
 * PortfolioLive (v3 — Loopr-density)
 *
 * Compact account view. NO giant empty cards.
 *
 *   - Top: Account summary hero.
 *   - Two-column below the hero:
 *       LEFT  → Positions (supplied/borrowed/collateral)
 *       RIGHT → Wallet balances + activity summary
 *   - If empty: the LEFT panel renders a compact "No active
 *     positions" + suggested markets row, the RIGHT panel still
 *     shows the wallet summary.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { usePortfolio } from "./use-portfolio"
import { useWalletActivity } from "./use-wallet-activity"
import PortfolioSummary from "./portfolio-summary"
import PortfolioPositions from "./portfolio-positions"
import PortfolioEarnPositions from "./portfolio-earn-positions"
import PortfolioBorrowPositions from "./portfolio-borrow-positions"
import PortfolioActivity from "./portfolio-activity"
import PortfolioIssues from "./portfolio-issues"
import PortfolioWalletSnapshot from "./portfolio-wallet-snapshot"

export default function PortfolioLive() {
  const { snapshot, loading, refresh } = usePortfolio()
  const {
    activity,
    loading: activityLoading,
    activityError,
    activityUnsupported,
  } = useWalletActivity()

  const noDataYet = !snapshot

  return (
    <div className="space-y-3" data-portfolio-live>
      <PortfolioSummary
        dataUnavailable={noDataYet}
        snapshot={snapshot ?? null}
        loading={loading}
      />
      <PortfolioIssues issues={snapshot?.issues ?? []} />

      {/* Asymmetric: positions left, wallet+activity right */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <div className="space-y-3 min-w-0">
          <PortfolioPositions
            dataUnavailable={noDataYet}
            snapshot={snapshot ?? null}
            loading={loading}
          />
          <PortfolioEarnPositions
            dataUnavailable={noDataYet || (snapshot?.supplied.length ?? 0) === 0}
            snapshot={snapshot ?? null}
            loading={loading}
          />
          <PortfolioBorrowPositions
            dataUnavailable={
              noDataYet ||
              ((snapshot?.borrowed.length ?? 0) === 0 &&
                (snapshot?.collateral.length ?? 0) === 0)
            }
            snapshot={snapshot ?? null}
            loading={loading}
          />
        </div>
        <div className="space-y-3 min-w-0">
          <PortfolioWalletSnapshot />
          <PortfolioActivity
            dataUnavailable={activity.length === 0 && !activityUnsupported}
            items={activity}
            loading={activityLoading}
            unsupported={activityUnsupported}
            error={activityError}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono tracking-wider text-muted-foreground/70 pt-1">
        <span>Live data</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="hover:text-foreground"
        >
          Refresh
        </button>
        <span aria-hidden="true">·</span>
        <Link
          href="/terminal/earn"
          className="hover:text-foreground"
        >
          Discover yield
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/terminal/markets"
          className="hover:text-foreground inline-flex items-center gap-0.5"
        >
          Browse markets
          <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  )
}
