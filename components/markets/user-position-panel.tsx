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
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
            YOUR WALLET
          </p>
          <h2 className="font-serif text-[18px] mt-1 text-foreground">
            {wallet.shortAddress ?? "Connected"}
          </h2>
        </div>
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
          Robinhood Chain (4663)
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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

      <PositionIssues issues={position.issues} />
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
      <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
        {label}
      </p>
      {title ? (
        <h2 className="font-serif text-[18px] mt-1 text-foreground">{title}</h2>
      ) : null}
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
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
      <div className="bg-secondary/40 border border-border rounded-lg p-4">
        <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          {label}
        </div>
        <div className="text-lg font-mono tabular-nums text-foreground mt-1">
          —
        </div>
        <div className="mt-1 text-[10px] font-mono tracking-wider text-muted-foreground">
          {empty ?? `0 ${symbol}`}
        </div>
        <div className="mt-1 text-[10px] font-mono tracking-wider text-muted-foreground">
          source · {source}
        </div>
      </div>
    )
  }

  const readable =
    decimals !== null && balanceRaw !== null
      ? formatUnits(balanceRaw, decimals)
      : "—"

  return (
    <div className="bg-secondary/40 border border-border rounded-lg p-4">
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="text-xl font-mono tabular-nums text-foreground mt-1">
        {readable} {symbol}
      </div>
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground mt-1">
        {balanceUsd !== null
          ? `≈ ${formatPrice(balanceUsd)}`
          : ""}
      </div>
      <div className="mt-1 text-[10px] font-mono tracking-wider text-muted-foreground">
        source · {source}
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
    <div className="mt-3 grid grid-cols-1 gap-2">
      {visible.map((issue, i) => (
        <div
          key={i}
          className="text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
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
      return `RPC unavailable: ${issue.message}`
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
