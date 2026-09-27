"use client"

/**
 * EarnDetail
 *
 * Final visual pass — unified chart card, balanced 64/36 layout,
 * info-tabs confined to the left column only.
 *
 * Architecture (preserved):
 *   - The page segment resolves `market` server-side. This component
 *     receives `initialMarket` (resolved row) + `initialMarkets`
 *     (full Earn universe). The shared polling hook keeps both in
 *     sync.
 *   - The chart is now part of a SINGLE soft card that also contains
 *     the price header and the bottom stats strip — the previous
 *     double-nested card has been collapsed.
 *   - The action panel uses `useWallet()` for connection state
 *     and exposes a Morpho Supply / Withdraw / Borrow / Repay /
 *     Withdraw-Collateral transaction surface (F2/F3/F5/F6/F7).
 *   - The OVERVIEW / ACTIVITY / MARKET INFO tabs are now visually
 *     confined under the LEFT column only, matching the reference.
 *   - No data pipeline, no formatter, no market-id, no chart logic
 *     was invented or duplicated.
 */

import * as React from "react"
import Link from "next/link"
import AssetLogo from "@/components/asset-logo"
import AssetHistoryChart from "@/components/markets/asset-history-chart"
import { useEarnLendingMarkets } from "./use-lending-markets"
import { useSupplyReadiness } from "./use-supply-readiness"
import { useApprovalTransaction } from "./use-approval-transaction"
import { useSupplyTransaction } from "./use-supply-transaction"
import { useWithdrawTransaction } from "./use-withdraw-transaction"
import { usePositionView } from "./use-position-view"
// F6B/C/D transaction hooks — wiring layer only; no behavioral changes
// to F6 internals.
import { useBorrowTransaction } from "./use-borrow-transaction"
import { useRepayTransaction } from "./use-repay-transaction"
import { useWithdrawCollateralTransaction } from "./use-withdraw-collateral-transaction"
// F6A capacity view — feed for the F7 readiness gates.
import { useBorrowCapacity } from "./use-borrow-capacity"
// F7A/B/D read-only readiness gates (no transactions).
import { useBorrowReadiness } from "./use-borrow-readiness"
import { useRepayReadiness } from "./use-repay-readiness"
import { useWithdrawCollateralReadiness } from "./use-withdraw-collateral-readiness"
import { useWallet } from "@/components/app/wallet/use-wallet"
import {
  formatPrice,
  formatApy,
  formatUtilization,
  formatCompact,
} from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer/robinhood-chain"
import { ROBINHOOD_CHAIN_ID } from "@/lib/markets/types"
import { MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663 } from "@/lib/markets/onchain/abi"
import {
  readErc20Allowance,
  readErc20Balance,
} from "@/lib/markets/onchain/erc20"
// F6A oracle math (reused for the safe-withdraw gate).
import { maxWithdrawableCollateral as computeMaxSafeWithdraw } from "@/lib/markets/onchain/morpho-oracle"
// F8 — read-only receipt trail (display-only; no transactions).
import {
  ActionReceiptTrail,
  type EarnActionKind,
} from "./action-receipt-trail"
// F12 — display-only lifecycle chip (no transactions, no state machines).
import { LifecycleChip, lifecycleOf } from "./lifecycle-chip"
// F13 — pure relocation of the F10 status lines into a shared
// component so the Loop page (and any future consumer) can mount
// them. Behavior and rendering are preserved exactly.
import {
  SupplyStatusLine,
  BorrowStatusLine,
  WithdrawCollateralStatusLine,
} from "./transaction-status-lines"
import { emitDataInvalidate } from "@/components/markets/data-invalidate"

interface EarnDetailProps {
  initialMarket: LendingMarket
  initialMarkets: LendingMarket[]
}

const INFO_TABS = ["OVERVIEW", "ACTIVITY", "MARKET INFO"] as const
type InfoTab = (typeof INFO_TABS)[number]

const ACTION_TABS = [
  "SUPPLY",
  "WITHDRAW",
  "BORROW",
  "REPAY",
  "WITHDRAW_COLLATERAL",
] as const
type ActionTab = (typeof ACTION_TABS)[number]

/**
 * Final-pass layout:
 *
 *  ┌──────────────────────────────────────────────┬──────────────────┐
 *  │ asset header (full width)                    │                  │
 *  ├──────────────────────────────────────────────┼──────────────────┤
 *  │ unified chart card                           │ action panel     │
 *  │   - price + change + subtitle                │ (SUPPLY/WITHDRAW)│
 *  │   - timeframe controls                       │                  │
 *  │   - chart                                    │                  │
 *  │   - bottom stats strip                       │                  │
 *  ├──────────────────────────────────────────────┴──────────────────┤
 *  │ info tabs (left column width only)                              │
 *  ├──────────────────────────────────────────────────────────────────│
 *  │ footer status line                                              │
 *  └──────────────────────────────────────────────────────────────────┘
 */

export default function EarnDetail({
  initialMarket,
  initialMarkets,
}: EarnDetailProps) {
  // Responsive: stack the action panel below the chart below 960px.
  const responsiveCss = `
    @media (max-width: 960px) {
      [data-earn-detail-grid="true"],
      [data-earn-detail-info-grid="true"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      [data-earn-detail-info-spacer="true"] {
        display: none !important;
      }
    }
  `

  const { markets: liveMarkets } = useEarnLendingMarkets(
    initialMarkets,
    null,
    null,
  )
  const market = React.useMemo(() => {
    return (
      liveMarkets.find((m) => m.symbol === initialMarket.symbol) ??
      initialMarket
    )
  }, [liveMarkets, initialMarket])

  const [infoTab, setInfoTab] = React.useState<InfoTab>("OVERVIEW")
  const [actionTab, setActionTab] = React.useState<ActionTab>("SUPPLY")
  const [amount, setAmount] = React.useState("")
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle")

  const initialNowMs = React.useState(() => Date.now())[0]

  const onCopyAddress = React.useCallback(async () => {
    if (!market.contractAddress) return
    try {
      await navigator.clipboard.writeText(market.contractAddress)
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 1200)
    } catch {
      // clipboard unavailable — fail silently
    }
  }, [market.contractAddress])

  return (
    <div
      className="zeks-page"
      data-earn-detail
      style={
        {
          ["--content-max"]: "1320px",
          gap: "18px",
          paddingInline: "16px",
        } as React.CSSProperties
      }
    >
      <style>{responsiveCss}</style>

      {/* ── 1. ASSET HEADER ────────────────────────────────────── */}
      <AssetHeader market={market} />

      {/* ── 2. MAIN GRID — chart card / action panel ─────────────── */}
      <div
        className="grid"
        data-earn-detail-grid="true"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
          gap: "16px",
          alignItems: "stretch",
        }}
      >
        <ChartCard market={market} initialNowMs={initialNowMs} />
        <ActionPanel
          market={market}
          actionTab={actionTab}
          onActionTabChange={setActionTab}
          amount={amount}
          onAmountChange={setAmount}
        />
      </div>

      {/* ── 3. INFO TABS (left column width) ───────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
          gap: "16px",
          alignItems: "start",
        }}
        data-earn-detail-info-grid="true"
      >
        <InfoTabs
          market={market}
          infoTab={infoTab}
          onInfoTabChange={setInfoTab}
        />
        {/* Empty right column on info-tabs row so the panel sits
            under the left column only. */}
        <div aria-hidden="true" data-earn-detail-info-spacer />
      </div>

      {/* ── 4. FOOTER STATUS LINE ──────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div
          className="font-sans"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground)",
            paddingInline: "2px",
            fontWeight: 400,
          }}
          data-earn-detail-footer
        >
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {market.symbol}
          </span>
          <span aria-hidden="true" style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          <span>Robinhood Chain · Morpho Blue · chain {ROBINHOOD_CHAIN_ID}</span>
          {market.contractAddress ? (
            <>
              <span aria-hidden="true" style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
              <button
                type="button"
                onClick={() => void onCopyAddress()}
                className="font-sans"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  letterSpacing: "0.04em",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                {copyState === "copied" ? "Copied" : "Contract"}
              </button>
            </>
          ) : null}
          <span aria-hidden="true" style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          <Link
            href="/terminal/earn"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            ← Back to Earn
          </Link>
        </div>
        <div aria-hidden="true" />
      </div>
    </div>
  )
}

/* ============================================================== */
/* Asset header                                                    */
/* ============================================================== */

function AssetHeader({ market }: { market: LendingMarket }) {
  return (
    <header
      className="zeks-page-title-row"
      style={{
        padding: "0",
        alignItems: "flex-end",
        gap: "16px",
        rowGap: "12px",
      }}
      data-testid="earn-asset-header"
    >
      {/* LEFT — eyebrow · ticker · company · chain */}
      <div
        className="zeks-block"
        style={{ gap: "6px", minWidth: 0, flex: "1 1 auto" }}
      >
        <div
          className="flex items-center"
          style={{ gap: "8px" }}
        >
          <span
            className="zeks-label"
            style={{ color: "var(--muted-foreground)" }}
          >
            Earn
          </span>
          <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>·</span>
          <span
            className="zeks-eyebrow uppercase tabular-nums"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--muted-foreground)",
              fontWeight: 400,
            }}
          >
            {market.symbol}
          </span>
          {market.sourceMode !== "mock" ? (
            <LifecycleChip lifecycle={lifecycleOf(market)} compact />
          ) : null}
        </div>

        <div
          className="flex items-center min-w-0"
          style={{ gap: "12px" }}
        >
          <AssetLogo
            symbol={market.symbol}
            name={market.name}
            src={market.logoUrl ?? undefined}
            rhLogoUrl={market.rhLogoUrl ?? undefined}
            contractAddress={
              market.contractAddress ??
              market.rhContractAddress ??
              market.collateralTokenAddress ??
              undefined
            }
            size={40}
          />
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center min-w-0"
              style={{ gap: "10px" }}
            >
              <h1
                className="zeks-display truncate"
                style={{
                  fontSize: "28px",
                  lineHeight: 1.05,
                  letterSpacing: "-0.035em",
                  color: "var(--foreground)",
                  fontWeight: 500,
                }}
              >
                {market.symbol}
              </h1>
            </div>
            <p
              className="truncate"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "var(--foreground)",
                marginTop: "4px",
                letterSpacing: "-0.005em",
                fontWeight: 400,
              }}
            >
              {market.name}
            </p>
            <p
              className="truncate zeks-eyebrow uppercase"
              style={{
                fontSize: "10px",
                color: "var(--muted-foreground)",
                marginTop: "4px",
                letterSpacing: "0.06em",
                fontWeight: 400,
              }}
            >
              Robinhood Chain · Morpho Blue
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT — back-link + meta buttons */}
      <div
        className="flex items-center"
        style={{ gap: "8px", marginBottom: "4px" }}
      >
        <Link
          href="/terminal/earn"
          data-testid="earn-header-back"
          className="inline-flex items-center shrink-0"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10.5px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "6px 10px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            color: "var(--muted-foreground)",
            textDecoration: "none",
            lineHeight: 1.2,
            fontWeight: 500,
            whiteSpace: "nowrap",
            backgroundColor: "transparent",
          }}
        >
          ← Earn
        </Link>
        {market.contractAddress ? (
          <a
            href={explorerAddressUrl(market.contractAddress)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "10.5px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "6px 10px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              textDecoration: "none",
              lineHeight: 1.2,
              fontWeight: 500,
              whiteSpace: "nowrap",
              backgroundColor: "transparent",
            }}
          >
            Contract ↗
          </a>
        ) : null}
        <ShareButton market={market} />
      </div>
    </header>
  )
}

