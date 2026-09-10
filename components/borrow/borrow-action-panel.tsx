"use client"

/**
 * BorrowActionPanel — Collateral + Borrow write flow.
 *
 * Two-step transaction flow per Morpho Blue canonical borrow:
 *
 *   1. supplyCollateral(collateral) → wallet confirmation #1
 *   2. borrow(loanToken, amount)      → wallet confirmation #2
 *
 * Both steps gate on the verified protocol registry. When the
 * registry is not configured for Robinhood Chain (4663), the
 * panel surfaces a clean `protocol-not-configured` state and
 * disables both actions.
 *
 * NO transactions are sent unless the user explicitly clicks
 * Approve → Supply → Borrow. There is no auto-merge, no batched
 * multicall, no optimistic success.
 *
 * LTV safety check runs BEFORE the first wallet confirmation:
 * requested borrow must remain within
 *   collateralBalance × oraclePrice × lltv.
 * If any safety input is missing, the borrow button stays
 * disabled and the reason is shown.
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  preflightBorrow,
  readErc20Allowance,
  readErc20Balance,
  sendApprove,
  sendSupplyCollateral,
  sendBorrow,
  waitForReceipt,
  resolveProtocolContractsForChain,
  MAX_UINT256,
  type PreflightIssue,
  type TxStage,
  marketParamsFromLendingMarket,
} from "@/lib/markets/onchain"
import { ROBINHOOD_CHAIN_ID_DEC } from "@/lib/markets/onchain"
import { ROBINHOOD_BLOCKSCOUT_BASE } from "@/lib/wallet/robinhood-chain"
import { formatUnits } from "@/lib/markets/onchain/format-units"
import { formatApy, formatPrice } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"

interface BorrowActionPanelProps {
  market: LendingMarket
}

type Stage =
  | "idle"
  | "user-confirming-supply"
  | "supply-submitted"
  | "supply-confirmed"
  | "user-confirming-approve"
  | "approve-submitted"
  | "approve-confirmed"
  | "user-confirming-borrow"
  | "borrow-submitted"
  | "borrow-confirmed"
  | "rejected"
  | "reverted"
  | "rpc-error"
  | "protocol-not-configured"

interface PanelState {
  stage: Stage
  supplyTxHash: `0x${string}` | null
  approveTxHash: `0x${string}` | null
  borrowTxHash: `0x${string}` | null
  errorMessage: string | null
}

const INITIAL_STATE: PanelState = {
  stage: "idle",
  supplyTxHash: null,
  approveTxHash: null,
  borrowTxHash: null,
  errorMessage: null,
}

export default function BorrowActionPanel({
  market,
}: BorrowActionPanelProps) {
  const wallet = useWallet()

  const [collateralMeta, setCollateralMeta] = React.useState<{
    address: Address
    symbol: string
    decimals: number
  } | null>(null)
  const [collateralBalance, setCollateralBalance] = React.useState<
    bigint | null
  >(null)
  const [allowance, setAllowance] = React.useState<bigint | null>(null)
  const [amountInput, setAmountInput] = React.useState<string>("")
  const [state, setState] = React.useState<PanelState>(INITIAL_STATE)
  const busyRef = React.useRef<boolean>(false)
  const [refreshTick, setRefreshTick] = React.useState(0)

  const provider: EIP1193Provider | null = React.useMemo(() => {
    if (typeof window === "undefined") return null
    return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null
  }, [])

  const protocolContracts = React.useMemo(
    () => resolveProtocolContractsForChain(wallet.chainId ?? 4663),
    [wallet.chainId],
  )
  const spender = protocolContracts.morphoBlueAddress

  // ── Read state ──────────────────────────────────────────────
  React.useEffect(() => {
    if (
      wallet.status !== "connected" ||
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC
    ) {
      setCollateralMeta(null)
      setCollateralBalance(null)
      setAllowance(null)
      return
    }
    const collateralAddress =
      (market.rhContractAddress as Address | null) ?? null
    if (!collateralAddress) {
      setCollateralMeta(null)
      setCollateralBalance(null)
      setAllowance(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const bal = await readErc20Balance(
        collateralAddress,
        wallet.address as Address,
        { provider, chainId: wallet.chainId },
      )
      if (cancelled) return
      if (bal.kind === "ok") setCollateralBalance(bal.value)
      else setCollateralBalance(null)

      const { readErc20Info } = await import("@/lib/markets/onchain/erc20")
      const info = await readErc20Info(collateralAddress, {
        provider,
        chainId: wallet.chainId,
      })
      if (cancelled) return
      if (info.kind === "ok") {
        setCollateralMeta({
          address: collateralAddress,
          symbol: info.value.symbol,
          decimals: info.value.decimals,
        })
      } else {
        setCollateralMeta({
          address: collateralAddress,
          symbol: market.symbol,
          decimals: market.rhTokenDecimals ?? 18,
        })
      }

      const alw = await readErc20Allowance(
        collateralAddress,
        wallet.address as Address,
        (spender ?? "0x0000000000000000000000000000000000000000") as Address,
        { provider, chainId: wallet.chainId },
      )
      if (cancelled) return
      if (alw.kind === "ok") setAllowance(alw.value)
      else setAllowance(null)
    })()
    return () => {
      cancelled = true
    }
  }, [
    refreshTick,
    market.symbol,
    market.rhTokenDecimals,
    market.rhContractAddress,
    wallet.status,
    wallet.address,
    wallet.chainId,
    spender,
    provider,
  ])

  // ── Derived state ────────────────────────────────────────────
  const parsedAmount = parseAmount(amountInput, 18)
  const preflight = usePreflight({
    market,
    walletAddress: wallet.address as Address | null,
    walletChainId: wallet.chainId,
    walletProvider: provider,
    amount: parsedAmount?.bigint ?? null,
  })

  const readiness = resolveAction({
    walletStatus: wallet.status,
    collateralMeta,
    collateralBalance,
    parsedAmount,
    market,
    spender,
    preflightIssues: preflight.issues,
    stage: state.stage,
  })

  // ── Step 1: Approve + supplyCollateral ──────────────────────
  const onSupplyCollateral = React.useCallback(async () => {
    if (busyRef.current) return
    if (
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC ||
      !provider ||
      !collateralMeta ||
      !spender ||
      parsedAmount == null ||
      parsedAmount.bigint <= BigInt(0)
    ) {
      return
    }
    busyRef.current = true
    setState({ ...INITIAL_STATE, stage: "user-confirming-supply" })
    try {
      // Approve collateral
      const approveRes = await sendApprove({
        provider,
        from: wallet.address as Address,
        token: collateralMeta.address,
        spender,
        amount: MAX_UINT256,
      })
      if (!approveRes.ok) {
        return setState(
          stageOnly(stageFor(approveRes.error.stage), approveRes.error.message),
        )
      }
      setState((s) => ({
        ...s,
        stage: "approve-submitted",
        approveTxHash: approveRes.txHash,
      }))
      const approveReceipt = await waitForReceipt(
        provider,
        approveRes.txHash,
      )
      if (!approveReceipt.ok) {
        return setState({
          stage: stageFor(approveReceipt.error.stage),
          supplyTxHash: null,
          approveTxHash: approveRes.txHash,
          borrowTxHash: null,
          errorMessage: approveReceipt.error.message,
        })
      }

      // supplyCollateral
      let marketParams = null
      try {
        marketParams = marketParamsFromLendingMarket({
          loanTokenAddress:
            (market as LendingMarket & { loanTokenAddress?: string | null })
              .loanTokenAddress as Address ?? null,
          collateralTokenAddress: collateralMeta.address,
          oracleAddress: market.oracleAddress,
          irmAddress:
            (market as LendingMarket & { irmAddress?: string | null })
              .irmAddress ?? null,
          lltvFraction: market.lltv,
        })
      } catch {
        marketParams = null
      }
      const res = await sendSupplyCollateral({
        provider,
        from: wallet.address as Address,
        marketParams,
        assets: parsedAmount.bigint,
        onBehalf: wallet.address as Address,
        receiver: wallet.address as Address,
        contracts: protocolContracts,
        chainId: wallet.chainId,
      })
      if (!res.ok) {
        return setState(
          stageOnly(stageFor(res.error.stage), res.error.message),
        )
      }
      setState((s) => ({
        ...s,
        stage: "supply-submitted",
        supplyTxHash: res.txHash,
      }))
      const receipt = await waitForReceipt(provider, res.txHash)
      if (!receipt.ok) {
        return setState({
          stage: stageFor(receipt.error.stage),
          supplyTxHash: res.txHash,
          approveTxHash: null,
          borrowTxHash: null,
          errorMessage: receipt.error.message,
        })
      }
      setState((s) => ({
        ...s,
        stage: "supply-confirmed",
        supplyTxHash: res.txHash,
      }))
      setRefreshTick((t) => t + 1)
    } catch (err) {
      setState(
        stageOnly(
          "rpc-error",
          err instanceof Error ? err.message : String(err),
        ),
      )
    } finally {
      busyRef.current = false
    }
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    collateralMeta,
    spender,
    parsedAmount,
    market,
    protocolContracts,
  ])

  // ── Step 2: Borrow ──────────────────────────────────────────
  const onBorrow = React.useCallback(async () => {
    if (busyRef.current) return
    if (
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC ||
      !provider ||
      !spender ||
      parsedAmount == null ||
      parsedAmount.bigint <= BigInt(0)
    ) {
      return
    }
    busyRef.current = true
    setState((s) => ({ ...s, stage: "user-confirming-borrow" }))
    try {
      let marketParams = null
      try {
        marketParams = marketParamsFromLendingMarket({
          loanTokenAddress:
            (market as LendingMarket & { loanTokenAddress?: string | null })
              .loanTokenAddress as Address ?? null,
          collateralTokenAddress:
            (market as LendingMarket & { collateralTokenAddress?: string | null })
              .collateralTokenAddress as Address ?? null,
          oracleAddress: market.oracleAddress,
          irmAddress:
            (market as LendingMarket & { irmAddress?: string | null })
              .irmAddress ?? null,
          lltvFraction: market.lltv,
        })
      } catch {
        marketParams = null
      }
      const res = await sendBorrow({
        provider,
        from: wallet.address as Address,
        marketParams,
        assets: parsedAmount.bigint,
        shares: BigInt(0),
        onBehalf: wallet.address as Address,
        receiver: wallet.address as Address,
        contracts: protocolContracts,
        chainId: wallet.chainId,
      })
      if (!res.ok) {
        return setState(
          stageOnly(stageFor(res.error.stage), res.error.message),
        )
      }
      setState((s) => ({
        ...s,
        stage: "borrow-submitted",
        borrowTxHash: res.txHash,
      }))
      const receipt = await waitForReceipt(provider, res.txHash)
      if (!receipt.ok) {
        return setState({
          stage: stageFor(receipt.error.stage),
          supplyTxHash: null,
          approveTxHash: null,
          borrowTxHash: res.txHash,
          errorMessage: receipt.error.message,
        })
      }
      setState((s) => ({
        ...s,
        stage: "borrow-confirmed",
        borrowTxHash: res.txHash,
      }))
      setRefreshTick((t) => t + 1)
    } catch (err) {
      setState(
        stageOnly(
          "rpc-error",
          err instanceof Error ? err.message : String(err),
        ),
      )
    } finally {
      busyRef.current = false
    }
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    spender,
    parsedAmount,
    market,
    protocolContracts,
  ])

  const onMax = React.useCallback(() => {
    if (collateralBalance == null || collateralMeta == null) return
    setAmountInput(formatUnits(collateralBalance, collateralMeta.decimals))
  }, [collateralBalance, collateralMeta])

  const resetState = React.useCallback(() => {
    if (busyRef.current) return
    setState(INITIAL_STATE)
  }, [])

  // ── Render: disconnected / wrong chain / unconfigured ────────
  if (wallet.status === "initializing") {
    return <Banner title="BORROW" body="Connecting…" />
  }
  if (!wallet.address) {
    return (
      <Banner
        title="BORROW"
        body="Connect a wallet to borrow from this market."
        primary="Connect wallet"
        onPrimary={() => wallet.reconnect().catch(() => undefined)}
      />
    )
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return (
      <Banner
        title="BORROW"
        body={`Switch to Robinhood Chain (4663). Currently on chain ${wallet.chainId}.`}
        primary="Switch to Robinhood Chain"
        onPrimary={() =>
          wallet.switchToRobinhoodChain().catch(() => undefined)
        }
      />
    )
  }
  if (!spender) {
    return (
      <Banner
        title="BORROW COMING SOON"
        body={
          "Borrow from this market is not available yet. The verified " +
          "Morpho Blue core address and bytecode-checked selectors " +
          "(supplyCollateral, borrow) have not been committed to the " +
          "protocol registry yet."
        }
        tone="warn"
      />
    )
  }
  if (!market.marketId) {
    return (
      <Banner
        title="BORROW DISABLED"
        body="This market has no onchain market id (mock or unknown source)."
        tone="warn"
      />
    )
  }

  // ── Render: rich state ───────────────────────────────────────
  const balanceHuman =
    collateralMeta && collateralBalance != null
      ? formatUnits(collateralBalance, collateralMeta.decimals)
      : "—"
  const allowanceHuman =
    collateralMeta && allowance != null
      ? formatUnits(allowance, collateralMeta.decimals)
      : "—"

  return (
    <section
      className="zeks-card"
      aria-label="Borrow action"
      data-borrow-panel
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            BORROW
          </p>
          <h2 className="font-serif text-[18px] mt-1 text-foreground">
            {market.symbol}
          </h2>
        </div>
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
          {market.rhContractAddress
            ? `Collateral ${market.rhContractAddress.slice(0, 6)}…${market.rhContractAddress.slice(-4)}`
            : "Collateral —"}
        </span>
      </div>

      {/* Amount input = collateral to deposit */}
      <div className="mb-4">
        <label
          htmlFor="borrow-collateral-amount"
          className="text-[10px] font-mono tracking-wider text-muted-foreground/70"
        >
          COLLATERAL AMOUNT
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input
            id="borrow-collateral-amount"
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "")
              const parts = v.split(".")
              const sanitized =
                parts.length > 2
                  ? `${parts[0]}.${parts.slice(1).join("")}`
                  : v
              setAmountInput(sanitized)
            }}
            disabled={!readiness.canEditAmount}
            placeholder="0.00"
            className="flex-1 bg-secondary/40 border border-border rounded-md px-3 py-2 font-mono tabular-nums text-foreground placeholder:text-muted-foreground/50"
            data-borrow-amount
          />
          <button
            type="button"
            onClick={onMax}
            disabled={!readiness.canEditAmount}
            className="text-[10px] font-mono tracking-wider px-2 py-1.5 rounded border border-border bg-secondary/30 text-foreground hover:bg-secondary/50 disabled:opacity-50"
            data-borrow-max
          >
            MAX
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-[11px]">
        <Stat
          label="COLLATERAL BALANCE"
          value={
            collateralMeta
              ? `${balanceHuman} ${collateralMeta.symbol}`
              : `${balanceHuman}`
          }
        />
        <Stat
          label="CURRENT ALLOWANCE"
          value={
            collateralMeta
              ? `${allowanceHuman} ${collateralMeta.symbol}`
              : `${allowanceHuman}`
          }
        />
        <Stat
          label="BORROW APY"
          value={formatApy(market.borrowApy)}
        />
        <Stat
          label="LLTV"
          value={
            market.lltv != null
              ? `${(market.lltv * 100).toFixed(2)}%`
              : "—"
          }
        />
        <Stat
          label="AVAILABLE LIQUIDITY"
          value={
            market.availableLiquidity != null
              ? formatPrice(market.availableLiquidity)
              : "—"
          }
        />
        <Stat
          label="ORACLE PRICE"
          value={
            market.oraclePrice != null
              ? formatPrice(market.oraclePrice)
              : "—"
          }
        />
      </div>

      <ActionArea
        stage={state.stage}
        supplyHash={state.supplyTxHash}
        approveHash={state.approveTxHash}
        borrowHash={state.borrowTxHash}
        errorMessage={state.errorMessage}
        readiness={readiness}
        wallet={wallet}
        onSupplyCollateral={onSupplyCollateral}
        onBorrow={onBorrow}
        onReset={resetState}
      />

      <PreflightHints issues={preflight.issues} />
    </section>
  )
}

