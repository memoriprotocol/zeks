"use client"

/**
 * UserPositionPanel
 *
 * Read-only wallet position for one lending market. Renders
 *   - Wallet connection status
 *   - Wallet balance for the collateral token
 *   - Protocol balance (supplied / borrowed) — null until the next
 *     phase wires onchain position reads
 *   - Borrow exposure
 *   - Clean "No position" state when there is none
 *   - Clean error states for disconnected / wrong-network / RPC
 *
 * NEVER infers balances from cached UI state. Every balance comes
 * from a fresh eth_call to the user's wallet or the public RPC.
 *
 * Polls every 15 seconds while connected. Re-runs on
 * accountsChanged / chainChanged from the wallet.
 *
 * P2B polish: cosmetic typography only — every fetch / hook / poll
 * / BigInt path / state machine is unchanged.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { Address } from "@/lib/wallet/types-common"
import { fetchUserLendingPosition } from "@/lib/markets/onchain"
import type {
  UserLendingPosition,
  PositionIssue,
} from "@/lib/markets/onchain"
import type { LendingMarket } from "@/lib/markets/lending"
import { formatPrice } from "@/lib/markets/format"
import { formatUnits } from "@/lib/markets/onchain/format-units"

const POLL_INTERVAL_MS = 15_000

interface UserPositionPanelProps {
  market: LendingMarket
}

export default function UserPositionPanel({ market }: UserPositionPanelProps) {
  const wallet = useWallet()
  const [position, setPosition] = React.useState<UserLendingPosition | null>(
    null,
  )
  const [loading, setLoading] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      // ethCall now defaults to ROBINHOOD_PUBLIC_RPC_URL — no wallet RPC
      // routing needed. The wallet address + chainId are still passed so
      // the onchain service can classify network state correctly.
      const pos = await fetchUserLendingPosition(market, {
        walletAddress: wallet.address as Address | null,
        walletChainId: wallet.chainId,
        // provider omitted — ethCall defaults to public RPC
      })
      setPosition(pos)
    } catch {
      // Swallow: the function itself is non-throwing, but defensively
      // guard so the panel never crashes the page.
    } finally {
      setLoading(false)
    }
  }, [market, wallet.address, wallet.chainId])

  // Initial + on wallet change.
  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while connected.
  React.useEffect(() => {
    if (wallet.status !== "connected") return
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [wallet.status, refresh])

  // ── Render: disconnected ─────────────────────────────────────
  if (wallet.status === "initializing") {
    return <StateCard label="YOUR WALLET" body="Connecting…" />
  }
  if (
    wallet.status === "idle" ||
    wallet.status === "available" ||
    wallet.status === "disconnected" ||
    !wallet.address
  ) {
    return (
      <StateCard
        label="YOUR WALLET"
        title="Wallet not connected"
        body="Connect a wallet to see your balance and position."
      />
    )
  }

  // ── Render: wrong network ────────────────────────────────────
  if (wallet.status === "wrong-network" || wallet.chainId !== 4663) {
    return (
      <StateCard
        label="YOUR WALLET"
        title={`Wrong network · chain ${wallet.chainId}`}
        body="Switch to Robinhood Chain (4663) to read your position."
      />
    )
  }

  // ── Render: still loading ────────────────────────────────────
  if (loading && !position) {
    return <StateCard label="YOUR POSITION" body="Reading onchain state…" />
  }

  if (!position) {
    return (
      <StateCard
        label="YOUR POSITION"
        title="No position"
        body="No onchain data could be loaded for this market."
      />
    )
  }

  // ── Render: rich state ───────────────────────────────────────
  return (
    <section
      className="zeks-card"
      aria-label="Your position"
      data-position-panel
    >
      <div
        className="flex items-baseline justify-between gap-3 border-b border-border"
        style={{ padding: "8px 14px", minHeight: "32px", marginBottom: "12px" }}
        data-user-position-header
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="font-sans uppercase"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "10px",
                letterSpacing: "0.1em",
                color: "var(--muted-foreground)",
                fontWeight: 500,
              }}
            >
              Wallet
            </span>
            <span aria-hidden="true" style={{ color: "var(--border-strong)" }}>
              ·
            </span>
            <span
              className="font-sans truncate"
              style={{
                fontSize: "11.5px",
                color: "var(--foreground)",
                fontWeight: 500,
                letterSpacing: "0.02em",
                lineHeight: 1.2,
              }}
            >
              {wallet.shortAddress ?? "Connected"}
            </span>
          </div>
        </div>
        <span
          className="font-sans shrink-0"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            color: "var(--muted-foreground)",
            fontWeight: 400,
            whiteSpace: "nowrap",
          }}
        >
          Robinhood Chain · 4663
        </span>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2"
        style={{ gap: "10px", padding: "0 14px 14px" }}
      >
        <BalanceCard
          label="BALANCE"
          symbol={position.walletCollateralToken?.symbol ?? market.symbol}
          balanceRaw={position.walletCollateralToken?.balanceRaw ?? null}
          decimals={position.walletCollateralToken?.decimals ?? null}
          balanceUsd={position.walletCollateralToken?.balanceUsd ?? null}
          source="wallet"
        />
        <BalanceCard
          label="POSITION"
          symbol={position.protocolSupplied?.symbol ?? "—"}
          balanceRaw={position.protocolSupplied?.balanceRaw ?? null}
          decimals={position.protocolSupplied?.decimals ?? null}
          balanceUsd={position.protocolSupplied?.balanceUsd ?? null}
          source="morpho"
          empty="No position"
        />
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        <PositionIssues issues={position.issues} />
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────── */