function ShareButton({ market }: { market: LendingMarket }) {
  const [state, setState] = React.useState<"idle" | "copied">("idle")
  const onClick = React.useCallback(async () => {
    try {
      const url = `${window.location.origin}/terminal/earn/${market.symbol}`
      await navigator.clipboard.writeText(url)
      setState("copied")
      window.setTimeout(() => setState("idle"), 1200)
    } catch {
      // ignore
    }
  }, [market.symbol])
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "10.5px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        color: "var(--foreground)",
        backgroundColor: "transparent",
        cursor: "pointer",
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {state === "copied" ? "Copied" : "Share"}
    </button>
  )
}

/* ============================================================== */
/* Unified chart card (price header + chart + stats)               */
/* ============================================================== */

function ChartCard({
  market,
  initialNowMs,
}: {
  market: LendingMarket
  initialNowMs: number
}) {
  const hasPrice =
    market.oraclePrice !== null && Number.isFinite(market.oraclePrice)

  return (
    <section
      className="flex flex-col rounded-[10px] border border-border"
      style={{
        backgroundColor: "var(--card-soft)",
        overflow: "hidden",
      }}
      data-earn-detail-chart
    >
      {/* Price header — eyebrow · symbol · big current price · subtitle */}
      <div
        style={{
          padding: "16px 18px 12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--background)",
        }}
      >
        <div className="min-w-0">
          <div
            className="flex items-center"
            style={{ gap: "6px" }}
          >
            <span
              className="zeks-label"
              style={{ color: "var(--muted-foreground)" }}
            >
              Price
            </span>
            <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>·</span>
            <span
              className="zeks-eyebrow uppercase tabular-nums"
              style={{
                fontSize: "10px",
                letterSpacing: "0.1em",
                color: "var(--muted-foreground)",
                fontWeight: 400,
              }}
            >
              on-chain
            </span>
          </div>
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "34px",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--foreground)",
              marginTop: "6px",
              fontWeight: 500,
            }}
          >
            {hasPrice ? formatPrice(market.oraclePrice) : "—"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              lineHeight: 1.4,
              color: "var(--muted-foreground)",
              marginTop: "6px",
              letterSpacing: "-0.005em",
              fontWeight: 400,
            }}
          >
            Live on-chain price · Robinhood Chain
          </div>
        </div>
        <div
          className="flex items-center"
          style={{ gap: "8px" }}
        >
          <span
            className="zeks-eyebrow uppercase shrink-0"
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              color: "var(--muted-foreground)",
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              fontWeight: 500,
              backgroundColor: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            {market.symbol}
          </span>
        </div>
      </div>

      {/* Historical chart body — production AssetHistoryChart.
          Lives inside the unified outer card; breathing padding only. */}
      <div style={{ padding: "10px 18px 14px", backgroundColor: "var(--background)" }}>
        <AssetHistoryChart
          symbol={market.symbol}
          initialNowMs={initialNowMs}
        />
      </div>

      {/* Bottom stats — terminal metrics row, inside the unified card.
          Five stats share an equal grid; APY is the primary metric. */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--card-soft)",
        }}
        data-testid="earn-chart-stats"
      >
        <Stat label="Supply APY" value={formatApy(market.supplyApy)} tone="up" primary />
        <Stat label="TVL" value={formatCompact(market.totalSupply)} />
        <Stat
          label="Liquidity"
          value={formatCompact(market.availableLiquidity)}
        />
        <Stat
          label="Utilization"
          value={formatUtilization(market.utilization)}
        />
        <Stat label="LLTV" value={lltvLabel(market)} />
      </div>
    </section>
  )
}

/* ============================================================== */
/* Action panel — 5-tab transaction surface                       */
/*   SUPPLY / WITHDRAW / BORROW / REPAY / WITHDRAW_COLLATERAL     */
/*   (locked F2/F3/F5/F6/F7 primitives)                            */
/* ============================================================== */

