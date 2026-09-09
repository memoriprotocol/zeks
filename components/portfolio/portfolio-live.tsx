"use client"

/**
 * PortfolioLive (v4 — Portfolio page final build)
 *
 * Page structure:
 *   1. Account Summary — full-width hero card (6 metrics).
 *   2. Two-column body — LEFT: all Morpho positions; RIGHT: wallet + activity.
 *   3. Earn / Borrow breakdown — compact separate sections (no duplication).
 *
 * Empty states are compact and intentional.
 * No transaction buttons. Read-only.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { usePortfolio } from "./use-portfolio"
import { usePortfolioActivity } from "./use-portfolio-activity"
import PortfolioSummary from "./portfolio-summary"
import PortfolioPositions from "./portfolio-positions"
import PortfolioEarnPositions from "./portfolio-earn-positions"
import PortfolioBorrowPositions from "./portfolio-borrow-positions"
import PortfolioWalletSnapshot from "./portfolio-wallet-snapshot"
import PortfolioActivity from "./portfolio-activity"
import PortfolioIssues from "./portfolio-issues"

export default function PortfolioLive() {
  const { snapshot, loading, refresh } = usePortfolio()
  const {
    items: activity,
    loading: activityLoading,
    error: activityError,
    unsupported: activityUnsupported,
  } = usePortfolioActivity()

  const noDataYet = !snapshot

  return (
    <div className="space-y-3" data-portfolio-live>
      {/* 1 · Account Summary — full-width hero */}
      <PortfolioSummary
        dataUnavailable={noDataYet}
        snapshot={snapshot ?? null}
        loading={loading}
      />
      <PortfolioIssues issues={snapshot?.issues ?? []} />

      {/* 2 · Positions (left) + Wallet + Activity (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        {/* LEFT: all positions */}
        <PortfolioPositions
          dataUnavailable={noDataYet}
          snapshot={snapshot ?? null}
          loading={loading}
        />

        {/* RIGHT: wallet snapshot + recent activity */}
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

      {/* 3 · Earn / Borrow breakdown — compact separate sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {/* Footer nav */}
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