function StateCard({
  label,
  title,
  body,
}: {
  label: string
  title?: string
  body: string
}) {
  return (
    <section
      className="zeks-card"
      aria-label={label.toLowerCase()}
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
        {label}
      </span>
      {title ? (
        <h2
          className="zeks-section-title mt-1"
          style={{
            fontSize: "16px",
            color: "var(--foreground)",
          }}
        >
          {title}
        </h2>
      ) : null}
      <p
        className="mt-2"
        style={{
          fontSize: "12px",
          color: "var(--muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        {body}
      </p>
    </section>
  )
}

function BalanceCard({
  label,
  symbol,
  balanceRaw,
  decimals,
  balanceUsd,
  source,
  empty,
}: {
  label: string
  symbol: string
  balanceRaw: bigint | null
  decimals: number | null
  balanceUsd: number | null
  source: "wallet" | "morpho"
  empty?: string
}) {
  const isEmpty =
    balanceRaw == null ||
    decimals == null ||
    (balanceRaw === BigInt(0) && balanceUsd === null)
  if (isEmpty) {
    return (
      <div
        className="rounded-lg border border-border"
        style={{
          backgroundColor: "var(--secondary)",
          padding: "12px 14px",
        }}
        data-balance-card="empty"
      >
        <div
          className="font-sans uppercase"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          className="tabular-nums mt-1"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "18px",
            color: "var(--foreground)",
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          0 {symbol}
        </div>
        <div
          className="font-sans"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            marginTop: "4px",
            fontWeight: 400,
          }}
        >
          {empty ?? `0 ${symbol}`}
        </div>
        <div
          className="font-sans"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            color: "var(--muted-foreground)",
            marginTop: "4px",
            fontWeight: 400,
          }}
        >
          {source}
        </div>
      </div>
    )
  }

  const readable =
    decimals !== null && balanceRaw !== null
      ? formatUnits(balanceRaw, decimals)
      : "—"

  return (
    <div
      className="rounded-lg border border-border"
      style={{
        backgroundColor: "var(--secondary)",
        padding: "12px 14px",
      }}
      data-balance-card="live"
    >
      <div
        className="font-sans uppercase"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums mt-1"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "18px",
          color: "var(--foreground)",
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: "-0.015em",
        }}
      >
        {readable} {symbol}
      </div>
      <div
        className="font-sans"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          marginTop: "4px",
          fontWeight: 400,
        }}
      >
        {balanceUsd !== null
          ? `≈ ${formatPrice(balanceUsd)}`
          : ""}
      </div>
      <div
        className="font-sans"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11px",
          color: "var(--muted-foreground)",
          marginTop: "4px",
          fontWeight: 400,
        }}
      >
        {source}
      </div>
    </div>
  )
}

function PositionIssues({ issues }: { issues: PositionIssue[] }) {
  if (issues.length === 0) return null
  // Filter to user-facing issues (exclude no-position; the empty card
  // already says "No position").
  const visible = issues.filter((i) => i.kind !== "no-position")
  if (visible.length === 0) return null

  return (
    <div className="grid grid-cols-1" style={{ gap: "6px" }}>
      {visible.map((issue, i) => (
        <div
          key={i}
          className="zeks-eyebrow"
          style={{
            fontSize: "11.5px",
            padding: "8px 10px",
            borderRadius: "6px",
            border: "1px solid color-mix(in srgb, var(--destructive) 30%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--destructive) 8%, transparent)",
            color: "var(--destructive)",
            letterSpacing: "0.02em",
          }}
          data-issue={issue.kind}
        >
          {issueLabel(issue)}
        </div>
      ))}
    </div>
  )
}

function issueLabel(issue: PositionIssue): string {
  switch (issue.kind) {
    case "wallet-disconnected":
      return "Wallet disconnected."
    case "wrong-network":
      return `Wrong network (chain ${issue.chainId}). Switch to Robinhood Chain.`
    case "rpc-unavailable":
      // Raw transport errors (e.g. "TypeError: Failed to fetch")
      // MUST NOT leak to users. They are not actionable and they
      // expose internal browser detail. The RPC client already
      // retries on a polling cadence; we just show a clean state.
      return "Robinhood Chain RPC unavailable. Retrying…"
    case "unsupported-token":
      return `Token at ${shorten(issue.token)} is not supported by this view.`
    case "missing-contract":
      return `Missing contract for ${shorten(issue.token)}.`
    case "no-position":
      return "No position."
    default:
      return ""
  }
}

function shorten(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