function ActionPanel({
  market,
  actionTab,
  onActionTabChange,
  amount,
  onAmountChange,
}: {
  market: LendingMarket
  actionTab: ActionTab
  onActionTabChange: (t: ActionTab) => void
  amount: string
  onAmountChange: (v: string) => void
}) {
  const wallet = useWallet()
  const walletConnected = wallet.status === "connected"
  const walletBusy =
    wallet.status === "connecting" || wallet.status === "initializing"

  // Parse the typed amount back into a raw bigint for the approval
  // hook. The hook is only instantiated when the readiness is
  // `approval-required`, so we know we have a valid amount + decimals
  // by the time this is reached. We re-derive the raw amount from
  // `amount` + `loanToken.decimals` to avoid stale-capture bugs.
  const [refreshTick, setRefreshTick] = React.useState(0)

  // F8 — most recent successful receipt. Populated by the F2C / F3B /
  // F6B / F6C / F6D onSuccess(txHash) callbacks. Cleared on wallet /
  // market / action-tab change so the trail never displays stale
  // context. Pure display-only state; never re-emits, never polls.
  const [lastReceipt, setLastReceipt] = React.useState<{
    action: EarnActionKind
    txHash: `0x${string}`
  } | null>(null)

  // F8 — deterministic reset on wallet address, market, or tab change.
  // The previous receipt becomes irrelevant once any of those inputs
  // shift, so we clear it instead of letting it ride across context
  // boundaries. The deps are stable primitives (string | null).
  React.useEffect(() => {
    setLastReceipt(null)
  }, [wallet.address, market.marketId, actionTab])

  /* ------------------------------------------------------ */
  /* F9 — sessionStorage-persisted action history strip.      */
  /*                                                          */
  /* Strictly extends F8:                                     */
  /*   - Mirrors the same real onchain txHash produced by the */
  /*     existing F8 success path.                            */
  /*   - Source is the SAME `setLastReceipt` callbacks        */
  /*     (real onSuccess(txHash) from the F2/F3/F6 writers). */
  /*   - No new transactions, no new approvals, no new RPC,   */
  /*     no new oracle/math, no new wallet behavior.          */
  /*   - sessionStorage ONLY. No localStorage, no DB, no API, */
  /*     no server persistence, no cross-session history.     */
  /*   - Never creates an entry from readiness state, user   */
  /*     input, pending tx, failed tx, or rejected requests.  */
  /*   - Scoped by wallet address + chainId + marketId so a  */
  /*     stored receipt from a different context is never     */
  /*     displayed against the current position.              */
  /*   - Hard-capped to MAX_HISTORY_ENTRIES (FIFO eviction).  */
  /*   - Malformed or missing sessionStorage data MUST NOT    */
  /*     crash the Earn page. All reads/writes are wrapped.   */
  /* ------------------------------------------------------ */

  type EarnHistoryEntry = {
    action: EarnActionKind
    txHash: `0x${string}`
    /** Epoch ms. */
    at: number
  }

  const MAX_HISTORY_ENTRIES = 5
  const HISTORY_STORAGE_KEY = "zeks:earn:f9:action-history:v1"

  function buildHistoryScope(): string | null {
    if (!wallet.address) return null
    if (wallet.chainId === null || wallet.chainId === undefined) return null
    if (!market.marketId) return null
    return `${wallet.address.toLowerCase()}|${wallet.chainId}|${market.marketId}`
  }

  function isValidHistoryEntry(value: unknown): value is EarnHistoryEntry {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    if (
      v.action !== "SUPPLY" &&
      v.action !== "WITHDRAW" &&
      v.action !== "BORROW" &&
      v.action !== "REPAY" &&
      v.action !== "WITHDRAW_COLLATERAL"
    ) {
      return false
    }
    if (typeof v.txHash !== "string") return false
    if (!/^0x[0-9a-fA-F]{64}$/.test(v.txHash)) return false
    if (typeof v.at !== "number" || !Number.isFinite(v.at)) return false
    return true
  }

  function readHistoryFromStorage(scope: string): EarnHistoryEntry[] {
    try {
      if (typeof window === "undefined") return []
      const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return []
      const record = parsed as Record<string, unknown>
      const list = record[scope]
      if (!Array.isArray(list)) return []
      const filtered: EarnHistoryEntry[] = []
      for (const item of list) {
        if (isValidHistoryEntry(item)) {
          filtered.push({
            action: item.action,
            txHash: item.txHash,
            at: item.at,
          })
        }
      }
      return filtered.slice(0, MAX_HISTORY_ENTRIES)
    } catch {
      return []
    }
  }

  function writeHistoryToStorage(
    scope: string,
    entries: EarnHistoryEntry[],
  ): void {
    try {
      if (typeof window === "undefined") return
      const trimmed = entries.slice(0, MAX_HISTORY_ENTRIES)
      window.sessionStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify({ [scope]: trimmed }),
      )
    } catch {
      // Quota exceeded, disabled storage, private mode, etc.
      // History is in-memory only in that case.
    }
  }

  function clearHistoryStorageForScope(scope: string): void {
    try {
      if (typeof window === "undefined") return
      const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return
      const record = parsed as Record<string, unknown>
      if (!(scope in record)) return
      delete record[scope]
      // If the record is empty, remove the key entirely to keep storage tidy.
      if (Object.keys(record).length === 0) {
        window.sessionStorage.removeItem(HISTORY_STORAGE_KEY)
      } else {
        window.sessionStorage.setItem(
          HISTORY_STORAGE_KEY,
          JSON.stringify(record),
        )
      }
    } catch {
      // Ignore — clearing is best-effort.
    }
  }

  const [historyScope, setHistoryScope] = React.useState<string | null>(null)
  const [historyEntries, setHistoryEntries] = React.useState<EarnHistoryEntry[]>(
    [],
  )

  // F9 — hydrate from sessionStorage when the active scope becomes known,
  // and clear in-memory + storage entries on context change so a
  // stale receipt never appears against the current wallet/market.
  React.useEffect(() => {
    const scope = buildHistoryScope()
    if (!scope) {
      setHistoryScope(null)
      setHistoryEntries([])
      return
    }
    if (scope !== historyScope) {
      // Context changed — drop the previous scope's storage and reload.
      if (historyScope !== null) {
        clearHistoryStorageForScope(historyScope)
      }
      setHistoryScope(scope)
      setHistoryEntries(readHistoryFromStorage(scope))
    }
    // historyScope is intentionally listed — it tracks the previous
    // value for the context-change branch above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, wallet.chainId, market.marketId])

  const appendHistoryEntry = React.useCallback(
    (entry: EarnHistoryEntry) => {
      const scope = buildHistoryScope()
      if (!scope) return
      setHistoryEntries((prev) => {
        // De-dupe: never store the same txHash twice for the same scope.
        const next: EarnHistoryEntry[] = [
          entry,
          ...prev.filter(
            (e) =>
              !(e.action === entry.action && e.txHash.toLowerCase() === entry.txHash.toLowerCase()),
          ),
        ]
        const trimmed = next.slice(0, MAX_HISTORY_ENTRIES)
        writeHistoryToStorage(scope, trimmed)
        return trimmed
      })
    },
    // buildHistoryScope reads wallet/chain/market — re-create when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallet.address, wallet.chainId, market.marketId],
  )

  function shortenHashForDisplay(hash: `0x${string}`): string {
    if (hash.length < 12) return hash
    return `${hash.slice(0, 6)}…${hash.slice(-4)}`
  }

  /**
   * Single F8 + F9 entry point. Called by every F2/F3/F6 onSuccess
   * callback that produced a real onchain txHash. Keeps F8's
   * single-slot behavior unchanged and appends to the F9 sessionStorage
   * history in the same call. Never fabricated — txHash always comes
   * from the F2/F3/F6 transaction writer's verified onSuccess path.
   */
  const recordReceipt = React.useCallback(
    (action: EarnActionKind, txHash: `0x${string}`) => {
      setLastReceipt({ action, txHash })
      appendHistoryEntry({ action, txHash, at: Date.now() })
    },
    [appendHistoryEntry],
  )

  // F3A: real onchain position + market state via the verified Morpho
  // Blue ABI. Refreshes on wallet / market / chain changes and after
  // F2C supply success (driven by refreshTick bumped in onSuccess).
  // Declared before useSupplyReadiness because the readiness gate for
  // the WITHDRAW tab consumes F3A's suppliedAssets/maxWithdrawable.
  const positionView = usePositionView({
    market,
    refreshTick,
  })
  const hasPosition = positionView.hasPosition
  const supplyShares = positionView.supplyShares

  const { loanToken, readiness, computeMaxAmount } = useSupplyReadiness({
    market,
    amount,
    actionTab,
    withdrawableData: {
      userSuppliedAssets: positionView.userSuppliedAssets,
      maxWithdrawable: positionView.maxWithdrawable,
      hasPosition: positionView.hasPosition,
    },
    refreshTick,
  })

  // The token label that should appear in the amount-input suffix and
  // on the CTA. Falls back to the collateral symbol ONLY when the
  // loan-token metadata is unconfigured — so the UI never silently
  // mislabels an actually-supplied token.
  const supplyTokenLabel = loanToken.symbol ?? market.symbol

  // -- Approval flow (F2B) ----------------------------------------------
  // We instantiate the approval hook ONLY when we actually need it:
  // the user is connected, on Robinhood Chain, the loan token is
  // configured, and allowance is below the typed amount.
  const approvalRequired =
    readiness.kind === "approval-required" &&
    wallet.status === "connected" &&
    !!wallet.address &&
    wallet.chainId === ROBINHOOD_CHAIN_ID &&
    loanToken.address !== null

  // Parse the typed amount back into a raw bigint using the
  // token's decimals. We must not substitute MAX_UINT256 here under
  // any circumstance — the hook will refuse to run otherwise.
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
    return BigInt(whole || "0") * factor + (padded ? BigInt(padded) : BigInt(0))
  }, [approvalRequired, loanToken.decimals, amount])

  const approval = useApprovalTransaction({
    token:
      loanToken.address ??
      ("0x0000000000000000000000000000000000000000" as `0x${string}`),
    spender: MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho,
    amount: requiredRaw ?? BigInt(0),
    chainId: wallet.chainId ?? ROBINHOOD_CHAIN_ID,
    onSuccess: () => {
      // Bump the readiness refresh tick — this re-reads the
      // onchain allowance and (once observedAllowance >= amount)
      // transitions readiness from `approval-required` to `ready`.
      setRefreshTick((t) => t + 1)
    },
  })

  // Don't actually call the approval hook unless we have everything
  // we need. We disable clicks in the CTA logic below as well.
  const approvalRunnable =
    approvalRequired &&
    requiredRaw !== null &&
    requiredRaw > BigInt(0) &&
    !approval.isPending &&
    approval.state.stage === "idle"

  // -- Supply flow (F2C) -----------------------------------------------
  // Instantiate the supply hook ONLY when the readiness is "ready" and the
  // user is on the SUPPLY tab. The hook is cheap (it just holds state)
  // and is safe to re-instantiate on every render with the same inputs.
  const supply = useSupplyTransaction({
    market,
    assets:
      readiness.kind === "ready"
        ? parseAmountToRaw(amount, loanToken.decimals ?? 6)
        : BigInt(0),
    decimals: loanToken.decimals ?? 6,
    tokenSymbol: supplyTokenLabel,
    onSuccess: (txHash) => {
      // After supply confirms, re-read wallet balance, allowance, and
      // Morpho position so the UI reflects the new onchain state.
      setRefreshTick((t) => t + 1)
      // F8 + F9 — record the verified txHash for the receipt trail and
      // the sessionStorage history strip. Real onchain hash only.
      recordReceipt("SUPPLY", txHash)
    },
  })

  const supplyRunnable =
    readiness.kind === "ready" &&
    actionTab === "SUPPLY" &&
    !supply.isPending &&
    supply.state.stage === "idle"

  // -- Withdraw flow (F3B) ----------------------------------------------
  // We instantiate the withdraw hook ONLY when:
  //   - user is on the WITHDRAW tab
  //   - the readiness gate is "ready-to-withdraw"
  //   - we have F3A suppliedAssets/maxWithdrawable to gate against
  // The hook re-reads position + market fresh before simulation.
  const withdraw = useWithdrawTransaction({
    market,
    assets:
      readiness.kind === "ready-to-withdraw"
        ? parseAmountToRaw(amount, loanToken.decimals ?? 6)
        : BigInt(0),
    decimals: loanToken.decimals ?? 6,
    tokenSymbol: supplyTokenLabel,
    onSuccess: (txHash) => {
      // After withdraw confirms, re-read wallet balance, allowance,
      // and Morpho position so the UI reflects the new onchain state.
      setRefreshTick((t) => t + 1)
      // F8 + F9 — record the verified txHash for the receipt trail and
      // the sessionStorage history strip. Real onchain hash only.
      recordReceipt("WITHDRAW", txHash)
      // P2D — broadcast a portfolio-side invalidation so any mounted
      // usePortfolio hook re-fetches /api/portfolio/positions with the
      // verified post-transaction onchain state.
      emitDataInvalidate("withdraw-success")
    },
  })

  const withdrawRunnable =
    readiness.kind === "ready-to-withdraw" &&
    actionTab === "WITHDRAW" &&
    !withdraw.isPending &&
    withdraw.state.stage === "idle"

  // ----------------------------------------------------------------
  // F7 — Borrow / Repay / Withdraw Collateral wiring (no UI redesign)
  // ----------------------------------------------------------------
  // These hooks are the writers + read-only gates for the three new
  // ACTION_TABS values. They consume the F5B position view (single
  // source of truth) and the verified F6A capacity. No UI/layout
  // changed — only the CTA + disabled logic at the bottom routes to
  // them per active tab.

  // F6A — verified borrow capacity & risk view. Powers the BORROW tab.
  // Passes through the verified math; no recomputation here.
  const collateralDecimalsForHooks = market.rhTokenDecimals ?? 18
  const borrowCapacity = useBorrowCapacity({
    market,
    collateralDecimals:
      positionView.view.kind === "ready"
        ? positionView.view.collateralToken?.decimals ?? collateralDecimalsForHooks
        : collateralDecimalsForHooks,
    loanDecimals: loanToken.decimals,
    lltv:
      market.lltv != null
        ? (() => {
            // F6A expects lltv as uint256 WAD; market.lltv is a 0..1 fraction.
            // Reproduce the existing service.ts conversion (multiply by 1e18).
            // This is read-only surface to a verified upstream value — no
            // new math is invented.
            const LLTV_WAD = BigInt("1000000000000000000")
            // Use BigInt math to avoid floating-point truncation.
            const fractionStr = market.lltv.toString()
            // Multiply fractionStr by 1e18 with a sane precision.
            const [whole, frac = ""] = fractionStr.split(".")
            const padFrac = (frac + "0".repeat(18)).slice(0, 18)
            return BigInt(whole || "0") * LLTV_WAD + BigInt(padFrac || "0")
          })()
        : null,
    oracleAddress:
      (market.oracleAddress as `0x${string}` | null) ?? null,
    collateralRaw: positionView.collateral,
    borrowedAssets: positionView.borrowedAssets,
    marketFreeLiquidity: positionView.marketLiquidity,
    refreshTick,
  })

  // F7A — read-only borrow gate. Source of truth for the BORROW CTA.
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

  // F6B writer — only instantiated when read-only gate is `ready-to-borrow`.
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
      // F8 + F9 — record the verified txHash for the receipt trail and
      // the sessionStorage history strip. Real onchain hash only.
      recordReceipt("BORROW", txHash)
    },
  })

  // F7B — read-only repay gate. Uses F5B borrowedAssets + the loan-token
  // ERC20 balance + the loan-token allowance to the Morpho Blue core.
  //
  // The balance and allowance for the repay path are read directly here,
  // mirroring the supply-side F2A `useSupplyReadiness` pattern (eth_call
  // against the public RPC, no provider required). The reads are scoped
  // to the REPAY tab so they only run when the user is interacting with
  // the repay path.
  //
  // The spender used here MUST match the spender the F6C writer
  // (`useRepayTransaction`) approves against, otherwise the gate would
  // pass while the transaction reverts. The supply-side approval uses
  // `MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho` and the F6C writer
  // resolves the same address via `resolveProtocolContractsForChain` —
  // both come from the verified snapshot in `lib/markets/protocol/`,
  // so reading against `MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho`
  // is the canonical single source of truth.
  const morphoCoreAddress = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho

  const [repayBalance, setRepayBalance] = React.useState<bigint | null>(null)
  const [repayAllowance, setRepayAllowance] = React.useState<bigint | null>(
    null,
  )

  React.useEffect(() => {
    let cancelled = false

    async function run() {
      // Only run reads when:
      //   - wallet is connected
      //   - REPAY tab is active
      //   - market is configured with a loan-token address
      //   - wallet is on Robinhood Chain (4663)
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

      const opts = {
        chainId: wallet.chainId,
        timeoutMs: 5_000,
      } as const

      const balanceRes = await readErc20Balance(
        tokenAddr,
        wallet.address as `0x${string}`,
        opts,
      )
      if (cancelled) return
      if (balanceRes.kind === "ok") setRepayBalance(balanceRes.value)
      else setRepayBalance(BigInt(0))

      const allowanceRes = await readErc20Allowance(
        tokenAddr,
        wallet.address as `0x${string}`,
        morphoCoreAddress,
        opts,
      )
      if (cancelled) return
      if (allowanceRes.kind === "ok") setRepayAllowance(allowanceRes.value)
      else setRepayAllowance(BigInt(0))
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

  // F6C writer — owns its own fresh allowance read, so we always pass
  // valid data. The gate's approval-required surface is for UI labeling
  // only; the writer is authoritative on actual send.
  const repayTxn = useRepayTransaction({
    market,
    assets:
      repayReadiness.kind === "ready-to-repay" &&
      !repayReadiness.isFullRepay
        ? repayReadiness.amount
        : BigInt(0),
    outstandingDebt:
      positionView.borrowedAssets ?? BigInt(0),
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
      // F8 + F9 — record the verified txHash for the receipt trail and
      // the sessionStorage history strip. Real onchain hash only.
      recordReceipt("REPAY", txHash)
      // P2D — broadcast a portfolio-side invalidation. Same rationale
      // as the WITHDRAW branch above.
      emitDataInvalidate("repay-success")
    },
  })

  // F7D — read-only collateral-withdraw gate. Computes its own safe-max
  // using the verified F6A oracle math in reverse.
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
      collateralDecimalsForHooks,
      loanToken.decimals,
      borrowCapacity.oraclePrice,
      positionView.borrowedAssets,
      borrowCapacity.lltv,
    )
  }, [borrowCapacity, positionView.collateral, positionView.borrowedAssets, loanToken.decimals, collateralDecimalsForHooks])

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

  // F6D writer — only invoked when gate is `ready-to-withdraw-collateral`.
  const withdrawCollateralTxn = useWithdrawCollateralTransaction({
    market,
    assets:
      withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral"
        ? withdrawCollateralReadiness.amount
        : BigInt(0),
    collateralSymbol: market.collateralAssetSymbol ?? market.symbol,
    collateralRaw: positionView.collateral ?? BigInt(0),
    borrowedAssets: positionView.borrowedAssets ?? BigInt(0),
    collateralDecimals:
      positionView.view.kind === "ready"
        ? positionView.view.collateralToken?.decimals ?? collateralDecimalsForHooks
        : collateralDecimalsForHooks,
    loanDecimals: loanToken.decimals ?? 6,
    oraclePrice: borrowCapacity.kind === "ready" ? borrowCapacity.oraclePrice : BigInt(0),
    lltvWad: borrowCapacity.kind === "ready" ? borrowCapacity.lltv : BigInt(0),
    maxSafeWithdraw:
      withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral"
        ? withdrawCollateralReadiness.maxSafeWithdraw
        : BigInt(0),
    onSuccess: (txHash) => {
      setRefreshTick((t) => t + 1)
      // F8 + F9 — record the verified txHash for the receipt trail and
      // the sessionStorage history strip. Real onchain hash only.
      recordReceipt("WITHDRAW_COLLATERAL", txHash)
      // P2D — broadcast a portfolio-side invalidation. Same rationale
      // as the WITHDRAW branch above.
      emitDataInvalidate("withdraw-collateral-success")
    },
  })

  // -- CTA label / disabled logic ---------------------------------------
  const ctaLabel = (() => {
    if (walletBusy) return "Connecting…"
    if (!walletConnected) return "Connect wallet"
    if (readiness.kind === "wrong-network") return "Switch to Robinhood Chain"
    if (readiness.kind === "market-unconfigured") return "Market not configured"
    if (readiness.kind === "loading") {
      if (readiness.subkind === "balance") return "Loading balance…"
      if (readiness.subkind === "allowance") return "Loading allowance…"
      return "Loading position…"
    }
    if (readiness.kind === "invalid-amount") return "Enter amount"
    if (readiness.kind === "insufficient-balance")
      return "Insufficient USDG balance"
    // WITHDRAW-specific readiness states.
    if (readiness.kind === "invalid-withdraw-amount") return "Enter amount"
    if (readiness.kind === "no-position")
      return "No position to withdraw"
    if (readiness.kind === "exceeds-supplied")
      return "Exceeds supplied"
    if (readiness.kind === "exceeds-withdrawable")
      return "Exceeds withdrawable"
    // While an approval is in flight, surface the precise stage.
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
    if (approvalRequired) {
      return `Approve ${supplyTokenLabel} to supply`
    }
    // While a supply is in flight, surface the precise stage.
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
    // While a withdraw is in flight, surface the precise stage.
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
    // -- F7 — Borrow / Repay / Withdraw Collateral CTA labels ----------
    // Each new tab short-circuits the SUPPLY/WITHDRAW labels below.

    // BORROW tab labels
    if (actionTab === "BORROW") {
      // While a borrow is in flight, surface its stage.
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
      if (borrowReadiness.kind === "no-capacity")
        return "No borrow capacity"
      if (borrowReadiness.kind === "exceeds-capacity")
        return "Exceeds borrow capacity"
      if (borrowReadiness.kind === "ready-to-borrow")
        return `Borrow ${supplyTokenLabel}`
    }

    // REPAY tab labels
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

    // WITHDRAW_COLLATERAL tab labels
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
      if (withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral")
        return `Withdraw ${market.collateralAssetSymbol ?? market.symbol}`
    }

    // ready
    return actionTab === "SUPPLY"
      ? `Supply ${supplyTokenLabel}`
      : `Withdraw ${supplyTokenLabel}`
  })()

  // H2 — tab-aware wrong-network derivation.
  // SUPPLY / WITHDRAW are gated by `useSupplyReadiness` (which correctly
  // surfaces "wrong-network" for those tabs).
  // BORROW / REPAY / WITHDRAW_COLLATERAL are gated by their dedicated F7
  // readiness hooks; `useSupplyReadiness` early-returns "loading" for those
  // tabs so we must read the dedicated hook instead.
  //
  // This constant is the single source of truth used both for the
  // CTA's click handler (route to wallet.switchToRobinhoodChain) and
  // to keep transaction actions gated across every tab. No silent
  // switch on page load; no introduction of wallet_requestPermissions.
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

  // F14 — single F12 lifecycle gate, applied uniformly to every
  // action tab (BORROW / REPAY / WITHDRAW_COLLATERAL were missing
  // this gate; WITHDRAW was already gated transitively via
  // `useSupplyReadiness`'s `market-unconfigured` state). The chip
  // is rendered separately. Mirrors the F13 loop adapter pattern.
  const f12Ineligible = market.transactionEligible !== true

  const ctaDisabled =
    walletBusy ||
    !walletConnected ||
    isWrongNetwork ||
    f12Ineligible ||
    readiness.kind === "market-unconfigured" ||
    readiness.kind === "loading" ||
    readiness.kind === "invalid-amount" ||
    readiness.kind === "insufficient-balance" ||
    readiness.kind === "invalid-withdraw-amount" ||
    readiness.kind === "no-position" ||
    readiness.kind === "exceeds-supplied" ||
    readiness.kind === "exceeds-withdrawable" ||
    (approvalRequired && approval.isPending) ||
    supply.isPending ||
    withdraw.isPending ||
    // F7 — disable when the active tab's gate says we're not ready,
    // OR when its writer transaction is currently running.
    (actionTab === "BORROW" &&
      (borrowReadiness.kind !== "ready-to-borrow" || borrowTxn.isPending)) ||
    (actionTab === "REPAY" &&
      (repayReadiness.kind !== "ready-to-repay" || repayTxn.isPending)) ||
    (actionTab === "WITHDRAW_COLLATERAL" &&
      (withdrawCollateralReadiness.kind !== "ready-to-withdraw-collateral" ||
        withdrawCollateralTxn.isPending))

  const onCtaClick = () => {
    if (!walletConnected) {
      void wallet.reconnect()
      return
    }
    if (isWrongNetwork) {
      // H2 — explicit user-triggered Switch to Robinhood Chain.
      // Routes through `useWallet`'s `switchToRobinhoodChain`, which
      // uses the bound provider (`providerRef.current`) and the
      // existing verified ROBINHOOD_CHAIN_CONFIG. No silent switching,
      // no wallet_requestPermissions, no new RPC, no new writes.
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
    // F7 routing — each new tab has exactly one runnable writer gated
    // by its F7 readiness hook. The writer itself enforces
    // simulation + receipt wait + Robinhood Chain + duplicates.
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
        withdrawCollateralReadiness.kind === "ready-to-withdraw-collateral" &&
        !withdrawCollateralTxn.isPending
      ) {
        void withdrawCollateralTxn.withdraw()
      }
      return
    }
  }

  return (
    <section
      className="flex flex-col rounded-[10px] border border-border"
      style={{
        backgroundColor: "var(--card-soft)",
        overflow: "hidden",
      }}
      data-earn-detail-action
    >
      {/* Section header — ACTION · primary tab pill */}
      <div
        className="zeks-section-header"
        style={{
          padding: "9px 14px",
          backgroundColor: "var(--card-soft)",
          borderBottomWidth: 1,
        }}
      >
        <div className="flex items-center" style={{ gap: "8px", minWidth: 0 }}>
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--foreground)",
              fontWeight: 500,
            }}
          >
            Action
          </span>
          {market.sourceMode !== "mock" ? (
            <LifecycleChip lifecycle={lifecycleOf(market)} compact />
          ) : null}
        </div>
        <span
          className="zeks-eyebrow uppercase truncate"
          style={{
            fontSize: "10px",
            letterSpacing: "0.06em",
            color: "var(--muted-foreground)",
            fontWeight: 400,
          }}
        >
          {market.symbol} · Robinhood Chain
        </span>
      </div>

      {/* Tab bar — terminal segmented control, equal-width */}
      <div
        className="flex"
        role="tablist"
        aria-label="Action"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "8px 14px 0",
          gap: "4px",
          backgroundColor: "var(--background)",
        }}
      >
        {ACTION_TABS.map((t) => {
          const active = t === actionTab
          // Display labels — WITHDRAW_COLLATERAL collapses to WITHDRAW COLL.
          const tabLabel =
            t === "WITHDRAW_COLLATERAL" ? "Withdraw collateral" : t.toLowerCase()
          const tabLabelCased =
            t === "WITHDRAW_COLLATERAL"
              ? "WITHDRAW COLLATERAL"
              : t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              data-earn-action-tab={t}
              onClick={() => onActionTabChange(t)}
              style={{
                flex: 1,
                fontFamily: "var(--font-sans)",
                fontSize: "10.5px",
                letterSpacing: "0.08em",
                padding: "7px 8px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${
                  active ? "var(--up)" : "transparent"
                }`,
                color: active
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
                cursor: "pointer",
                lineHeight: 1.2,
                fontWeight: active ? 500 : 400,
                transition: "color 140ms ease-out",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={tabLabelCased}
            >
              {tabLabelCased}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div
        className="flex flex-col"
        style={{
          padding: "16px 16px 16px",
          gap: "12px",
          backgroundColor: "var(--background)",
        }}
      >
        {/* Lifecycle banner — surfaces why the CTA is disabled
            when the asset is not transaction-eligible. Pure display,
            no behavior change. */}
        {f12Ineligible ? (
          <div
            data-earn-detail-lifecycle-banner
            style={{
              padding: "9px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              backgroundColor: "var(--card-soft)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              letterSpacing: "-0.005em",
              color: "var(--muted-foreground)",
              fontWeight: 400,
              lineHeight: 1.45,
            }}
          >
            <span
              style={{ color: "var(--foreground)", fontWeight: 500 }}
            >
              {lifecycleOf(market) === "provisional"
                ? "On-chain market parameters don't match this row."
                : lifecycleOf(market) === "inactive"
                  ? "Market is inactive on-chain."
                  : lifecycleOf(market) === "unknown"
                    ? "On-chain verification is unavailable."
                    : "Market is not transaction-eligible."}
            </span>{" "}
            Actions are disabled until the on-chain state is verified.
          </div>
        ) : null}

        {/* You-X label — tab-aware. Stays within the existing visual
            rhythm (same font, color, weight, position). */}
        <div
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.12em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
            padding: "0 2px",
          }}
        >
          {actionTab === "SUPPLY"
            ? "You supply"
            : actionTab === "WITHDRAW"
              ? "You withdraw"
              : actionTab === "BORROW"
                ? "You borrow"
                : actionTab === "REPAY"
                  ? "You repay"
                  : "You withdraw collateral"}
        </div>

        {/* Amount input — visual focus. Suffix is the LOAN asset
            symbol (USDG), not the collateral (AAPL). */}
        <div
          className="flex items-center"
          style={{
            gap: "10px",
            padding: "12px 14px",
            border: "1px solid var(--border-strong)",
            borderRadius: "8px",
            backgroundColor: "var(--card-soft)",
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            aria-label={
              actionTab === "BORROW"
                ? `Borrow ${supplyTokenLabel} amount`
                : actionTab === "REPAY"
                  ? `Repay ${supplyTokenLabel} amount`
                  : actionTab === "WITHDRAW_COLLATERAL"
                    ? `Withdraw ${market.collateralAssetSymbol ?? market.symbol} amount`
                    : `${actionTab === "SUPPLY" ? "Supply" : "Withdraw"} ${supplyTokenLabel} amount`
            }
            className="tabular-nums"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: "var(--font-sans)",
              fontSize: "22px",
              letterSpacing: "-0.015em",
              color: "var(--foreground)",
              background: "transparent",
              border: "none",
              outline: "none",
              fontWeight: 500,
            }}
          />
          <span
            className="zeks-eyebrow uppercase tabular-nums"
            style={{
              fontSize: "12px",
              letterSpacing: "0.08em",
              color: "var(--foreground)",
              fontWeight: 500,
            }}
            data-testid="earn-detail-supply-suffix"
          >
            {actionTab === "WITHDRAW_COLLATERAL"
              ? market.collateralAssetSymbol ?? market.symbol
              : supplyTokenLabel}
          </span>
          <button
            type="button"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              padding: "4px 9px",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              background: "transparent",
              color: "var(--muted-foreground)",
              cursor: walletConnected ? "pointer" : "not-allowed",
              lineHeight: 1.2,
              fontWeight: 500,
              textTransform: "uppercase",
              opacity: walletConnected ? 1 : 0.6,
            }}
            disabled={!walletConnected}
            onClick={() => {
              const v = computeMaxAmount()
              if (v !== null) onAmountChange(v)
            }}
          >
            Max
          </button>
        </div>

        {/* "to {market} market" subtle context line — clarifies what
            the loan asset is being supplied INTO. */}
        {actionTab === "SUPPLY" &&
        loanToken.symbol !== null &&
        loanToken.symbol !== market.symbol ? (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11.5px",
              letterSpacing: "-0.005em",
              color: "var(--muted-foreground)",
              fontWeight: 400,
              marginTop: "-4px",
              padding: "0 2px",
            }}
            data-testid="earn-detail-supply-context"
          >
            to {market.symbol} market
          </div>
        ) : null}

        {/* Read-only state rows — no flash of 0. */}
        <ReadStateRows
          readiness={readiness}
          wallet={wallet}
          loanTokenDecimals={loanToken.decimals}
          loanTokenSymbol={loanToken.symbol}
        />

        {/* Wallet row */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "0 2px" }}
        >
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Wallet
          </span>
          <span
            className="truncate zeks-tech-sm"
            style={{
              fontSize: "11.5px",
              letterSpacing: "0.01em",
              color: walletConnected
                ? "var(--foreground)"
                : "var(--muted-foreground)",
              maxWidth: "60%",
              fontWeight: 400,
            }}
          >
            {walletConnected
              ? shortAddress(wallet.address)
              : walletBusy
                ? "Connecting…"
                : "Not connected"}
          </span>
        </div>

        {/* Your position row — read-only, surfaced when a real
            onchain position is observed. Uses the F3A
            supplied-assets + withdrawable derivation. */}
        <PositionRow
          actionTab={actionTab}
          hasPosition={hasPosition}
          positionView={positionView}
          loanTokenDecimals={loanToken.decimals}
          loanTokenSymbol={loanToken.symbol}
        />

        {/* Market preview — quieter borders */}
        <div
          className="flex flex-col"
          style={{
            gap: "8px",
            padding: "12px 14px",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            backgroundColor: "var(--card-soft)",
          }}
        >
          <PreviewRow
            label="Supply APY"
            value={formatApy(market.supplyApy)}
            valueColor="var(--up)"
          />
          <PreviewRow
            label="Available liquidity"
            value={formatCompact(market.availableLiquidity)}
          />
          <PreviewRow
            label="Utilization"
            value={formatUtilization(market.utilization)}
          />
        </div>

        {/* Approval transaction status — shown only when an approval
            flow is in flight or has just succeeded. Keeps the UI
            honest about what the onchain state is right now. */}
        {approvalRequired &&
        (approval.state.stage !== "idle" ||
          approval.state.txHash !== null) ? (
          <ApprovalStatusLine
            stage={approval.state.stage}
            txHash={approval.state.txHash}
            errorMessage={approval.state.errorMessage}
            simulationMessage={approval.state.simulationMessage}
            observedAllowance={approval.state.observedAllowance}
            decimals={loanToken.decimals}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => approval.reset()}
          />
        ) : null}

        {/* Supply transaction status — shown when a supply flow is active. */}
        {supply.state.stage !== "idle" ? (
          <SupplyStatusLine
            stage={supply.state.stage}
            txHash={supply.state.txHash}
            errorMessage={supply.state.errorMessage}
            simulationMessage={supply.state.simulationMessage}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => supply.reset()}
          />
        ) : null}

        {/* Withdraw transaction status — shown when a withdraw flow is active. */}
        {withdraw.state.stage !== "idle" ? (
          <WithdrawStatusLine
            stage={withdraw.state.stage}
            txHash={withdraw.state.txHash}
            errorMessage={withdraw.state.errorMessage}
            simulationMessage={withdraw.state.simulationMessage}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => withdraw.reset()}
          />
        ) : null}

        {/* F10 — Borrow transaction status — shown when a borrow flow
            is active. Surfaces only the existing useBorrowTransaction
            state (stage / txHash / errorMessage / simulationMessage /
            errorStage). No new transaction logic. */}
        {borrowTxn.state.stage !== "idle" ? (
          <BorrowStatusLine
            stage={borrowTxn.state.stage}
            txHash={borrowTxn.state.txHash}
            errorMessage={borrowTxn.state.errorMessage}
            simulationMessage={borrowTxn.state.simulationMessage}
            errorStage={borrowTxn.state.errorStage}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => borrowTxn.reset()}
          />
        ) : null}

        {/* F10 — Repay transaction status — shown when a repay flow
            is active. Surfaces only the existing useRepayTransaction
            state. No new transaction logic. */}
        {repayTxn.state.stage !== "idle" ? (
          <RepayStatusLine
            stage={repayTxn.state.stage}
            txHash={repayTxn.state.txHash}
            errorMessage={repayTxn.state.errorMessage}
            simulationMessage={repayTxn.state.simulationMessage}
            errorStage={repayTxn.state.errorStage}
            tokenLabel={supplyTokenLabel}
            onDismiss={() => repayTxn.reset()}
          />
        ) : null}

        {/* F10 — Withdraw-collateral transaction status — shown when a
            withdraw-collateral flow is active. Surfaces only the
            existing useWithdrawCollateralTransaction state. No new
            transaction logic. */}
        {withdrawCollateralTxn.state.stage !== "idle" ? (
          <WithdrawCollateralStatusLine
            stage={withdrawCollateralTxn.state.stage}
            txHash={withdrawCollateralTxn.state.txHash}
            errorMessage={withdrawCollateralTxn.state.errorMessage}
            simulationMessage={withdrawCollateralTxn.state.simulationMessage}
            errorStage={withdrawCollateralTxn.state.errorStage}
            onDismiss={() => withdrawCollateralTxn.reset()}
          />
        ) : null}

        {/* CTA */}
        <button
          type="button"
          disabled={ctaDisabled}
          onClick={onCtaClick}
          data-testid="earn-detail-cta"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            height: "38px",
            padding: "0 16px",
            borderRadius: "6px",
            backgroundColor: ctaDisabled
              ? "var(--card-soft)"
              : "var(--foreground)",
            color: ctaDisabled
              ? "var(--muted-foreground)"
              : "var(--background)",
            border: `1px solid ${
              ctaDisabled ? "var(--border)" : "var(--foreground)"
            }`,
            cursor: ctaDisabled ? "not-allowed" : "pointer",
            lineHeight: 1,
            opacity: ctaDisabled ? 0.7 : 1,
            fontWeight: 500,
            marginTop: "4px",
          }}
        >
          {ctaLabel}
        </button>

        {/* F8 — read-only audit row for the most recent successful
            action. Cleared automatically when wallet / market / tab
            changes. Pure display; no transactions. */}
        <ActionReceiptTrail
          action={lastReceipt?.action ?? null}
          txHash={lastReceipt?.txHash ?? null}
          tokenSymbol={supplyTokenLabel}
        />

        {/* F9 — sessionStorage-persisted history strip. Pure
            display-only. Rendered only for the current wallet +
            chainId + marketId scope. Reads from `historyEntries`
            which is hydrated from sessionStorage on context change
            and capped at MAX_HISTORY_ENTRIES (5). Each row uses the
            same `explorerTxUrl` helper as F8. */}
        {historyEntries.length > 0 && historyScope !== null ? (
          <div
            data-testid="earn-detail-action-history"
            style={{
              marginTop: "4px",
              padding: "9px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              backgroundColor: "var(--card-soft)",
              fontFamily: "var(--font-sans)",
              fontSize: "10.5px",
              letterSpacing: "0.04em",
              color: "var(--muted-foreground)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <span
              style={{ fontWeight: 500, color: "var(--foreground)" }}
            >
              Recent receipts · {historyEntries.length}
            </span>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {historyEntries.map((entry) => (
                <li
                  key={`${entry.action}:${entry.txHash.toLowerCase()}:${entry.at}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    {entry.action === "SUPPLY"
                      ? `Supplied ${supplyTokenLabel ?? "loan"}`
                      : entry.action === "WITHDRAW"
                        ? `Withdrew ${supplyTokenLabel ?? "loan"}`
                        : entry.action === "BORROW"
                          ? `Borrowed ${supplyTokenLabel ?? "loan"}`
                          : entry.action === "REPAY"
                            ? `Repaid ${supplyTokenLabel ?? "loan"}`
                            : "Withdrew collateral"}
                  </span>
                  <a
                    href={explorerTxUrl(entry.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--foreground)",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                      fontWeight: 500,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {shortenHashForDisplay(entry.txHash)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            letterSpacing: "-0.005em",
            color: "var(--muted-foreground)",
            lineHeight: 1.5,
            marginTop: "2px",
            padding: "0 2px",
          }}
        >
          {walletConnected
            ? "Every action above is gated by F12 lifecycle, F14 readiness, and F8 receipt — no transaction runs unless the onchain state permits it."
            : "Connect a wallet on Robinhood Chain (4663) to continue."}
        </p>
      </div>
    </section>
  )
}

/* ============================================================== */
/* Approval status — compact row that surfaces the approval tx   */
/* state without re-designing the action panel.                  */
/* ============================================================== */

function ApprovalStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  observedAllowance,
  decimals,
  tokenLabel,
  onDismiss,
}: {
  stage: ReturnType<typeof useApprovalTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  observedAllowance: bigint | null
  decimals: number | null
  tokenLabel: string
  onDismiss: () => void
}) {
  // Style picks — same neutral surface as the other read-only rows.
  const base: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "10.5px",
    letterSpacing: "0.04em",
    color: "var(--muted-foreground)",
    lineHeight: 1.5,
  }
  const tone: "ok" | "warn" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "reverted" ||
          stage === "rejected" ||
          stage === "simulation-failed" ||
          stage === "rpc-error" ||
          stage === "validation-failed" ||
          stage === "timeout" ||
          stage === "wrong-network" ||
          stage === "no-provider"
        ? "err"
        : "info"

  const toneColor =
    tone === "ok"
      ? "var(--up)"
      : tone === "err"
        ? "var(--down)"
        : "var(--muted-foreground)"

  const humanStage = (() => {
    switch (stage) {
      case "simulating":
        return "Simulating approval…"
      case "awaiting_signature":
        return "Awaiting wallet signature…"
      case "submitted":
        return "Approval submitted"
      case "confirming":
        return "Waiting for confirmation…"
      case "success":
        return `Approved ${formatAllowanceShort(observedAllowance, decimals)} ${tokenLabel}`
      case "rejected":
        return "Approval rejected in wallet."
      case "reverted":
        return "Approval reverted on-chain."
      case "timeout":
        return "Approval confirmation timed out."
      case "simulation-failed":
        return simulationMessage
          ? `Approval simulation reverted: ${simulationMessage}`
          : "Approval simulation reverted."
      case "rpc-error":
        return errorMessage ?? "Approval RPC error."
      case "wrong-network":
        return "Wrong network."
      case "validation-failed":
        return errorMessage ?? "Approval validation failed."
      case "no-provider":
        return "No wallet provider available."
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="earn-detail-approval-status"
    >
      <div style={{ ...base, color: toneColor, flex: 1, minWidth: 0 }}>
        <div
          className="zeks-eyebrow uppercase"
          style={{ fontWeight: 500, letterSpacing: "0.08em" }}
        >
          Approval · {humanStage}
        </div>
        {txHash !== null ? (
          <div
            className="tabular-nums font-sans"
            style={{
              fontSize: "10.5px",
              marginTop: "2px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------ */
/* F10 — SupplyStatusLine (relocated to                    */
/* components/earn/transaction-status-lines.tsx in F13)    */
/* ------------------------------------------------------ */

function WithdrawStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  tokenLabel,
  onDismiss,
}: {
  stage: ReturnType<typeof useWithdrawTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  tokenLabel: string
  onDismiss: () => void
}) {
  const tone: "ok" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "reverted" ||
          stage === "rejected" ||
          stage === "simulation-failed" ||
          stage === "rpc-error" ||
          stage === "timeout" ||
          stage === "wrong-network" ||
          stage === "validation-failed" ||
          stage === "protocol-not-configured"
        ? "err"
        : "info"

  const toneColor = tone === "ok" ? "var(--up)" : "var(--down)"

  const humanStage = (() => {
    switch (stage) {
      case "simulating":
        return "Simulating withdraw…"
      case "awaiting_signature":
        return "Awaiting wallet signature…"
      case "submitted":
        return "Withdraw submitted…"
      case "confirming":
        return "Waiting for confirmation…"
      case "success":
        return `Withdrew ${tokenLabel}`
      case "rejected":
        return "Withdraw rejected in wallet."
      case "reverted":
        return "Withdraw reverted on-chain."
      case "timeout":
        return "Withdraw confirmation timed out."
      case "simulation-failed":
        return simulationMessage
          ? `Withdraw simulation reverted: ${simulationMessage}`
          : "Withdraw simulation reverted."
      case "rpc-error":
        return errorMessage ?? "Withdraw RPC error."
      case "wrong-network":
        return "Wrong network."
      case "validation-failed":
        return errorMessage ?? "Withdraw validation failed."
      case "protocol-not-configured":
        return errorMessage ?? "Protocol not configured."
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="earn-detail-withdraw-status"
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "10.5px",
          letterSpacing: "0.04em",
          color: toneColor,
          lineHeight: 1.5,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          className="zeks-eyebrow uppercase"
          style={{ fontWeight: 500, letterSpacing: "0.08em" }}
        >
          Withdraw · {humanStage}
        </div>
        {txHash !== null ? (
          <div
            className="tabular-nums font-sans"
            style={{
              fontSize: "10.5px",
              marginTop: "2px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------ */
/* F10 — BorrowStatusLine (relocated to                    */
/* components/earn/transaction-status-lines.tsx in F13)    */

/* ------------------------------------------------------ */
/* F10 — RepayStatusLine                                   */
/*                                                         */
/* Surfaces the existing useRepayTransaction state.       */
/* Reads only the F6C hook's existing state surface.       */
/* ------------------------------------------------------ */

function RepayStatusLine({
  stage,
  txHash,
  errorMessage,
  simulationMessage,
  errorStage,
  tokenLabel,
  onDismiss,
}: {
  stage: ReturnType<typeof useRepayTransaction>["state"]["stage"]
  txHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  errorStage: ReturnType<typeof useRepayTransaction>["state"]["errorStage"]
  tokenLabel: string
  onDismiss: () => void
}) {
  const tone: "ok" | "err" | "info" =
    stage === "success"
      ? "ok"
      : stage === "error"
        ? "err"
        : "info"

  const toneColor = tone === "ok" ? "var(--up)" : "var(--down)"

  const humanStage = (() => {
    switch (stage) {
      case "checking_allowance":
        return "Reading allowance…"
      case "approving":
        return "Approving loan token…"
      case "awaiting_approval_confirmation":
        return "Waiting for approval confirmation…"
      case "preparing":
        return "Simulating repay…"
      case "awaiting_wallet":
        return "Confirm repay in wallet…"
      case "pending":
        return "Repay submitted…"
      case "success":
        return `Repaid ${tokenLabel}`
      case "error":
        switch (errorStage) {
          case "checking_allowance":
            return errorMessage ?? "Failed to read allowance."
          case "approval-failed":
            return errorMessage ?? "Approval transaction failed."
          case "approval-rejected":
            return "Approval rejected in wallet."
          case "simulation-failed":
            return simulationMessage
              ? `Repay simulation reverted: ${simulationMessage}`
              : "Repay simulation reverted."
          case "rejected":
            return "Repay rejected in wallet."
          case "reverted":
            return "Repay reverted on-chain."
          case "timeout":
            return "Repay confirmation timed out."
          case "rpc-error":
            return errorMessage ?? "Repay RPC error."
          case "wrong-network":
            return "Wrong network."
          case "disconnected":
            return "Wallet disconnected."
          case "validation-failed":
            return errorMessage ?? "Repay validation failed."
          case "no-debt":
            return "No outstanding debt to repay."
          case "protocol-not-configured":
            return errorMessage ?? "Protocol not configured."
          case "gas-balance":
            return errorMessage ?? "Insufficient gas balance."
          case "no-provider":
            return errorMessage ?? "Wallet provider unavailable."
          case "insufficient-balance":
            return errorMessage ?? "Insufficient loan-token balance."
          default:
            return errorMessage ?? "Repay failed."
        }
      default:
        return ""
    }
  })()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="earn-detail-repay-status"
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "10.5px",
          letterSpacing: "0.04em",
          color: toneColor,
          lineHeight: 1.5,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          className="zeks-eyebrow uppercase"
          style={{ fontWeight: 500, letterSpacing: "0.08em" }}
        >
          Repay · {humanStage}
        </div>
        {txHash !== null ? (
          <div
            className="tabular-nums font-sans"
            style={{
              fontSize: "10.5px",
              marginTop: "2px",
              color: "var(--muted-foreground)",
              wordBreak: "break-all",
            }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        ) : null}
      </div>
      {tone === "err" ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------ */
/* F10 — WithdrawCollateralStatusLine                      */
/*                                                         */
/* Surfaces the existing useWithdrawCollateralTransaction  */
/* state. Reads only the F6A hook's existing state surface.*/
/* ------------------------------------------------------ */

/* F10 — WithdrawCollateralStatusLine (relocated to       */
/* components/earn/transaction-status-lines.tsx in F13)    */

function formatAllowanceShort(
  raw: bigint | null,
  decimals: number | null,
): string {
  if (raw === null || decimals === null) return "0"
  const factor = pow10Big(BigInt(decimals))
  const whole = raw / factor
  const frac = raw % factor
  if (frac === BigInt(0)) return whole.toString()
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
    .slice(0, 4)
  return `${whole.toString()}.${fracStr}`
}

/* ============================================================== */
/* Read-state rows — purely read-only                             */
/* ============================================================== */

function ReadStateRows({
  readiness,
  wallet,
  loanTokenDecimals,
  loanTokenSymbol,
}: {
  readiness: ReturnType<typeof useSupplyReadiness>["readiness"]
  wallet: ReturnType<typeof useWallet>
  loanTokenDecimals: number | null
  loanTokenSymbol: string | null
}) {
  const symbol = loanTokenSymbol ?? "loan"
  const decimals = loanTokenDecimals ?? null

  // Helper: render a raw bigint in token units to a string.
  const formatRaw = (raw: bigint | null | undefined): string => {
    if (raw === null || raw === undefined) return "—"
    if (decimals === null) return raw.toString()
    const factor = pow10Big(BigInt(decimals))
    const whole = raw / factor
    const frac = raw % factor
    if (frac === BigInt(0)) return whole.toString()
    let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
    return `${whole.toString()}.${fracStr}`
  }

  // Pull numeric fields off the readiness when present.
  let balance: bigint | null = null
  let allowance: bigint | null = null
  if (
    readiness.kind === "ready" ||
    readiness.kind === "approval-required" ||
    readiness.kind === "insufficient-balance" ||
    readiness.kind === "invalid-amount"
  ) {
    balance = readiness.balance
    allowance = readiness.allowance
  }

  // We only show balance / allowance rows when the wallet is connected
  // AND we have a reading — never a flash of "0.00".
  const showReads =
    wallet.status === "connected" &&
    balance !== null &&
    allowance !== null

  return (
    <div
      className="flex flex-col"
      style={{
        gap: "8px",
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="earn-detail-reads"
    >
      <ReadRow
        label="Available balance"
        value={
          showReads
            ? `${formatRaw(balance as bigint)} ${symbol}`
            : wallet.status === "connected"
              ? "Loading…"
              : "—"
        }
      />
      <ReadRow
        label={`Allowance to Morpho`}
        value={
          showReads
            ? `${formatRaw(allowance as bigint)} ${symbol}`
            : wallet.status === "connected"
              ? "Loading…"
              : "—"
        }
      />
      {readiness.kind === "approval-required" ? (
        <ReadRow
          label="Approval required"
          value={`${formatRaw(readiness.missing)} ${symbol}`}
          tone="muted"
        />
      ) : null}
      {readiness.kind === "insufficient-balance" ? (
        <ReadRow
          label="Insufficient"
          value={`need ${formatRaw(readiness.required)} ${symbol}`}
          tone="muted"
        />
      ) : null}
      {readiness.kind === "invalid-amount" ? (
        <ReadRow
          label="Amount"
          value={
            readiness.reason === "nan"
              ? "Invalid number"
              : readiness.reason === "negative"
                ? "Must be positive"
                : "Enter an amount"
          }
          tone="muted"
        />
      ) : null}
    </div>
  )
}

function pow10Big(n: bigint): bigint {
  let r = BigInt(1)
  const ten = BigInt(10)
  for (let i = BigInt(0); i < n; i++) r *= ten
  return r
}

function ReadRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "muted"
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
          letterSpacing: "0.01em",
          color:
            tone === "muted" ? "var(--muted-foreground)" : "var(--foreground)",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  )
}

/* ============================================================== */
/* Shared helpers — amount parsing and formatting                     */
/* ============================================================== */

function parseAmountToRaw(value: string, decimals: number): bigint {
  if (!value) return BigInt(0)
  const trimmed = value.trim()
  if (!trimmed || trimmed === "0" || trimmed === "0.") return BigInt(0)
  const [whole, frac = ""] = trimmed.split(".")
  if (!/^[0-9]+$/.test(whole || "0") || !/^[0-9]*$/.test(frac))
    return BigInt(0)
  if (frac.length > decimals) return BigInt(0)
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals)
  const factor = pow10Big(BigInt(decimals))
  return BigInt(whole || "0") * factor + (padded ? BigInt(padded) : BigInt(0))
}

/* ============================================================== */
/* Position row — read-only, shown only when a real position       */
/* is observed onchain via Morpho's `position(bytes32,address)`    */
/* and `market(bytes32)`. Phase F3A:                              */
/*   - displays the official-Morpho-derived userSuppliedAssets    */
/*   - displays max withdrawable (capped by market liquidity)      */
/*   - surfaces lastUpdate so users know the value's freshness     */
/* ============================================================== */

function PositionRow({
  actionTab,
  hasPosition,
  positionView,
  loanTokenDecimals,
  loanTokenSymbol,
}: {
  actionTab:
    | "SUPPLY"
    | "WITHDRAW"
    | "BORROW"
    | "REPAY"
    | "WITHDRAW_COLLATERAL"
  hasPosition: boolean
  positionView: ReturnType<typeof usePositionView>
  loanTokenDecimals: number | null
  loanTokenSymbol: string | null
}) {
  const symbol = loanTokenSymbol ?? "loan"
  const decimals = loanTokenDecimals ?? 6

  // Format a raw bigint (in token units) to a human-readable string.
  const formatBigint = (raw: bigint | null): string => {
    if (raw === null) return "—"
    const factor = pow10Big(BigInt(decimals))
    const whole = raw / factor
    const frac = raw % factor
    if (frac === BigInt(0)) return whole.toString()
    let fracStr = frac
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "")
    return `${whole.toString()}.${fracStr}`
  }

  // F3A spec: zero supplyShares is a legitimate zero position, not
  // an error. We still render the card when the user has zero shares
  // but the wallet is connected and the market is configured — that
  // way users see the "no supply yet" state honestly. We omit the
  // card only when disconnected / wrong-network / not-yet-read.
  const showEmptyState =
    !hasPosition &&
    positionView.view.kind === "ready" &&
    positionView.supplyShares !== null &&
    positionView.supplyShares === BigInt(0)

  const shouldRender =
    positionView.view.kind === "ready" ||
    positionView.view.kind === "loading" ||
    positionView.view.kind === "error"

  if (!shouldRender) return null
  if (!hasPosition && !showEmptyState) return null

  const isLoading = positionView.view.kind === "loading"
  const isError = positionView.view.kind === "error"

  // Format lastUpdate timestamp as UTC date string when > 0.
  const lastUpdateStr =
    positionView.lastUpdate > BigInt(0)
      ? new Date(Number(positionView.lastUpdate) * 1000).toISOString()
      : null

  return (
    <div
      className="flex flex-col"
      style={{
        gap: "8px",
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "var(--card-soft)",
      }}
      data-testid="earn-detail-position"
    >
      <div
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--foreground)",
          fontWeight: 500,
        }}
      >
        Your supply position
      </div>

      {/* Supplied assets — the canonical conversion of supplyShares. */}
      <div className="flex items-center justify-between">
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          Supplied
        </span>
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            letterSpacing: "0.01em",
            color: "var(--foreground)",
            fontWeight: 500,
          }}
          data-testid="earn-detail-position-supplied"
        >
          {isLoading
            ? "Loading…"
            : isError
              ? "—"
              : `${formatBigint(positionView.userSuppliedAssets)} ${symbol}`}
        </span>
      </div>

      {/* Withdrawable — min(suppliedAssets, marketLiquidity). */}
      <div className="flex items-center justify-between">
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          Withdrawable now
        </span>
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            letterSpacing: "0.01em",
            color: "var(--foreground)",
            fontWeight: 500,
          }}
          data-testid="earn-detail-position-withdrawable"
        >
          {isLoading
            ? "Loading…"
            : isError
              ? "—"
              : `${formatBigint(positionView.maxWithdrawable)} ${symbol}`}
        </span>
      </div>

      {/* Raw supply shares — collapsed, secondary. Shown only when
          we have a real position, so users can verify the math. */}
      {hasPosition && positionView.supplyShares !== null ? (
        <div className="flex items-center justify-between">
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Supply shares
          </span>
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11px",
              color: "var(--muted-foreground)",
              fontWeight: 400,
              letterSpacing: "0.01em",
            }}
          >
            {positionView.supplyShares.toString()}
          </span>
        </div>
      ) : null}

      {/* Free liquidity — for transparency on withdraw cap. */}
      {hasPosition && positionView.marketLiquidity !== null ? (
        <div className="flex items-center justify-between">
          <span
            className="zeks-eyebrow uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Market liquidity
          </span>
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11px",
              color: "var(--muted-foreground)",
              fontWeight: 400,
              letterSpacing: "0.01em",
            }}
          >
            {formatBigint(positionView.marketLiquidity)} {symbol}
          </span>
        </div>
      ) : null}

      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11px",
          letterSpacing: "-0.005em",
          color: "var(--muted-foreground)",
          lineHeight: 1.45,
          marginTop: "2px",
          fontWeight: 400,
        }}
      >
        {showEmptyState
          ? "No supply on this market yet."
          : isError
            ? (positionView.view.kind === "error"
                ? positionView.view.message
                : "")
            : lastUpdateStr !== null
              ? `Reflects Morpho state at last accrual (${lastUpdateStr}). Interest accrued since may not be included.`
              : "Values reflect last onchain accrual."}
      </div>
    </div>
  )
}

function PreviewRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          letterSpacing: "-0.015em",
          color: valueColor ?? "var(--foreground)",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  )
}