/* ------------------------------------------------------ */
/* Sub-components                                          */
/* ------------------------------------------------------ */

function Stat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="bg-secondary/40 border border-border rounded-lg p-3">
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className="text-base font-mono tabular-nums mt-0.5 text-foreground"
        data-stat={label}
      >
        {value}
      </div>
    </div>
  )
}

function Banner({
  title,
  body,
  primary,
  onPrimary,
  tone,
}: {
  title: string
  body: string
  primary?: string
  onPrimary?: () => void
  tone?: "warn"
}) {
  return (
    <section
      className={`bg-card border ${
        tone === "warn"
          ? "border-amber-500/30"
          : "border-border"
      } rounded-xl p-5`}
      aria-label={title.toLowerCase()}
    >
      <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
        {title}
      </p>
      <p className="text-sm text-foreground mt-2 leading-relaxed">{body}</p>
      {primary && onPrimary ? (
        <button
          type="button"
          onClick={onPrimary}
          className="mt-3 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-border bg-secondary/40 text-foreground hover:bg-secondary/60"
        >
          {primary}
        </button>
      ) : null}
    </section>
  )
}

function ActionArea({
  stage,
  supplyHash,
  approveHash,
  borrowHash,
  errorMessage,
  readiness,
  wallet: _wallet,
  onSupplyCollateral,
  onBorrow,
  onReset,
}: {
  stage: Stage
  supplyHash: `0x${string}` | null
  approveHash: `0x${string}` | null
  borrowHash: `0x${string}` | null
  errorMessage: string | null
  readiness: ReadinessResult
  wallet: ReturnType<typeof useWallet>
  onSupplyCollateral: () => void
  onBorrow: () => void
  onReset: () => void
}) {
  const step1Done = supplyHash != null
  const step2Ready =
    step1Done && readiness.action === "borrow"
  return (
    <div className="grid grid-cols-1 gap-2">
      <Button
        label={
          stage === "user-confirming-supply" ||
          stage === "approve-submitted" ||
          stage === "user-confirming-approve"
            ? "Confirm in wallet…"
            : stage === "supply-submitted"
              ? "Waiting for collateral receipt…"
              : stage === "supply-confirmed"
                ? "Collateral supplied"
                : "Step 1 — Approve & supply collateral"
        }
        disabled={
          readiness.action !== "supply-collateral" ||
          stage === "user-confirming-supply" ||
          stage === "supply-submitted" ||
          stage === "approve-submitted" ||
          stage === "user-confirming-approve"
        }
        onClick={onSupplyCollateral}
        data-action="supply-collateral"
      />
      <TxReceiptLink label="approval" hash={approveHash} />
      <TxReceiptLink label="supply collateral" hash={supplyHash} />

      <Button
        label={
          stage === "user-confirming-borrow"
            ? "Confirm in wallet…"
            : stage === "borrow-submitted"
              ? "Waiting for borrow receipt…"
              : stage === "borrow-confirmed"
                ? "Borrow confirmed"
                : "Step 2 — Borrow loan asset"
        }
        disabled={
          !step2Ready ||
          stage === "user-confirming-borrow" ||
          stage === "borrow-submitted"
        }
        onClick={step2Ready ? onBorrow : undefined}
        data-action="borrow"
      />
      <TxReceiptLink label="borrow" hash={borrowHash} />

      {stage === "borrow-confirmed" ? (
        <SuccessLine
          message="Borrow confirmed. Positions refreshing…"
          onReset={onReset}
        />
      ) : null}

      {errorMessage ? (
        <p className="mt-2 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          {errorMessage}
        </p>
      ) : null}
      {!step2Ready && !errorMessage ? (
        <p className="text-[10px] font-mono tracking-wider text-muted-foreground">
          {readiness.reason ?? ""}
        </p>
      ) : null}
    </div>
  )
}

