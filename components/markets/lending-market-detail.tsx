"use client"

/**
 * LendingMarketDetail (v5 — Markets Detail Transaction Surface · F15)
 *
 * Premium live read-only detail view for one onchain Morpho market.
 *
 *   - 1: strong serif "market hero" with oracle price + APY hierarchy
 *   - 2: market metrics grid (Supply APY, Borrow APY, TVL, Total Borrow,
 *         Available Liquidity, Utilization, LLTV, Listed)
 *   - 3: market structure (collateral / loan / oracle / market id /
 *         protocol / network) — null fields hidden gracefully
 *   - 4: per-market user section (wallet balance, supplied, borrowed,
 *         collateral, position value) + empty state when no position
 *   - 5: market activity feed — only when wallet connected; never
 *         invents action types
 *
 * F15 — Markets Detail Transaction Surface:
 *   The previous Supply-only panel has been replaced with a 5-tab
 *   MarketsActionPanel (SUPPLY / WITHDRAW / BORROW / REPAY /
 *   WITHDRAW_COLLATERAL) that wires the LOCKED F2 / F3 / F5 / F6 / F7
 *   primitives unchanged. The page-level F14 mirror gate
 *   (`f12Ineligible = market.transactionEligible !== true`) keeps
 *   every transaction CTA disabled when F12 reports the market as
 *   ineligible (e.g. AMZN, mock rows, inactive rows).
 *
 *   NO new transaction logic. NO new calldata encoders. NO new RPC
 *   paths. NO new provider logic. NO new network-switch logic. Every
 *   transaction step is gated by the locked readiness hook for its
 *   tab, executed through the locked writer's `.supply()` /
 *   `.withdraw()` / `.borrow()` / `.repay()` / `.withdrawCollateral()`
 *   entrypoint, and recorded via F8 / F9 exactly as on EarnDetail.
 *
 *   AMZN renders all 5 tabs; every CTA is disabled. No marketId is
 *   fabricated; no other market is substituted.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import AssetLogo from "@/components/asset-logo"
import UserPositionPanel from "@/components/markets/user-position-panel"
import AssetHistoryChart from "@/components/markets/asset-history-chart"
import MarketUserSection from "./market-user-section"
import MarketActivitySection from "./market-activity-section"
// F15 — locked F2/F3/F5/F6/F7 transaction primitives. Reused
// unchanged. These are the same writers and gates used by EarnDetail
// (locked in F1-F14). F15 is wiring, not new logic.
import { useSupplyReadiness } from "@/components/earn/use-supply-readiness"
import { useApprovalTransaction } from "@/components/earn/use-approval-transaction"
import { useSupplyTransaction } from "@/components/earn/use-supply-transaction"
import { useWithdrawTransaction } from "@/components/earn/use-withdraw-transaction"
import { usePositionView } from "@/components/earn/use-position-view"
import { useBorrowTransaction } from "@/components/earn/use-borrow-transaction"
import { useRepayTransaction } from "@/components/earn/use-repay-transaction"
import { useWithdrawCollateralTransaction } from "@/components/earn/use-withdraw-collateral-transaction"
import { useBorrowCapacity } from "@/components/earn/use-borrow-capacity"
import { useBorrowReadiness } from "@/components/earn/use-borrow-readiness"
import { useRepayReadiness } from "@/components/earn/use-repay-readiness"
import { useWithdrawCollateralReadiness } from "@/components/earn/use-withdraw-collateral-readiness"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  formatPrice,
  formatApy,
  formatCompact,
  formatUtilization,
} from "@/lib/markets/format"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/client"
import type { LendingMarket } from "@/lib/markets/lending"
import { LENDING_SOURCE } from "@/lib/markets/lending"
import { explorerAddressUrl } from "@/lib/explorer/robinhood-chain"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import {
  readErc20Allowance,
  readErc20Balance,
} from "@/lib/markets/onchain/erc20"
import { formatUnits } from "@/lib/markets/onchain/format-units"
import { maxWithdrawableCollateral as computeMaxSafeWithdraw } from "@/lib/markets/onchain/morpho-oracle"
import {
  ActionReceiptTrail,
  type EarnActionKind,
} from "@/components/earn/action-receipt-trail"
import { LifecycleChip, lifecycleOf } from "@/components/earn/lifecycle-chip"
import {
  SupplyStatusLine,
  BorrowStatusLine,
  WithdrawCollateralStatusLine,
} from "@/components/earn/transaction-status-lines"
import { emitDataInvalidate } from "@/components/markets/data-invalidate"

interface LendingMarketDetailProps {
  market: LendingMarket
}

export default function LendingMarketDetail({
  market,
}: LendingMarketDetailProps) {
  // F14 (page-level mirror) — single F12 lifecycle gate. Applied
  // uniformly to every action tab by the MarketsActionPanel
  // composition below. AMZN, mock rows, and inactive rows have
  // transactionEligible === false / undefined, which keeps every CTA
  // disabled. No writer executes; no wallet signature is requested
  // when this is true.
  const f12Ineligible = market.transactionEligible !== true

  // P2B — read the existing F12 lifecycle field. No new derivation.
  // Drives the page-level lifecycle banner only.
  const lifecycleState = lifecycleOf(market)
  const showLifecycleBanner =
    lifecycleState !== null && lifecycleState !== "active"

  // P3B — hydration-stable "now" timestamp injected into the chart
  // component. Lazily initialized once at mount so server / client
  // markup agree and the chart's freshness chip does not flash on
  // hydration. Matches the EarnDetail pattern (locked).
  const initialNowMs = React.useState(() => Date.now())[0]

  return (
    <div className="zeks-page" data-market-detail>
      {/* ── 0 · Breadcrumb on left · section nav on right · same row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          padding: "0 4px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
        data-market-detail-topnav
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            color: "var(--muted-foreground)",
          }}
          data-market-detail-breadcrumb
        >
          <Link
            href="/terminal/markets"
            style={{
              color: "var(--muted-foreground)",
              textDecoration: "none",
              fontWeight: 500,
            }}
            className="hover:text-foreground transition-colors"
          >
            Markets
          </Link>
          <span aria-hidden="true" style={{ opacity: 0.5 }}>/</span>
          <span
            style={{
              color: "var(--foreground)",
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              letterSpacing: 0,
            }}
          >
            {market.symbol}
          </span>
        </nav>

        {/* Compact section nav (anchors) — Overview · Market · Activity */}
        <div
          role="tablist"
          aria-label="Market detail sections"
          style={{
            display: "inline-flex",
            gap: "2px",
            padding: "3px",
            backgroundColor: "var(--card-soft)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
          }}
          data-market-section-nav
        >
          {[
            { id: "overview", label: "Overview" },
            { id: "market", label: "Market" },
            { id: "activity", label: "Activity" },
          ].map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              role="tab"
              aria-controls={`market-section-${t.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "28px",
                padding: "0 12px",
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--muted-foreground)",
                borderRadius: "7px",
                textDecoration: "none",
                letterSpacing: 0,
                transition: "background-color 140ms ease-out, color 140ms ease-out",
              }}
              className="hover:text-foreground"
              data-market-section-link={t.id}
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {/* F12 lifecycle banner — compact neutral notice (UI-3). Reads the
          existing lifecycle field only; no new derivation. */}
      {showLifecycleBanner ? (
        <div
          data-market-detail-lifecycle-banner
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "0 4px",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          <LifecycleChip lifecycle={lifecycleState} compact />
          <span>{lifecycleLabel(lifecycleState)}</span>
        </div>
      ) : null}

      {/* ── 1. COMPACT HERO · SOFT SAGE ───────────────────────────────── */}
      <section
        id="overview"
        aria-label="Market header"
        data-market-detail-hero
        data-market-section="overview"
        style={{
          backgroundColor: "var(--card-soft)",
          borderRadius: "20px",
          border: "1px solid var(--border)",
          padding: "16px 22px 14px",
        }}
      >
        {/* Row 1 · Identity + price */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <AssetLogo
            symbol={market.symbol}
            name={market.name}
            src={market.logoUrl ?? undefined}
            rhLogoUrl={market.rhLogoUrl ?? undefined}
            contractAddress={market.contractAddress ?? market.rhContractAddress ?? undefined}
            size={36}
          />
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <h1
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "22px",
                  color: "var(--foreground)",
                  letterSpacing: "-0.022em",
                  lineHeight: 1.1,
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                {market.symbol}
              </h1>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "13px",
                  color: "var(--muted-foreground)",
                  fontWeight: 400,
                }}
              >
                {market.name}
                {market.collateralAssetSymbol ? (
                  <span> · Collateral {market.collateralAssetSymbol}</span>
                ) : null}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
                marginTop: "6px",
              }}
            >
              <SoftBadge text={statusText(market.status)} tone={statusTone(market.status)} />
              <SoftBadge text={sourceText(market.sourceMode)} tone={sourceTone(market.sourceMode)} />
              <LifecycleChip lifecycle={lifecycleState} compact />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "4px",
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                color: "var(--muted-foreground)",
                fontWeight: 500,
                letterSpacing: 0,
              }}
            >
              Live oracle price
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "28px",
                color: "var(--foreground)",
                letterSpacing: "-0.022em",
                lineHeight: 1.05,
                fontWeight: 500,
              }}
              data-field="oracle-price"
              className="tabular-nums"
            >
              {market.oraclePrice != null
                ? formatPrice(market.oraclePrice)
                : "—"}
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                color: "var(--muted-foreground)",
                fontWeight: 400,
              }}
            >
              {oracleLabel(market.oracleSource)} · Robinhood Chain
            </span>
          </div>
        </div>

        {/* Row 2 · Whitespace-separated metrics (single line on wide) */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: "12px 24px",
          }}
          data-market-detail-metrics
        >
          <HeroMetric
            label="Liquidity"
            value={
              market.availableLiquidity != null
                ? formatCompact(market.availableLiquidity)
                : "—"
            }
          />
          <HeroMetric
            label="Supply APY"
            value={
              market.supplyApy != null ? formatApy(market.supplyApy) : "—"
            }
            tone="up"
          />
          <HeroMetric
            label="Borrow APY"
            value={
              market.borrowApy != null ? formatApy(market.borrowApy) : "—"
            }
          />
          <HeroMetric
            label="LLTV"
            value={
              market.lltv != null
                ? `${(market.lltv * 100).toFixed(1)}%`
                : "—"
            }
          />
          <HeroMetric
            label="Utilization"
            value={formatUtilization(market.utilization)}
          />
        </div>
      </section>

      {/* ── 2. WORKSPACE · chart left / action+position right ──────── */}
      <div
        className="zeks-market-workspace"
        data-market-detail-workspace
      >
        {/* LEFT — Chart (~70%) */}
        <section
          aria-label={`${market.symbol} price history`}
          data-market-detail-history
          style={{
            backgroundColor: "var(--card-soft)",
            borderRadius: "20px",
            border: "1px solid var(--border)",
            padding: "18px 20px 18px",
            minWidth: 0,
          }}
        >
          <AssetHistoryChart
            symbol={market.symbol}
            initialNowMs={initialNowMs}
          />
        </section>

        {/* RIGHT — Action rail (~30%) */}
        <aside
          aria-label="Market actions and position"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minWidth: 0,
          }}
          data-market-action-rail
        >
          <MarketsActionPanel market={market} />
          <MarketUserSection market={market} />
          <UserPositionPanel market={market} />
        </aside>
      </div>

      {/* ── 3. SECONDARY · market structure + activity ──────────────── */}
      <div
        className="zeks-market-secondary"
        data-market-detail-secondary
      >
        <div
          id="market"
          data-market-section="market"
        >
          <MarketStructureCard market={market} />
        </div>
        <section
          id="activity"
          aria-label="Market activity"
          data-market-detail-activity
          style={{
            backgroundColor: "var(--card-soft)",
            borderRadius: "20px",
            border: "1px solid var(--border)",
            padding: "20px 24px 22px",
            minWidth: 0,
          }}
        >
          <MarketActivitySection market={market} />
        </section>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Subcomponents
 * ──────────────────────────────────────────────────────────────────── */

// ==============================================================
// F15 — MarketsActionPanel
// ==============================================================

const MARKETS_ACTION_TABS = [
  "SUPPLY",
  "WITHDRAW",
  "BORROW",
  "REPAY",
  "WITHDRAW_COLLATERAL",
] as const
type MarketsActionTab = (typeof MARKETS_ACTION_TABS)[number]

const MARKETS_ACTION_TAB_LABELS: Record<MarketsActionTab, string> = {
  SUPPLY: "Supply",
  WITHDRAW: "Withdraw",
  BORROW: "Borrow",
  REPAY: "Repay",
  WITHDRAW_COLLATERAL: "Withdraw Collateral",
}

/**
 * P2C — read the (non-binding) `?action=` query hint at mount time.
 *
 * Maps the public `action` vocabulary used by PortfolioPositionLink
 * to the internal `MarketsActionTab`. Unknown / missing values fall
 * back to "SUPPLY" (the F15 default). This function NEVER inspects
 * the wallet, market state, or any financial primitive — it only
 * maps a string. Every actual transaction remains gated by the
 * F14 mirror + the per-tab readiness hooks.
 */
function initialActionTabFromQuery(): MarketsActionTab {
  // Use `window.location.search` directly so this stays a pure
  // client-only initializer and does not require a Suspense boundary
  // (Next.js 16 would otherwise force the whole route to bail out
  // to client rendering).
  if (typeof window === "undefined") return "SUPPLY"
  const raw = new URLSearchParams(window.location.search).get("action")
  switch (raw) {
    case "withdraw":
      return "WITHDRAW"
    case "repay":
      return "REPAY"
    case "withdraw-collateral":
      return "WITHDRAW_COLLATERAL"
    case "supply":
    case "borrow":
      return raw === "borrow" ? "BORROW" : "SUPPLY"
    default:
      return "SUPPLY"
  }
}

function MarketsActionPanel({ market }: { market: LendingMarket }) {
  const wallet = useWallet()
  const walletConnected = wallet.status === "connected"
  const walletBusy =
    wallet.status === "connecting" || wallet.status === "initializing"

  // P2C — accept a non-binding `?action=` query hint at mount time.
  // This is a navigation hint only; it does NOT bypass the page-level
  // F14 mirror, the per-tab readiness hooks, the approval flow, the
  // preflight, the receipt trail, or any other F15 gate. The user
  // can always switch tabs afterwards. The hint is read once via a
  // lazy initializer so it does not cause an extra render.
  const [actionTab, setActionTab] = React.useState<MarketsActionTab>(() =>
    initialActionTabFromQuery(),
  )
  const [amount, setAmount] = React.useState("")

  // F14 (page-level) — single F12 lifecycle gate.
  const f12Ineligible = market.transactionEligible !== true

  // F8 — most recent successful receipt.
  const [lastReceipt, setLastReceipt] = React.useState<{
    action: EarnActionKind
    txHash: `0x${string}`
  } | null>(null)
  React.useEffect(() => {
    setLastReceipt(null)
  }, [wallet.address, market.marketId, actionTab])

  const recordReceipt = React.useCallback(
    (a: EarnActionKind, txHash: `0x${string}`) => {
      setLastReceipt({ action: a, txHash })
    },
    [],
  )

  // F3A — verified onchain position + market state.
  const [refreshTick, setRefreshTick] = React.useState(0)
  const positionView = usePositionView({ market, refreshTick })

  // F2A — SUPPLY / WITHDRAW read-only gate.
  const { loanToken, readiness } = useSupplyReadiness({
    market,
    amount,
    actionTab: actionTab === "WITHDRAW" ? "WITHDRAW" : "SUPPLY",
    withdrawableData: {
      userSuppliedAssets: positionView.userSuppliedAssets,
      maxWithdrawable: positionView.maxWithdrawable,
      hasPosition: positionView.hasPosition,
    },
    refreshTick,
  })
  const supplyTokenLabel = loanToken.symbol ?? market.symbol

  // -- Approval flow (F2B / F5C) --------------------------------------
  const approvalRequired =
    readiness.kind === "approval-required" &&
    wallet.status === "connected" &&
    !!wallet.address &&
    wallet.chainId === ROBINHOOD_CHAIN_ID &&
    loanToken.address !== null

  const requiredRaw = React.useMemo<bigint | null>(() => {
    if (!approvalRequired) return null
    if (loanToken.decimals === null) return null
    const trimmed = amount.trim()
    if (!trimmed || trimmed === "0" || trimmed === "0.") return null
    const [whole, frac = ""] = trimmed.split(".")
    if (!/^[0-9]+$/.test(whole || "0") || !/^[0-9]*$/.test(frac)) return null
    if (frac.length > loanToken.decimals) return null
    const padded = (frac + "0".repeat(loanToken.decimals)).slice(
      0,
      loanToken.decimals,
    )
    const factor = pow10Big(BigInt(loanToken.decimals))
    return (
      BigInt(whole || "0") * factor + (padded ? BigInt(padded) : BigInt(0))
    )
  }, [approvalRequired, loanToken.decimals, amount])

  const approval = useApprovalTransaction({
    token:
      loanToken.address ??
      ("0x0000000000000000000000000000000000000000" as `0x${string}`),
    spender: MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho,
    amount: requiredRaw ?? BigInt(0),
    chainId: wallet.chainId ?? ROBINHOOD_CHAIN_ID,
    onSuccess: () => setRefreshTick((t) => t + 1),
  })

  const approvalRunnable =
    approvalRequired &&
    requiredRaw !== null &&
    requiredRaw > BigInt(0) &&
    !approval.isPending &&
    approval.state.stage === "idle"

  // -- Supply flow (F2C) ---------------------------------------------
  const supply = useSupplyTransaction({
    market,
    assets:
      readiness.kind === "ready"
        ? parseAmountToRaw(amount, loanToken.decimals ?? 6)
        : BigInt(0),
    decimals: loanToken.decimals ?? 6,
    tokenSymbol: supplyTokenLabel,
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      recordReceipt("SUPPLY", txHash)
    },
  })
  const supplyRunnable =
    readiness.kind === "ready" &&
    actionTab === "SUPPLY" &&
    !supply.isPending &&
    supply.state.stage === "idle"

  // -- Withdraw flow (F3B) -------------------------------------------
  const withdraw = useWithdrawTransaction({
    market,
    assets:
      readiness.kind === "ready-to-withdraw"
        ? parseAmountToRaw(amount, loanToken.decimals ?? 6)
        : BigInt(0),
    decimals: loanToken.decimals ?? 6,
    tokenSymbol: supplyTokenLabel,
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      recordReceipt("WITHDRAW", txHash)
      // P2D — broadcast a portfolio-side invalidation so any mounted
      // usePortfolio hook re-fetches /api/portfolio/positions with the
      // verified post-transaction onchain state. The bus only
      // re-triggers the existing fetchOnce pipeline; it never
      // fabricates balance deltas.
      emitDataInvalidate("withdraw-success")
    },
  })
  const withdrawRunnable =
    readiness.kind === "ready-to-withdraw" &&
    actionTab === "WITHDRAW" &&
    !withdraw.isPending &&
    withdraw.state.stage === "idle"

  // -- Borrow flow (F6A + F7A + F6B) ---------------------------------
  const borrowCapacity = useBorrowCapacity({
    market,
    collateralDecimals: market.rhTokenDecimals ?? 18,
    loanDecimals: loanToken.decimals,
    lltv:
      market.lltv != null
        ? (() => {
            const LLTV_WAD = BigInt("1000000000000000000")
            const fractionStr = market.lltv.toString()
            const [whole, frac = ""] = fractionStr.split(".")
            const padFrac = (frac + "0".repeat(18)).slice(0, 18)
            return (
              BigInt(whole || "0") * LLTV_WAD + BigInt(padFrac || "0")
            )
          })()
        : null,
    oracleAddress: (market.oracleAddress as `0x${string}` | null) ?? null,
    collateralRaw: positionView.collateral,
    borrowedAssets: positionView.borrowedAssets,
    marketFreeLiquidity: positionView.marketLiquidity,
    refreshTick,
  })

  const borrowReadiness = useBorrowReadiness({
    market,
    amount,
    loanToken: {
      address: loanToken.address,
      symbol: loanToken.symbol,
      decimals: loanToken.decimals,
    },
    capacity:
      borrowCapacity.kind === "ready"
        ? borrowCapacity.availableBorrowCapacity
        : null,
  })

  const borrowTxn = useBorrowTransaction({
    market,
    assets:
      borrowReadiness.kind === "ready-to-borrow"
        ? borrowReadiness.amount
        : BigInt(0),
    loanTokenDecimals: loanToken.decimals ?? 6,
    loanTokenSymbol: supplyTokenLabel,
    maxBorrowCapacity:
      borrowReadiness.kind === "ready-to-borrow"
        ? borrowReadiness.capacity
        : BigInt(0),
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      recordReceipt("BORROW", txHash)
    },
  })

  // -- Repay flow (F7B + F7C) ----------------------------------------
  const morphoCoreAddress = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho

  const [repayBalance, setRepayBalance] = React.useState<bigint | null>(null)
  const [repayAllowance, setRepayAllowance] = React.useState<bigint | null>(
    null,
  )

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      if (actionTab !== "REPAY") {
        setRepayBalance(null)
        setRepayAllowance(null)
        return
      }
      if (wallet.status !== "connected" || !wallet.address) {
        setRepayBalance(null)
        setRepayAllowance(null)
        return
      }
      if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
        setRepayBalance(null)
        setRepayAllowance(null)
        return
      }
      const tokenAddr = loanToken.address
      if (!tokenAddr) {
        setRepayBalance(null)
        setRepayAllowance(null)
        return
      }
      const opts = { chainId: wallet.chainId, timeoutMs: 5_000 } as const
      const balanceRes = await readErc20Balance(
        tokenAddr,
        wallet.address as `0x${string}`,
        opts,
      )
      if (cancelled) return
      setRepayBalance(
        balanceRes.kind === "ok" ? balanceRes.value : BigInt(0),
      )
      const allowanceRes = await readErc20Allowance(
        tokenAddr,
        wallet.address as `0x${string}`,
        morphoCoreAddress,
        opts,
      )
      if (cancelled) return
      setRepayAllowance(
        allowanceRes.kind === "ok" ? allowanceRes.value : BigInt(0),
      )
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    actionTab,
    wallet.status,
    wallet.address,
    wallet.chainId,
    loanToken.address,
    morphoCoreAddress,
    refreshTick,
  ])

  const repayReadiness = useRepayReadiness({
    market,
    amount,
    loanToken: {
      address: loanToken.address,
      symbol: loanToken.symbol,
      decimals: loanToken.decimals,
    },
    outstandingDebt: positionView.borrowedAssets,
    walletBalance: repayBalance,
    allowance: repayAllowance,
  })

  const repayTxn = useRepayTransaction({
    market,
    assets:
      repayReadiness.kind === "ready-to-repay" && !repayReadiness.isFullRepay
        ? repayReadiness.amount
        : BigInt(0),
    outstandingDebt: positionView.borrowedAssets ?? BigInt(0),
    borrowShares: positionView.borrowShares ?? BigInt(0),
    totalBorrowAssets:
      positionView.view.kind === "ready" && positionView.view.market
        ? positionView.view.market.totalBorrowAssets
        : BigInt(0),
    totalBorrowShares:
      positionView.view.kind === "ready" && positionView.view.market
        ? positionView.view.market.totalBorrowShares
        : BigInt(0),
    loanTokenDecimals: loanToken.decimals ?? 6,
    loanTokenSymbol: supplyTokenLabel,
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      recordReceipt("REPAY", txHash)
      // P2D — broadcast a portfolio-side invalidation. Same rationale
      // as the WITHDRAW branch above.
      emitDataInvalidate("repay-success")
    },
  })

  // -- Withdraw-Collateral flow (F7D + F6D) -------------------------
  const safeMaxWithdraw = React.useMemo<bigint | null>(() => {
    if (
      borrowCapacity.kind !== "ready" ||
      positionView.collateral === null ||
      positionView.borrowedAssets === null
    ) {
      return null
    }
    if (loanToken.decimals === null) return null
    return computeMaxSafeWithdraw(
      positionView.collateral,
      market.rhTokenDecimals ?? 18,
      loanToken.decimals,
      borrowCapacity.oraclePrice,
      positionView.borrowedAssets,
      borrowCapacity.lltv,
    )
  }, [borrowCapacity, positionView.collateral, positionView.borrowedAssets, loanToken.decimals, market.rhTokenDecimals])

  const withdrawCollateralReadiness = useWithdrawCollateralReadiness({
    market,
    amount,
    collateralToken: {
      address: (market.collateralTokenAddress as `0x${string}` | null) ?? null,
      symbol: market.collateralAssetSymbol ?? null,
      decimals:
        positionView.view.kind === "ready"
          ? positionView.view.collateralToken?.decimals ?? null
          : null,
    },
    collateralRaw: positionView.collateral,
    maxSafeWithdraw: safeMaxWithdraw,
    refreshTick,
  })

  const withdrawCollateralTxn = useWithdrawCollateralTransaction({
    market,
    assets:
      withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral"
        ? withdrawCollateralReadiness.amount
        : BigInt(0),
    collateralSymbol: market.collateralAssetSymbol ?? market.symbol,
    collateralRaw: positionView.collateral ?? BigInt(0),
    borrowedAssets: positionView.borrowedAssets ?? BigInt(0),
    collateralDecimals: market.rhTokenDecimals ?? 18,
    loanDecimals: loanToken.decimals ?? 6,
    oraclePrice:
      borrowCapacity.kind === "ready"
        ? borrowCapacity.oraclePrice
        : BigInt(0),
    lltvWad:
      borrowCapacity.kind === "ready" ? borrowCapacity.lltv : BigInt(0),
    maxSafeWithdraw:
      withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral"
        ? withdrawCollateralReadiness.maxSafeWithdraw
        : BigInt(0),
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      recordReceipt("WITHDRAW_COLLATERAL", txHash)
      // P2D — broadcast a portfolio-side invalidation. Same rationale
      // as the WITHDRAW branch above.
      emitDataInvalidate("withdraw-collateral-success")
    },
  })

  // -- Tab-aware wrong-network derivation (H2) -----------------------
  const isWrongNetwork =
    (actionTab === "SUPPLY" || actionTab === "WITHDRAW"
      ? readiness.kind === "wrong-network"
      : false) ||
    (actionTab === "BORROW"
      ? borrowReadiness.kind === "wrong-network"
      : false) ||
    (actionTab === "REPAY"
      ? repayReadiness.kind === "wrong-network"
      : false) ||
    (actionTab === "WITHDRAW_COLLATERAL"
      ? withdrawCollateralReadiness.kind === "wrong-network"
      : false)

  // -- CTA label / disabled logic -----------------------------------
  const ctaLabel = (() => {
    if (f12Ineligible) return "Not eligible"
    if (walletBusy) return "Connecting…"
    if (!walletConnected) return "Connect wallet"
    if (isWrongNetwork) return "Switch to Robinhood Chain"
    if (readiness.kind === "market-unconfigured")
      return "Market not configured"
    if (actionTab === "BORROW") {
      if (borrowTxn.isPending) {
        switch (borrowTxn.state.stage) {
          case "preparing":
            return "Simulating borrow…"
          case "awaiting_wallet":
            return "Confirm borrow in wallet…"
          case "pending":
            return "Borrow submitted…"
          default:
            break
        }
      }
      if (borrowReadiness.kind === "disconnected") return "Connect wallet"
      if (borrowReadiness.kind === "wrong-network")
        return "Switch to Robinhood Chain"
      if (borrowReadiness.kind === "loading") return "Loading…"
      if (borrowReadiness.kind === "invalid-amount") return "Enter amount"
      if (borrowReadiness.kind === "no-capacity") return "No borrow capacity"
      if (borrowReadiness.kind === "exceeds-capacity")
        return "Exceeds borrow capacity"
      if (borrowReadiness.kind === "ready-to-borrow")
        return `Borrow ${supplyTokenLabel}`
    }
    if (actionTab === "REPAY") {
      if (repayTxn.isPending) {
        switch (repayTxn.state.stage) {
          case "checking_allowance":
            return "Reading allowance…"
          case "approving":
            return "Simulating approval…"
          case "awaiting_approval_confirmation":
            return "Approval submitted…"
          case "preparing":
            return "Simulating repay…"
          case "awaiting_wallet":
            return "Confirm repay in wallet…"
          case "pending":
            return "Repay submitted…"
          default:
            break
        }
      }
      if (repayReadiness.kind === "disconnected") return "Connect wallet"
      if (repayReadiness.kind === "wrong-network")
        return "Switch to Robinhood Chain"
      if (repayReadiness.kind === "loading") return "Loading…"
      if (repayReadiness.kind === "invalid-amount") return "Enter amount"
      if (repayReadiness.kind === "no-debt") return "No outstanding debt"
      if (repayReadiness.kind === "exceeds-debt") return "Exceeds debt"
      if (repayReadiness.kind === "approval-required")
        return "Approve to repay"
      if (repayReadiness.kind === "insufficient-balance")
        return "Insufficient balance"
      if (repayReadiness.kind === "ready-to-repay")
        return repayReadiness.isFullRepay
          ? `Repay all ${supplyTokenLabel}`
          : `Repay ${supplyTokenLabel}`
    }
    if (actionTab === "WITHDRAW_COLLATERAL") {
      if (withdrawCollateralTxn.isPending) {
        switch (withdrawCollateralTxn.state.stage) {
          case "preparing":
            return "Simulating withdraw…"
          case "awaiting_wallet":
            return "Confirm withdraw in wallet…"
          case "pending":
            return "Withdraw submitted…"
          default:
            break
        }
      }
      if (withdrawCollateralReadiness.kind === "disconnected")
        return "Connect wallet"
      if (withdrawCollateralReadiness.kind === "wrong-network")
        return "Switch to Robinhood Chain"
      if (withdrawCollateralReadiness.kind === "loading") return "Loading…"
      if (withdrawCollateralReadiness.kind === "invalid-amount")
        return "Enter amount"
      if (withdrawCollateralReadiness.kind === "no-collateral")
        return "No collateral to withdraw"
      if (withdrawCollateralReadiness.kind === "no-safe-withdraw")
        return "No safe withdraw"
      if (withdrawCollateralReadiness.kind === "exceeds-safe-withdraw")
        return "Exceeds safe max"
      if (
        withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral"
      )
        return `Withdraw ${market.collateralAssetSymbol ?? market.symbol}`
    }
    if (readiness.kind === "loading") {
      if (readiness.subkind === "balance") return "Loading balance…"
      if (readiness.subkind === "allowance") return "Loading allowance…"
      return "Loading position…"
    }
    if (readiness.kind === "invalid-amount") return "Enter amount"
    if (readiness.kind === "insufficient-balance")
      return "Insufficient USDG balance"
    if (readiness.kind === "invalid-withdraw-amount") return "Enter amount"
    if (readiness.kind === "no-position") return "No position to withdraw"
    if (readiness.kind === "exceeds-supplied") return "Exceeds supplied"
    if (readiness.kind === "exceeds-withdrawable") return "Exceeds withdrawable"
    if (approvalRequired && approval.isPending) {
      switch (approval.state.stage) {
        case "simulating":
          return "Simulating approval…"
        case "awaiting_signature":
          return "Confirm approval in wallet…"
        case "submitted":
          return "Approval submitted…"
        case "confirming":
          return "Waiting for confirmation…"
      }
    }
    if (approvalRequired) return `Approve ${supplyTokenLabel} to supply`
    if (supply.isPending) {
      switch (supply.state.stage) {
        case "simulating":
          return "Simulating supply…"
        case "awaiting_signature":
          return "Confirm supply in wallet…"
        case "submitted":
          return "Supply submitted…"
        case "confirming":
          return "Waiting for confirmation…"
      }
    }
    if (withdraw.isPending) {
      switch (withdraw.state.stage) {
        case "simulating":
          return "Simulating withdraw…"
        case "awaiting_signature":
          return "Confirm withdraw in wallet…"
        case "submitted":
          return "Withdraw submitted…"
        case "confirming":
          return "Waiting for confirmation…"
      }
    }
    return actionTab === "SUPPLY"
      ? `Supply ${supplyTokenLabel}`
      : `Withdraw ${supplyTokenLabel}`
  })()

  const ctaDisabled =
    f12Ineligible ||
    walletBusy ||
    !walletConnected ||
    isWrongNetwork ||
    readiness.kind === "market-unconfigured" ||
    readiness.kind === "loading" ||
    readiness.kind === "invalid-amount" ||
    readiness.kind === "insufficient-balance" ||
    readiness.kind === "invalid-withdraw-amount" ||
    readiness.kind === "no-position" ||
    readiness.kind === "exceeds-supplied" ||
    readiness.kind === "exceeds-withdrawable" ||
    readiness.kind === "approval-required" ||
    (approvalRequired && approval.isPending) ||
    supply.isPending ||
    withdraw.isPending ||
    (actionTab === "BORROW" &&
      (borrowReadiness.kind !== "ready-to-borrow" ||
        borrowTxn.isPending)) ||
    (actionTab === "REPAY" &&
      (repayReadiness.kind !== "ready-to-repay" || repayTxn.isPending)) ||
    (actionTab === "WITHDRAW_COLLATERAL" &&
      (withdrawCollateralReadiness.kind !== "ready-to-withdraw-collateral" ||
        withdrawCollateralTxn.isPending))

  /**
   * Compact supporting copy under the primary CTA. Only show for the
   * non-obvious states (approval step, network, eligibility). The
   * label "Borrow / Repay / Supply…" already conveys intent on its own.
   * This mirrors the locked eligibility / readiness state strings —
   * presentation only, no new strings invented.
   */
  const ctaHint: string | null = (() => {
    if (!walletConnected) return "Connect your wallet to continue."
    if (isWrongNetwork) return "Switch to Robinhood Chain to continue."
    if (approvalRequired && !approval.isPending) {
      return `Approve ${supplyTokenLabel} to continue.`
    }
    if (f12Ineligible) {
      return "Not eligible · F12 lifecycle is verifying or unavailable."
    }
    if (readiness.kind === "loading") return "Loading market state…"
    if (readiness.kind === "invalid-amount" ||
        readiness.kind === "invalid-withdraw-amount") {
      return "Enter the amount you want to transact."
    }
    if (readiness.kind === "insufficient-balance") {
      return `Not enough ${supplyTokenLabel} in this wallet.`
    }
    if (readiness.kind === "no-position") {
      return "No position to withdraw."
    }
    if (readiness.kind === "exceeds-supplied") return "Exceeds supplied amount."
    if (readiness.kind === "exceeds-withdrawable") return "Exceeds withdrawable."
    return null
  })()

  // Hide hint while actively submitting — the status line handles
  // that surface so copy does not double up.
  const hideCtaHint =
    approval.isPending ||
    supply.isPending ||
    withdraw.isPending ||
    borrowTxn.isPending ||
    repayTxn.isPending ||
    withdrawCollateralTxn.isPending

  const onCtaClick = () => {
    if (!walletConnected) {
      void wallet.reconnect()
      return
    }
    if (isWrongNetwork) {
      void wallet.switchToRobinhoodChain()
      return
    }
    if (approvalRunnable) {
      void approval.approve()
      return
    }
    if (supplyRunnable) {
      void supply.supply()
      return
    }
    if (withdrawRunnable) {
      void withdraw.withdraw()
      return
    }
    if (actionTab === "BORROW") {
      if (
        borrowReadiness.kind === "ready-to-borrow" &&
        !borrowTxn.isPending
      ) {
        void borrowTxn.borrow()
      }
      return
    }
    if (actionTab === "REPAY") {
      if (
        repayReadiness.kind === "ready-to-repay" &&
        !repayTxn.isPending
      ) {
        void repayTxn.repay()
      }
      return
    }
    if (actionTab === "WITHDRAW_COLLATERAL") {
      if (
        withdrawCollateralReadiness.kind ===
          "ready-to-withdraw-collateral" &&
        !withdrawCollateralTxn.isPending
      ) {
        void withdrawCollateralTxn.withdraw()
      }
      return
    }
  }

  return (
    <section
      className="flex flex-col"
      style={{
        backgroundColor: "var(--card-soft)",
        borderRadius: "20px",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
      data-markets-action-panel
      data-action-tab={actionTab}
      data-f12-ineligible={f12Ineligible ? "true" : "false"}
    >
      <div
        style={{
          backgroundColor: "var(--background)",
          padding: "5px",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
        }}
        role="tablist"
      >
        {MARKETS_ACTION_TABS.map((t) => {
          const active = t === actionTab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActionTab(t)}
              data-market-tab={t}
              style={{
                flex: "1 1 auto",
                minWidth: "88px",
                height: "32px",
                padding: "0 12px",
                fontFamily: "var(--font-sans)",
                fontSize: "12.5px",
                fontWeight: 500,
                letterSpacing: 0,
                textAlign: "center",
                cursor: "pointer",
                border: "none",
                borderRadius: "8px",
                color: active
                  ? "var(--ink-foreground)"
                  : "var(--muted-foreground)",
                backgroundColor: active ? "var(--ink)" : "transparent",
                transition: "background-color 140ms ease-out, color 140ms ease-out",
              }}
            >
              {MARKETS_ACTION_TAB_LABELS[t]}
            </button>
          )
        })}
      </div>

      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <LifecycleChip lifecycle={lifecycleOf(market)} compact />
        {f12Ineligible ? (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11.5px",
              color: "var(--muted-foreground)",
              fontWeight: 400,
            }}
          >
            Not eligible for this action
          </span>
        ) : null}
      </div>

      <div style={{ padding: "18px 22px 8px" }}>
        <label
          htmlFor="markets-detail-amount"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--muted-foreground)",
            letterSpacing: 0,
          }}
        >
          {actionTab === "BORROW"
            ? `Borrow ${supplyTokenLabel} amount`
            : actionTab === "REPAY"
              ? `Repay ${supplyTokenLabel} amount`
              : actionTab === "WITHDRAW_COLLATERAL"
                ? `Withdraw ${market.collateralAssetSymbol ?? market.symbol} amount`
                : `${actionTab === "SUPPLY" ? "Supply" : "Withdraw"} ${supplyTokenLabel} amount`}
        </label>
        <div
          style={{
            position: "relative",
            marginTop: "8px",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            backgroundColor: "var(--background)",
          }}
          data-market-amount-wrap
        >
          <input
            id="markets-detail-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={amount}
            placeholder="0.0"
            onChange={(e) => setAmount(e.target.value)}
            data-market-amount
            style={{
              width: "100%",
              backgroundColor: "transparent",
              fontFamily: "var(--font-sans)",
              fontSize: "22px",
              fontWeight: 500,
              color: "var(--foreground)",
              letterSpacing: "-0.018em",
              border: "none",
              borderRadius: "12px",
              padding: "12px 70px 12px 14px",
              outline: "none",
            }}
            className="tabular-nums"
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--muted-foreground)",
              padding: "3px 8px",
              borderRadius: "6px",
              backgroundColor: "var(--secondary)",
              letterSpacing: "0.005em",
              pointerEvents: "none",
            }}
            data-market-amount-unit
          >
            {actionTab === "WITHDRAW_COLLATERAL"
              ? market.collateralAssetSymbol ?? market.symbol
              : supplyTokenLabel}
          </span>
        </div>
        {/* Available / capacity context — only where existing logic
            already surfaces the value. No new behavior. */}
        {(() => {
          if (actionTab === "BORROW" && borrowReadiness.kind === "ready-to-borrow") {
            return (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginTop: "6px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11.5px",
                  fontWeight: 400,
                  color: "var(--muted-foreground)",
                }}
                data-market-amount-context
              >
                <span>Available to borrow</span>
                <span className="tabular-nums" style={{ color: "var(--foreground)", fontWeight: 500 }}>
                  {borrowReadiness.capacity != null
                    ? `${borrowReadiness.capacity.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${supplyTokenLabel}`
                    : "—"}
                </span>
              </div>
            )
          }
          if (actionTab === "REPAY" && repayBalance != null && loanToken.decimals != null) {
            return (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginTop: "6px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11.5px",
                  fontWeight: 400,
                  color: "var(--muted-foreground)",
                }}
                data-market-amount-context
              >
                <span>Wallet balance</span>
                <span className="tabular-nums" style={{ color: "var(--foreground)", fontWeight: 500 }}>
                  {formatUnits(repayBalance, loanToken.decimals)} {supplyTokenLabel}
                </span>
              </div>
            )
          }
          if (
            actionTab === "WITHDRAW_COLLATERAL" &&
            withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral" &&
            withdrawCollateralReadiness.maxSafeWithdraw != null
          ) {
            return (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginTop: "6px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11.5px",
                  fontWeight: 400,
                  color: "var(--muted-foreground)",
                }}
                data-market-amount-context
              >
                <span>Safe to withdraw</span>
                <span className="tabular-nums" style={{ color: "var(--foreground)", fontWeight: 500 }}>
                  {withdrawCollateralReadiness.maxSafeWithdraw.toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
                  {market.collateralAssetSymbol ?? market.symbol}
                </span>
              </div>
            )
          }
          return null
        })()}
      </div>

      <div style={{ padding: "0 14px 0 14px" }}>
        {/* Compact approval step indicator — shown only when the
            authority logic (F2B / F5C) requires an approval and we
            are not already in an approval-in-flight state. The CTA
            below turns into "Approve USDG to supply" for this case. */}
        {approvalRequired && !approval.isPending &&
        (supply.state.stage === "idle" || supply.state.stage === null) &&
        !(borrowTxn.isPending || repayTxn.isPending || withdraw.isPending ||
          withdrawCollateralTxn.isPending) ? (
          <div
            data-market-approval-step
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              backgroundColor: "var(--background)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: "0 0 auto",
                width: "18px",
                height: "18px",
                borderRadius: "9999px",
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-sans)",
                fontSize: "11px",
                fontWeight: 600,
                marginTop: "1px",
              }}
            >
              1
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--foreground)",
                  letterSpacing: 0,
                }}
              >
                Approval required
              </div>
              <div
                style={{
                  marginTop: "2px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11.5px",
                  fontWeight: 400,
                  color: "var(--muted-foreground)",
                  lineHeight: 1.45,
                }}
              >
                Approve {supplyTokenLabel} to continue. After confirmation, the supply step runs separately.
              </div>
            </div>
          </div>
        ) : null}
        {actionTab === "SUPPLY" ? (
          <SupplyStatusLine
            stage={supply.state.stage}
            txHash={supply.state.txHash ?? null}
            errorMessage={null}
            simulationMessage={null}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => supply.reset()}
          />
        ) : null}
        {actionTab === "BORROW" ? (
          <BorrowStatusLine
            stage={borrowTxn.state.stage}
            txHash={borrowTxn.state.txHash ?? null}
            errorMessage={null}
            simulationMessage={null}
            errorStage={null}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => borrowTxn.reset()}
          />
        ) : null}
        {actionTab === "WITHDRAW_COLLATERAL" ? (
          <WithdrawCollateralStatusLine
            stage={withdrawCollateralTxn.state.stage}
            txHash={withdrawCollateralTxn.state.txHash ?? null}
            errorMessage={null}
            simulationMessage={null}
            errorStage={null}
            onDismiss={() => withdrawCollateralTxn.reset()}
          />
        ) : null}
      </div>

      <div style={{ padding: "10px 22px 20px" }}>
        <button
          type="button"
          onClick={onCtaClick}
          disabled={ctaDisabled}
          data-market-cta
          data-action-tab={actionTab}
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: "12px",
            border: "1px solid transparent",
            backgroundColor: ctaDisabled
              ? "var(--secondary)"
              : "var(--primary)",
            color: ctaDisabled
              ? "var(--muted-foreground)"
              : "var(--primary-foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            fontWeight: 600,
            letterSpacing: "0.005em",
            cursor: ctaDisabled ? "not-allowed" : "pointer",
            opacity: ctaDisabled ? 0.85 : 1,
            transition: "opacity 150ms ease-out",
          }}
        >
          {ctaLabel}
        </button>
        {/* Compact supporting copy for approval / ineligible edge states */}
        {!hideCtaHint && ctaHint ? (
          <p
            style={{
              marginTop: "8px",
              fontFamily: "var(--font-sans)",
              fontSize: "11.5px",
              lineHeight: 1.45,
              color: "var(--muted-foreground)",
              textAlign: "center",
            }}
            data-market-cta-hint
          >
            {ctaHint}
          </p>
        ) : null}
        <ActionReceiptTrail
          action={lastReceipt?.action ?? null}
          txHash={lastReceipt?.txHash ?? null}
          tokenSymbol={supplyTokenLabel}
        />
      </div>
    </section>
  )
}

function HeroApy({
  label,
  value,
  tone,
}: {
  label: string
  value: number | null
  tone: "up" | "down"
}) {
  const toneClass = value != null
    ? tone === "up"
      ? "text-up"
      : "text-down"
    : "text-foreground/40"
  return (
    <div className="flex flex-col items-start md:items-end md:text-right">
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "9.5px",
          letterSpacing: "0.12em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        className={
          "zeks-num-xl mt-1.5 " +
          toneClass
        }
      >
        {value != null ? formatApy(value) : "—"}
      </span>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "var(--card-soft)",
        padding: "10px 14px 11px",
      }}
      data-metric-cell
    >
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "9.5px",
          letterSpacing: "0.12em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums font-sans mt-1"
        style={{
          fontSize: "15px",
          color: "var(--foreground)",
          letterSpacing: "-0.015em",
          fontWeight: 400,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function MarketStructureCard({ market }: { market: LendingMarket }) {
  // Only render the card when at least one technical detail is available;
  // for mock markets it would otherwise show lots of "—".
  const hasAny =
    market.collateralAssetSymbol ||
    market.loanAssetSymbol ||
    market.marketId ||
    market.oracleAddress ||
    market.lltv !== null
  if (!hasAny) return null

  return (
    <section
      aria-label="Market structure"
      className="zeks-card overflow-hidden"
      data-market-structure-card
    >
      <header
        className="flex items-baseline justify-between gap-2 border-b border-border"
        style={{ padding: "8px 14px", minHeight: "32px" }}
        data-market-structure-header
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--foreground)",
              fontWeight: 500,
            }}
          >
            STRUCTURE
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
            Robinhood Chain · Morpho
          </span>
        </div>
        <span
          className="tabular-nums font-sans"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground)",
            fontWeight: 400,
          }}
        >
          chain {ROBINHOOD_CHAIN_ID}
        </span>
      </header>
      <dl
        className="grid grid-cols-1 md:grid-cols-2"
        style={{
          columnGap: "24px",
          rowGap: "10px",
          padding: "12px 14px 14px",
          fontSize: "11.5px",
        }}
      >
        {market.collateralAssetSymbol ? (
          <Row label="Collateral">
            <span
              className="font-sans"
              style={{
                color: "var(--foreground)",
                fontWeight: 500,
              }}
            >
              {market.collateralAssetSymbol}
            </span>
          </Row>
        ) : null}
        {market.loanAssetSymbol ? (
          <Row label="Loan">
            <span
              className="font-sans"
              style={{
                color: "var(--foreground)",
                fontWeight: 500,
              }}
            >
              {market.loanAssetSymbol}
            </span>
          </Row>
        ) : null}
        <Row label="Oracle">
          <span
            className="font-sans"
            style={{ color: "var(--foreground)" }}
          >
            {oracleLabel(market.oracleSource)}
            {market.oracleAddress ? (
              <span
                className="ml-1 zeks-tech-sm"
                style={{
                  fontSize: "10.5px",
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.02em",
                }}
              >
                {shortenAddr(market.oracleAddress)}
              </span>
            ) : null}
          </span>
        </Row>
        <Row label="Protocol">
          <span
            className="font-sans"
            style={{ color: "var(--foreground)" }}
          >
            {protocolLabel(market.protocolSource)}
          </span>
        </Row>
        <Row label="Network">
          <span
            className="font-sans"
            style={{ color: "var(--foreground)" }}
          >
            Robinhood Chain{" "}
            <span
              className="tabular-nums"
              style={{
                color: "var(--muted-foreground)",
                fontSize: "10.5px",
              }}
            >
              {ROBINHOOD_CHAIN_ID}
            </span>
          </span>
        </Row>
        {market.marketId ? (
          <Row label="Market ID">
            <span
              className="tabular-nums font-sans"
              style={{ color: "var(--foreground)" }}
            >
              {shortenAddr(market.marketId, 10, 6)}
            </span>
          </Row>
        ) : null}
        {market.lltv != null ? (
          <Row label="LLTV">
            <span
              className="tabular-nums font-sans"
              style={{ color: "var(--foreground)" }}
            >
              {(market.lltv * 100).toFixed(2)}%
            </span>
          </Row>
        ) : null}
      </dl>
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
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "9.5px",
          letterSpacing: "0.12em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: LendingMarket["status"] }) {
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-destructive/10 border border-destructive/30 zeks-eyebrow text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        PAUSED
      </span>
    )
  }
  if (status === "delisted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-secondary border border-border zeks-eyebrow text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        DELISTED
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-up/10 border border-up/30 zeks-eyebrow text-up">
      <span className="w-1.5 h-1.5 rounded-full bg-up" />
      ACTIVE
    </span>
  )
}

function SourceModeBadge({ mode }: { mode: LendingMarket["sourceMode"] }) {
  if (mode === "mock") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-destructive/10 border border-destructive/30 zeks-eyebrow text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        MOCK DATA
      </span>
    )
  }
  if (mode === "real-morpho-unlisted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 zeks-eyebrow text-amber-700 dark:text-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        UNLISTED
      </span>
    )
  }
  if (mode === "real-morpho" || mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-primary/15 border border-primary/30 zeks-eyebrow text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        LIVE
      </span>
    )
  }
  return null
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

function oracleLabel(s: LendingMarket["oracleSource"]): string {
  switch (s) {
    case "chainlink":
      return "Chainlink"
    case "robinhood-rpc":
      return "Robinhood RPC"
    case "mock":
      return "Mock"
    default:
      return "—"
  }
}

function protocolLabel(p: LendingMarket["protocolSource"]): string {
  switch (p) {
    case "morpho":
      return "Morpho"
    case "aave":
      return "Aave"
    case "robinhood-rpc":
      return "Robinhood RPC"
    case "mock":
      return "Mock"
    default:
      return "—"
  }
}

function lltvLabel(lltv: number | null): string {
  if (lltv == null) return "—"
  return `${(lltv * 100).toFixed(1)}%`
}

function listedLabel(
  listed: boolean | null,
  mode: LendingMarket["sourceMode"],
): string {
  if (mode === "mock") return "—"
  if (listed === null) return "—"
  return listed ? "Yes" : "No"
}

function shortenAddr(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

// ==============================================================
// F15 — Local amount helpers (mirrors EarnDetail local copies)
// ==============================================================
// These mirror the local helpers in EarnDetail. They are
// identically implemented and are intentionally NOT extracted to a
// shared module to avoid touching the locked F1-F14 codebase.

function pow10Big(n: bigint): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = BigInt(0); i < n; i++) r *= ten
  return r
}

function parseAmountToRaw(value: string, decimals: number): bigint {
  if (!value) return BigInt(0)
  const trimmed = value.trim()
  if (!trimmed || trimmed === "0" || trimmed === "0.") return BigInt(0)
  if (!/^[0-9]+(\.[0-9]*)?$/.test(trimmed)) return BigInt(0)
  if (trimmed === "" || trimmed === ".") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (frac.length > decimals) return BigInt(0)
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals)
  const factor = pow10Big(BigInt(decimals))
  return (
    BigInt(whole || "0") * factor + (padded ? BigInt(padded) : BigInt(0))
  )
}

/* ──────────────────────────────────────────────────────────────────
 * UI-3 visual helpers — soft sage pill, whitespace-separated metric
 * ──────────────────────────────────────────────────────────────────── */

type SoftBadgeTone = "neutral" | "up" | "soft" | "down"

function SoftBadge({
  text,
  tone = "neutral",
}: {
  text: string
  tone?: SoftBadgeTone
}) {
  const palette: Record<SoftBadgeTone, { fg: string; bg: string; bd: string }> = {
    neutral: {
      fg: "var(--foreground)",
      bg: "var(--background)",
      bd: "var(--border)",
    },
    soft: {
      fg: "var(--muted-foreground)",
      bg: "var(--card)",
      bd: "var(--border)",
    },
    up: {
      fg: "var(--up-strong)",
      bg: "var(--up-soft)",
      bd: "transparent",
    },
    down: {
      fg: "var(--down-strong)",
      bg: "var(--down-soft)",
      bd: "transparent",
    },
  }
  const p = palette[tone]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        fontFamily: "var(--font-sans)",
        fontSize: "11.5px",
        fontWeight: 500,
        color: p.fg,
        backgroundColor: p.bg,
        border: `1px solid ${p.bd}`,
        borderRadius: "999px",
        lineHeight: 1,
        letterSpacing: 0,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  )
}

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  const has = value != null && value !== "—"
  const color = !has
    ? "var(--muted-foreground)"
    : tone === "up"
      ? "var(--up-strong)"
      : tone === "down"
        ? "var(--down-strong)"
        : "var(--foreground)"
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "18px",
          fontWeight: 500,
          color,
          letterSpacing: "-0.018em",
          lineHeight: 1.15,
          marginTop: "4px",
          opacity: has ? 1 : 0.55,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function StructureRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--muted-foreground)",
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "14.5px",
          fontWeight: 500,
          color: "var(--foreground)",
          lineHeight: 1.2,
          marginTop: "6px",
          letterSpacing: "-0.01em",
        }}
      >
        {children}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * UI-3 visual mappers — status / source → friendly pill text+tone
 * ──────────────────────────────────────────────────────────────────── */

function statusText(status: LendingMarket["status"]): string {
  if (status === "paused") return "Paused"
  if (status === "delisted") return "Delisted"
  return "Active"
}
function statusTone(status: LendingMarket["status"]): SoftBadgeTone {
  if (status === "paused") return "down"
  if (status === "delisted") return "soft"
  return "up"
}

function sourceText(mode: LendingMarket["sourceMode"]): string {
  if (mode === "mock") return "Mock"
  if (mode === "real-morpho-unlisted") return "Unlisted"
  if (mode === "real-morpho" || mode === "live") return "Live"
  return "—"
}
function sourceTone(mode: LendingMarket["sourceMode"]): SoftBadgeTone {
  if (mode === "mock") return "soft"
  if (mode === "real-morpho-unlisted") return "soft"
  if (mode === "real-morpho" || mode === "live") return "up"
  return "neutral"
}

function lifecycleLabel(state: ReturnType<typeof lifecycleOf>): string {
  if (!state) return ""
  if (state === "provisional")
    return "On-chain MarketParams disagree with this row."
  if (state === "inactive")
    return "On-chain LLTV is the deployment default. Every action below is disabled."
  return "On-chain verification could not run."
}