/* ============================================================== */
/* Info tabs (Overview / Activity / Market Info)                  */
/* ============================================================== */

function InfoTabs({
  market,
  infoTab,
  onInfoTabChange,
}: {
  market: LendingMarket
  infoTab: InfoTab
  onInfoTabChange: (t: InfoTab) => void
}) {
  return (
    <section
      className="flex flex-col rounded-[10px] border border-border"
      style={{
        backgroundColor: "var(--card-soft)",
        overflow: "hidden",
      }}
      data-earn-detail-info
    >
      <div
        className="zeks-section-header"
        style={{
          padding: "9px 14px",
          backgroundColor: "var(--card-soft)",
          borderBottomWidth: 1,
        }}
      >
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--foreground)",
            fontWeight: 500,
          }}
        >
          Market info
        </span>
      </div>
      <div
        className="flex"
        role="tablist"
        aria-label="Market information"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "8px 14px 0",
          gap: "4px",
          backgroundColor: "var(--background)",
        }}
      >
        {INFO_TABS.map((t) => {
          const active = t === infoTab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onInfoTabChange(t)}
              data-earn-info-tab={t}
              style={{
                flex: 1,
                fontFamily: "var(--font-sans)",
                fontSize: "10.5px",
                letterSpacing: "0.08em",
                padding: "7px 8px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${
                  active ? "var(--up)" : "transparent"
                }`,
                color: active
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
                cursor: "pointer",
                lineHeight: 1.2,
                fontWeight: active ? 500 : 400,
                transition: "color 140ms ease-out",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              {t}
            </button>
          )
        })}
      </div>
      <div style={{ padding: "16px 18px 18px", backgroundColor: "var(--background)" }}>
        {infoTab === "OVERVIEW" ? <OverviewBody market={market} /> : null}
        {infoTab === "ACTIVITY" ? <ActivityBody /> : null}
        {infoTab === "MARKET INFO" ? <MarketInfoBody market={market} /> : null}
      </div>
    </section>
  )
}

function OverviewBody({ market }: { market: LendingMarket }) {
  return (
    <dl
      className="grid"
      style={{
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        columnGap: "32px",
        rowGap: "12px",
      }}
    >
      <KeyValue label="Asset" value={market.symbol} />
      <KeyValue label="Market" value={market.symbol} />
      <KeyValue
        label="Supply APY"
        value={formatApy(market.supplyApy)}
        valueColor="var(--up)"
      />
      <KeyValue
        label="Liquidity"
        value={formatCompact(market.availableLiquidity)}
      />
      <KeyValue
        label="Utilization"
        value={formatUtilization(market.utilization)}
      />
      <KeyValue label="LLTV" value={lltvLabel(market)} />
      <KeyValue label="Oracle" value={oracleLabel(market)} />
      <KeyValue label="Chain" value={`Robinhood Chain · ${ROBINHOOD_CHAIN_ID}`} />
      <KeyValue
        label="Market ID"
        value={market.marketId ? shortHex(market.marketId) : "—"}
      />
      <KeyValue
        label="Loan token"
        value={market.loanAssetSymbol ?? "—"}
      />
    </dl>
  )
}

function ActivityBody() {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        padding: "40px 16px",
      }}
    >
      <p
        style={{
          fontFamily:
            "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: "12.5px",
          letterSpacing: "0.005em",
          color: "var(--muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        No activity data available yet.
      </p>
    </div>
  )
}

function MarketInfoBody({ market }: { market: LendingMarket }) {
  return (
    <dl
      className="grid"
      style={{
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        columnGap: "32px",
        rowGap: "12px",
      }}
    >
      <KeyValue label="Network" value="Robinhood Chain" />
      <KeyValue label="Chain ID" value={String(ROBINHOOD_CHAIN_ID)} />
      <KeyValue label="Protocol" value="Morpho Blue" />
      <KeyValue
        label="Contract"
        value={
          market.contractAddress
            ? shortHex(market.contractAddress)
            : "—"
        }
      />
      <KeyValue
        label="Market ID"
        value={market.marketId ? shortHex(market.marketId) : "—"}
      />
      <KeyValue
        label="Oracle"
        value={
          market.oracleAddress
            ? shortHex(market.oracleAddress)
            : oracleLabel(market)
        }
      />
      <KeyValue
        label="Loan token"
        value={
          market.loanTokenAddress
            ? shortHex(market.loanTokenAddress)
            : market.loanAssetSymbol ?? "—"
        }
      />
      <KeyValue
        label="Collateral token"
        value={
          market.collateralTokenAddress
            ? shortHex(market.collateralTokenAddress)
            : market.collateralAssetSymbol ?? "—"
        }
      />
      <KeyValue label="Status" value={market.status} />
      <KeyValue
        label="Listed"
        value={
          market.listed === null
            ? "—"
            : market.listed
              ? "Yes"
              : "No"
        }
      />
    </dl>
  )
}

function KeyValue({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <dt
        className="shrink-0"
        style={{
          fontFamily:
            "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: "12px",
          letterSpacing: "0.005em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </dt>
      <dd
        className="tabular-nums truncate text-right"
        style={{
          fontFamily:
            "DM Sans, ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: "13.5px",
          letterSpacing: "-0.005em",
          color: valueColor ?? "var(--foreground)",
          fontWeight: 500,
        }}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

/* ============================================================== */
/* Stat (terminal-style metric cell, used in chart footer row)     */
/* ============================================================== */

function Stat({
  label,
  value,
  tone,
  primary,
}: {
  label: string
  value: string
  tone?: "up"
  /** P1B — primary metric gets a slight visual emphasis. */
  primary?: boolean
}) {
  return (
    <div
      style={{
        padding: "10px 14px 11px",
        borderRight: "1px solid var(--border)",
        backgroundColor: primary ? "var(--card-soft)" : "var(--background)",
      }}
      data-earn-stat={primary ? "primary" : "secondary"}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "9.5px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: primary ? "17px" : "15px",
          lineHeight: 1.1,
          letterSpacing: primary ? "-0.022em" : "-0.015em",
          marginTop: "4px",
          color: tone === "up" ? "var(--up)" : "var(--foreground)",
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/* ============================================================== */
/* Helpers                                                         */
/* ============================================================== */

function lltvLabel(market: LendingMarket): string {
  if (market.lltv === null || !Number.isFinite(market.lltv)) return "—"
  return `${(market.lltv * 100).toFixed(2)}%`
}

function oracleLabel(market: LendingMarket): string {
  switch (market.oracleSource) {
    case "chainlink":
      return "Chainlink"
    case "robinhood-rpc":
      return "Robinhood RPC"
    case "mock":
      return "Mock"
    case "none":
      return "None"
    default:
      return "Unknown"
  }
}

function shortHex(value: string): string {
  if (value.length <= 14) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function shortAddress(value: string | null): string {
  if (!value) return "—"
  return shortHex(value)
}