function Button({
  label,
  disabled,
  onClick,
  data: dataAttr,
}: {
  label: string
  disabled: boolean
  onClick: (() => void) | undefined
  data?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-action={dataAttr}
      className={`w-full mt-1 py-2.5 rounded-md font-mono text-[12px] tracking-wider border ${
        disabled
          ? "border-border bg-secondary/30 text-muted-foreground cursor-not-allowed"
          : "border-foreground/30 bg-foreground text-background hover:opacity-90"
      }`}
    >
      {label}
    </button>
  )
}

function SuccessLine({
  message,
  onReset,
}: {
  message: string
  onReset: () => void
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
      <span>{message}</span>
      <button
        type="button"
        onClick={onReset}
        className="text-[10px] font-mono tracking-wider px-2 py-1 rounded border border-emerald-500/40 hover:bg-emerald-500/10"
      >
        Reset
      </button>
    </div>
  )
}

function TxReceiptLink({
  label,
  hash,
}: {
  label: string
  hash: `0x${string}` | null
}) {
  if (!hash) return null
  const url = `${ROBINHOOD_BLOCKSCOUT_BASE}/tx/${hash}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] font-mono tracking-wider text-foreground/70 underline"
      data-tx-link={label}
    >
      View {label} transaction →
    </a>
  )
}

function PreflightHints({ issues }: { issues: PreflightIssue[] }) {
  const safeIssues = issues.filter((i) => i.kind !== "rpc-unavailable")
  if (safeIssues.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-1 gap-1">
      {safeIssues.map((issue, i) => (
        <p
          key={i}
          className="text-[10px] font-mono tracking-wider text-muted-foreground"
          data-preflight={issue.kind}
        >
          · {preflightLabel(issue)}
        </p>
      ))}
    </div>
  )
}

function preflightLabel(issue: PreflightIssue): string {
  switch (issue.kind) {
    case "wallet-disconnected":
      return "Wallet disconnected"
    case "wrong-network":
      return `Wrong network (chain ${issue.chainId})`
    case "no-balance":
      return `Insufficient balance for ${issue.required.toString()} (have ${issue.available.toString()})`
    case "no-allowance":
      return `Allowance insufficient (have ${issue.available.toString()}, need ${issue.required.toString()})`
    case "no-collateral-position":
      return "No collateral position"
    case "ltv-violation":
      return "Borrow exceeds safe collateral capacity (LLTV)"
    case "missing-market-params":
      return `Missing market data (${issue.field})`
    case "no-liquidity":
      return "Market has no available liquidity"
    case "unsupported-token":
      return "Unsupported token by current RPC"
    case "rpc-unavailable":
      return "RPC unavailable"
    case "market-not-found":
      return "Market not found"
    case "missing-contract":
      return `Missing contract (${issue.reason})`
    case "no-protocol-data":
      return "No protocol data for market"
  }
}

/* ------------------------------------------------------ */
/* Helpers                                                 */
/* ------------------------------------------------------ */

interface ParsedAmount {
  bigint: bigint
}

function parseAmount(input: string, decimals: number | null): ParsedAmount | null {
  const v = input.trim()
  if (!v || decimals == null) return null
  const parts = v.split(".")
  if (parts.length > 2) return null
  const [intPart, fracPart = ""] = parts
  if (!/^\d*$/.test(intPart)) return null
  if (fracPart && !/^\d*$/.test(fracPart)) return null
  const truncated = fracPart.slice(0, decimals)
  const padded = truncated.padEnd(decimals, "0")
  const intBig = intPart ? BigInt(intPart) : BigInt(0)
  const fracBig = padded ? BigInt(padded) : BigInt(0)
  const intDigits = intPart === "0" ? "0" : intPart || "0"
  const intPow = BigInt("1" + "0".repeat(decimals))
  return {
    bigint: BigInt(intDigits) * intPow + fracBig,
  }
}

function stageOnly(stage: Stage, message: string | null): PanelState {
  return {
    stage,
    supplyTxHash: null,
    approveTxHash: null,
    borrowTxHash: null,
    errorMessage: message,
  }
}

function stageFor(txStage: TxStage): Stage {
  switch (txStage) {
    case "rejected":
      return "rejected"
    case "reverted":
      return "reverted"
    case "rpc-error":
      return "rpc-error"
    case "validation-failed":
      return "rpc-error"
    case "protocol-not-configured":
      return "protocol-not-configured"
    default:
      return "rpc-error"
  }
}

/* ------------------------------------------------------ */
/* Readiness + preflight hooks                             */
/* ------------------------------------------------------ */

interface ReadinessResult {
  action: "supply-collateral" | "borrow" | "none"
  label: string
  enabled: boolean
  reason?: string
  canEditAmount: boolean
}

function resolveAction(args: {
  walletStatus: ReturnType<typeof useWallet>["status"]
  collateralMeta: { symbol: string; decimals: number } | null
  collateralBalance: bigint | null
  parsedAmount: ParsedAmount | null
  market: LendingMarket
  spender: Address | null
  preflightIssues: PreflightIssue[]
  stage: Stage
}): ReadinessResult {
  const {
    collateralBalance,
    parsedAmount,
    collateralMeta,
    market,
    spender,
    preflightIssues,
  } = args

  if (!collateralMeta) {
    return {
      action: "none",
      label: "Collateral unavailable",
      enabled: false,
      reason: "Collateral token metadata unavailable.",
      canEditAmount: false,
    }
  }
  if (collateralBalance == null) {
    return {
      action: "none",
      label: "Reading balance…",
      enabled: false,
      reason: "Collateral balance not loaded yet.",
      canEditAmount: false,
    }
  }
  if (collateralBalance === BigInt(0)) {
    return {
      action: "none",
      label: "No collateral",
      enabled: false,
      reason: "Wallet has no collateral balance.",
      canEditAmount: true,
    }
  }
  if (!parsedAmount || parsedAmount.bigint <= BigInt(0)) {
    return {
      action: "none",
      label: "Enter collateral amount",
      enabled: false,
      reason: "Collateral amount must be > 0.",
      canEditAmount: true,
    }
  }
  if (parsedAmount.bigint > collateralBalance) {
    return {
      action: "none",
      label: "Amount > balance",
      enabled: false,
      reason: "Amount exceeds collateral balance.",
      canEditAmount: true,
    }
  }
  if (!spender) {
    return {
      action: "none",
      label: "Borrow coming soon",
      enabled: false,
      reason: "Borrow is not available yet.",
      canEditAmount: true,
    }
  }
  if (!market.marketId) {
    return {
      action: "none",
      label: "Borrow coming soon",
      enabled: false,
      reason: "Market is being prepared.",
      canEditAmount: true,
    }
  }
  // LTV violation: do not show supply-collateral step.
  const ltvViolation = preflightIssues.some((i) => i.kind === "ltv-violation")
  if (ltvViolation) {
    return {
      action: "none",
      label: "LTV violation",
      enabled: false,
      reason: "Requested amount exceeds safe collateral capacity.",
      canEditAmount: true,
    }
  }
  // Phase 3: step 1 is supply-collateral (gates on registry later).
  return {
    action: "supply-collateral",
    label: "Step 1 — Approve & supply collateral",
    enabled: true,
    canEditAmount: true,
  }
}

function usePreflight(args: {
  market: LendingMarket
  walletAddress: Address | null
  walletChainId: number | null
  walletProvider: EIP1193Provider | null
  amount: bigint | null
}): { issues: PreflightIssue[] } {
  const [issues, setIssues] = React.useState<PreflightIssue[]>([])
  React.useEffect(() => {
    let cancelled = false
    if (
      !args.walletAddress ||
      args.amount == null ||
      args.amount <= BigInt(0)
    ) {
      setIssues([])
      return
    }
    ;(async () => {
      const r = await preflightBorrow({
        walletAddress: args.walletAddress,
        walletChainId: args.walletChainId,
        walletProvider: args.walletProvider,
        market: args.market,
        amount: args.amount as bigint,
        position: null,
      })
      if (cancelled) return
      setIssues(r.issues)
    })()
    return () => {
      cancelled = true
    }
  }, [
    args.market,
    args.walletAddress,
    args.walletChainId,
    args.walletProvider,
    args.amount,
  ])
  return { issues }
}
