"use client"

/**
 * SupplyActionPanel — First real write flow in ZEKS.
 *
 * Compose pre-flight + ERC20 approve + (gated) supply transactions
 * behind a single typed UI state machine. No popups fire unless
 * the user clicks Approve or Supply.
 *
 * ## State machine
 *
 *   idle ──▶ confirming ──▶ submitted ──▶ confirmed ──▶ refetch ──▶ idle
 *     │            │              │             │
 *     ▼            ▼              ▼             ▼
 *  disabled    rejected       reverted      rpc-error
 *
 * Approve and Supply each have their own state. We deliberately
 * do NOT auto-trigger Supply after approval success — the user
 * must click Supply again. This prevents an accidental double-tx
 * and surfaces any balance or RPC changes that happened during
 * the approve wait.
 *
 * ## Gating
 *
 * Both Approve and Supply gate on:
 *   - wallet connected + chainId === 4663
 *   - supply token balance > 0
 *   - target market valid (has marketId)
 *   - spender address verified via protocol registry
 *
 * Supply ALSO gates on:
 *   - allowance sufficient (after Approve confirmed, OR max int
 *     for unlimited approval)
 *   - supply ABI implementation present (currently false on
 *     Robinhood Chain — see `sendSupply`)
 */

import * as React from "react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { EIP1193Provider } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  preflightSupply,
  readErc20Allowance,
  readErc20Balance,
  sendApprove,
  sendSupply,
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

interface SupplyActionPanelProps {
  market: LendingMarket
}

type Stage =
  | "idle"
  | "user-confirming-approve"
  | "approve-submitted"
  | "approve-confirmed"
  | "user-confirming-supply"
  | "supply-submitted"
  | "supply-confirmed"
  | "rejected"
  | "reverted"
  | "rpc-error"
  | "protocol-not-configured"

interface PanelState {
  stage: Stage
  /** Last approve hash, if any. */
  approveTxHash: `0x${string}` | null
  /** Last supply hash, if any. */
  supplyTxHash: `0x${string}` | null
  /** Last error message. */
  errorMessage: string | null
}

const INITIAL_STATE: PanelState = {
  stage: "idle",
  approveTxHash: null,
  supplyTxHash: null,
  errorMessage: null,
}

export default function SupplyActionPanel({ market }: SupplyActionPanelProps) {
  const wallet = useWallet()

  const [tokenMeta, setTokenMeta] = React.useState<{
    address: Address
    symbol: string
    decimals: number
  } | null>(null)
  const [walletBalance, setWalletBalance] = React.useState<bigint | null>(null)
  const [allowance, setAllowance] = React.useState<bigint | null>(null)
  const [amountInput, setAmountInput] = React.useState<string>("")
  const [state, setState] = React.useState<PanelState>(INITIAL_STATE)
  /** Single-flight guard for any in-flight user action. */
  const busyRef = React.useRef<boolean>(false)
  /** Forces a refetch of the read state. */
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

  // ── Read state ────────────────────────────────────────────────
  React.useEffect(() => {
    if (
      wallet.status !== "connected" ||
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC
    ) {
      setTokenMeta(null)
      setWalletBalance(null)
      setAllowance(null)
      return
    }

    const loanAddress = (market as LendingMarket & {
      loanTokenAddress?: Address | null
    }).loanTokenAddress as Address | null

    if (!loanAddress) {
      setTokenMeta(null)
      setWalletBalance(null)
      setAllowance(null)
      return
    }

    let cancelled = false
    ;(async () => {
      // Token metadata
      const bal = await readErc20Balance(loanAddress, wallet.address as Address, {
        provider,
        chainId: wallet.chainId,
      })
      if (cancelled) return
      if (bal.kind === "ok") {
        setWalletBalance(bal.value)
      } else {
        setWalletBalance(null)
      }

      const { readErc20Info } = await import("@/lib/markets/onchain/erc20")
      const info = await readErc20Info(loanAddress, {
        provider,
        chainId: wallet.chainId,
      })
      if (cancelled) return
      if (info.kind === "ok") {
        setTokenMeta({
          address: loanAddress,
          symbol: info.value.symbol,
          decimals: info.value.decimals,
        })
      } else {
        setTokenMeta({
          address: loanAddress,
          symbol: market.symbol,
          decimals: market.rhTokenDecimals ?? 18,
        })
      }

      const alw = await readErc20Allowance(
        loanAddress,
        wallet.address as Address,
        (spender ??
          "0x0000000000000000000000000000000000000000") as Address,
        { provider, chainId: wallet.chainId },
      )
      if (cancelled) return
      if (alw.kind === "ok") {
        setAllowance(alw.value)
      } else {
        setAllowance(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    refreshTick,
    market.symbol,
    market.rhTokenDecimals,
    wallet.status,
    wallet.address,
    wallet.chainId,
    spender,
    provider,
  ])

  // ── Derived state ─────────────────────────────────────────────
  const parsedAmount = parseAmount(amountInput, tokenMeta?.decimals ?? null)
  const allowanceSufficient =
    parsedAmount != null &&
    allowance != null &&
    allowance >= parsedAmount.bigint
  const preflight = usePreflight({
    market,
    walletAddress: wallet.address as Address | null,
    walletChainId: wallet.chainId,
    walletProvider: provider,
    spender,
    amount: parsedAmount?.bigint ?? null,
  })

  const readiness = resolveAction({
    walletStatus: wallet.status,
    tokenMeta,
    walletBalance,
    parsedAmount,
    market,
    spender,
    preflightIssues: preflight.issues,
    stage: state.stage,
  })

  // ── User actions ──────────────────────────────────────────────
  const onApprove = React.useCallback(async () => {
    if (busyRef.current) return
    if (
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC ||
      !provider ||
      !tokenMeta ||
      !spender ||
      parsedAmount == null ||
      parsedAmount.bigint <= BigInt(0)
    ) {
      return
    }
    busyRef.current = true
    setState({ ...INITIAL_STATE, stage: "user-confirming-approve" })
    try {
      const res = await sendApprove({
        provider,
        from: wallet.address as Address,
        token: tokenMeta.address,
        spender,
        amount: MAX_UINT256,
      })
      if (!res.ok) {
        return setState(stageOnly(stageFor(res.error.stage), res.error.message))
      }
      setState({
        stage: "approve-submitted",
        approveTxHash: res.txHash,
        supplyTxHash: null,
        errorMessage: null,
      })
      const receipt = await waitForReceipt(provider, res.txHash)
      if (!receipt.ok) {
        return setState({
          stage: stageFor(receipt.error.stage),
          approveTxHash: res.txHash,
          supplyTxHash: null,
          errorMessage: receipt.error.message,
        })
      }
      setState({
        stage: "approve-confirmed",
        approveTxHash: res.txHash,
        supplyTxHash: null,
        errorMessage: null,
      })
      // Refresh allowance
      setRefreshTick((t) => t + 1)
    } catch (err) {
      setState(
        stageOnly("rpc-error", err instanceof Error ? err.message : String(err)),
      )
    } finally {
      busyRef.current = false
    }
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    tokenMeta,
    spender,
    parsedAmount,
  ])

  const onSupply = React.useCallback(async () => {
    if (busyRef.current) return
    if (
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC ||
      !provider ||
      !tokenMeta ||
      !spender ||
      parsedAmount == null ||
      parsedAmount.bigint <= BigInt(0)
    ) {
      return
    }
    busyRef.current = true
    setState({ ...INITIAL_STATE, stage: "user-confirming-supply" })
    try {
      let marketParams = null
      try {
        marketParams = marketParamsFromLendingMarket({
          loanTokenAddress: (market as LendingMarket & { loanTokenAddress?: string | null }).loanTokenAddress as Address ?? null,
          collateralTokenAddress: (market as LendingMarket & { collateralTokenAddress?: string | null }).collateralTokenAddress as Address ?? null,
          oracleAddress: market.oracleAddress,
          irmAddress: (market as LendingMarket & { irmAddress?: string | null }).irmAddress ?? null,
          lltvFraction: market.lltv,
        })
      } catch {
        // marketParams stays null; sendSupply will surface protocol-not-configured
      }
      const res = await sendSupply({
        provider,
        from: wallet.address as Address,
        marketParams,
        assets: parsedAmount.bigint,
        onBehalf: wallet.address as Address,
        contracts: protocolContracts,
        chainId: wallet.chainId,
      })
      if (!res.ok) {
        return setState(stageOnly(stageFor(res.error.stage), res.error.message))
      }
      setState({
        stage: "supply-submitted",
        approveTxHash: state.approveTxHash,
        supplyTxHash: res.txHash,
        errorMessage: null,
      })
      const receipt = await waitForReceipt(provider, res.txHash)
      if (!receipt.ok) {
        return setState({
          stage: stageFor(receipt.error.stage),
          approveTxHash: state.approveTxHash,
          supplyTxHash: res.txHash,
          errorMessage: receipt.error.message,
        })
      }
      setState({
        stage: "supply-confirmed",
        approveTxHash: state.approveTxHash,
        supplyTxHash: res.txHash,
        errorMessage: null,
      })
      // Refresh balance + position
      setRefreshTick((t) => t + 1)
    } catch (err) {
      setState(
        stageOnly("rpc-error", err instanceof Error ? err.message : String(err)),
      )
    } finally {
      busyRef.current = false
    }
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    tokenMeta,
    spender,
    parsedAmount,
    protocolContracts,
    state.approveTxHash,
  ])

  const onMax = React.useCallback(() => {
    if (walletBalance == null || tokenMeta == null) return
    setAmountInput(formatUnits(walletBalance, tokenMeta.decimals))
  }, [walletBalance, tokenMeta])

  const resetState = React.useCallback(() => {
    if (busyRef.current) return
    setState(INITIAL_STATE)
  }, [])

  // ── Render: disconnected / wrong chain / unconfigured ────────
  if (wallet.status === "initializing") {
    return <Banner title="SUPPLY" body="Connecting…" />
  }
  if (!wallet.address) {
    return (
      <Banner
        title="SUPPLY"
        body="Connect a wallet to supply into this market."
        primary="Connect wallet"
        onPrimary={() => wallet.reconnect().catch(() => undefined)}
      />
    )
  }
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC) {
    return (
      <Banner
        title="SUPPLY"
        body={`Switch to Robinhood Chain (4663). Currently on chain ${wallet.chainId}.`}
        primary="Switch to Robinhood Chain"
        onPrimary={() => wallet.switchToRobinhoodChain().catch(() => undefined)}
      />
    )
  }
  if (!spender) {
    return (
      <Banner
        title="SUPPLY COMING SOON"
        body={
          "Supply to this market is not available yet. We are wiring up " +
          "the protocol integration for Robinhood Chain. The verified " +
          "Morpho Blue core address (and bytecode-checked supply selector) " +
          "have not been committed to the protocol registry yet."
        }
        tone="warn"
      />
    )
  }
  if (!market.marketId) {
    return (
      <Banner
        title="SUPPLY DISABLED"
        body="This market has no onchain market id (mock or unknown source)."
        tone="warn"
      />
    )
  }

  // ── Render: rich state ────────────────────────────────────────
  const balanceHuman =
    tokenMeta && walletBalance != null
      ? formatUnits(walletBalance, tokenMeta.decimals)
      : "—"
  const allowanceHuman =
    tokenMeta && allowance != null
      ? formatUnits(allowance, tokenMeta.decimals)
      : "—"

  return (
    <section
      className="zeks-card"
      aria-label="Supply action"
      data-supply-panel
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/80">
            SUPPLY
          </p>
          <h2 className="font-serif text-[18px] mt-1 text-foreground">
            {market.symbol}
          </h2>
        </div>
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
          {market.rhContractAddress
            ? `Token ${market.rhContractAddress.slice(0, 6)}…${market.rhContractAddress.slice(-4)}`
            : "Token —"}
        </span>
      </div>

      {/* Amount input */}
      <div className="mb-4">
        <label
          htmlFor="supply-amount"
          className="text-[10px] font-mono tracking-wider text-muted-foreground/70"
        >
          AMOUNT
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input
            id="supply-amount"
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => {
              // Accept only digits + one decimal point. Trim leading
              // zeros from the integer part. Refuse negatives.
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
            data-supply-amount
          />
          <button
            type="button"
            onClick={onMax}
            disabled={!readiness.canEditAmount}
            className="text-[10px] font-mono tracking-wider px-2 py-1.5 rounded border border-border bg-secondary/30 text-foreground hover:bg-secondary/50 disabled:opacity-50"
            data-supply-max
          >
            MAX
          </button>
        </div>
        <div className="mt-1 text-[10px] font-mono tracking-wider text-muted-foreground">
          {tokenMeta && parsedAmount
            ? `${parsedAmount.bigint.toString()} (raw)`
            : ""}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-[11px]">
        <Stat
          label="WALLET BALANCE"
          value={
            tokenMeta
              ? `${balanceHuman} ${tokenMeta.symbol}`
              : `${balanceHuman}`
          }
        />
        <Stat
          label="CURRENT ALLOWANCE"
          value={
            tokenMeta
              ? `${allowanceHuman} ${tokenMeta.symbol}`
              : `${allowanceHuman}`
          }
        />
        <Stat
          label="SUPPLY APY"
          value={formatApy(market.supplyApy)}
          tone={market.supplyApy != null ? "positive" : undefined}
        />
        <Stat
          label="EST. POSITION (USD)"
          value={
            parsedAmount && market.oraclePrice
              ? formatPrice(
                  Number(parsedAmount.bigint) /
                    10 ** (tokenMeta?.decimals ?? 0) *
                    (market.oraclePrice ?? 0),
                )
              : "—"
          }
        />
      </div>

      {/* Action button + status */}
      <ActionArea
        stage={state.stage}
        approveHash={state.approveTxHash}
        supplyHash={state.supplyTxHash}
        errorMessage={state.errorMessage}
        readiness={readiness}
        wallet={wallet}
        onApprove={onApprove}
        onSupply={onSupply}
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
  tone,
}: {
  label: string
  value: string
  tone?: "positive"
}) {
  const color =
    tone === "positive"
      ? "text-emerald-500"
      : "text-foreground"
  return (
    <div className="bg-secondary/40 border border-border rounded-lg p-3">
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div
        className={`text-base font-mono tabular-nums mt-0.5 ${color}`}
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
  approveHash,
  supplyHash,
  errorMessage,
  readiness,
  wallet,
  onApprove,
  onSupply,
  onReset,
}: {
  stage: Stage
  approveHash: `0x${string}` | null
  supplyHash: `0x${string}` | null
  errorMessage: string | null
  readiness: ReadinessResult
  wallet: ReturnType<typeof useWallet>
  onApprove: () => void
  onSupply: () => void
  onReset: () => void
}) {
  if (readiness.action === "supply") {
    return (
      <>
        <Button
          label={
            stage === "user-confirming-supply"
              ? "Confirm in wallet…"
              : stage === "supply-submitted"
                ? "Waiting for receipt…"
                : "Supply"
          }
          disabled={
            !readiness.enabled ||
            stage === "user-confirming-supply" ||
            stage === "supply-submitted"
          }
          onClick={onSupply}
        />
        <TxReceiptLink label="supply" hash={supplyHash} />
        {stage === "supply-confirmed" ? (
          <SuccessLine
            message="Supply confirmed. Balances refreshing…"
            onReset={onReset}
          />
        ) : null}
      </>
    )
  }
  if (readiness.action === "approve") {
    return (
      <>
        <Button
          label={
            stage === "user-confirming-approve"
              ? "Confirm in wallet…"
              : stage === "approve-submitted"
                ? "Waiting for receipt…"
                : "Approve"
          }
          disabled={
            !readiness.enabled ||
            stage === "user-confirming-approve" ||
            stage === "approve-submitted"
          }
          onClick={onApprove}
        />
        <TxReceiptLink label="approval" hash={approveHash} />
        {stage === "approve-confirmed" ? (
          <SuccessLine
            message="Approval confirmed. Click Supply to continue."
            onReset={onReset}
          />
        ) : null}
      </>
    )
  }
  return (
    <>
      <Button label={readiness.label} disabled onClick={undefined} />
      {errorMessage ? (
        <p className="mt-2 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          {errorMessage}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground">
        {readiness.reason ?? ""}
      </p>
      <ResetButton onReset={onReset} wallet={wallet} />
    </>
  )
}

function Button({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: (() => void) | undefined
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full mt-1 py-2.5 rounded-md font-mono text-[12px] tracking-wider border ${
        disabled
          ? "border-border bg-secondary/30 text-muted-foreground cursor-not-allowed"
          : "border-foreground/30 bg-foreground text-background hover:opacity-90"
      }`}
      data-supply-button
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
      className="mt-2 inline-block text-[10px] font-mono tracking-wider text-foreground/70 underline"
      data-tx-link={label}
    >
      View {label} transaction →
    </a>
  )
}

function ResetButton({
  onReset,
  wallet,
}: {
  onReset: () => void
  wallet: ReturnType<typeof useWallet>
}) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground"
    >
      Reset
    </button>
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
    case "ltv-violation":
      return `Borrow exceeds safe collateral capacity`
    case "missing-market-params":
      return `Missing market data (${issue.field})`
    case "no-collateral-position":
      return "No collateral position"
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
  /** Bigint in token smallest units (decimals applied). */
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
    approveTxHash: null,
    supplyTxHash: null,
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
  /** Which action the button should label as primary. */
  action: "approve" | "supply" | "none"
  label: string
  enabled: boolean
  reason?: string
  canEditAmount: boolean
}

function resolveAction(args: {
  walletStatus: ReturnType<typeof useWallet>["status"]
  tokenMeta: { symbol: string; decimals: number } | null
  walletBalance: bigint | null
  parsedAmount: ParsedAmount | null
  market: LendingMarket
  spender: Address | null
  preflightIssues: PreflightIssue[]
  stage: Stage
}): ReadinessResult {
  const {
    walletBalance,
    parsedAmount,
    tokenMeta,
    market,
    spender,
    preflightIssues,
    stage,
  } = args

  if (!tokenMeta) {
    return {
      action: "none",
      label: "Token unavailable",
      enabled: false,
      reason: "Loan token metadata unavailable.",
      canEditAmount: false,
    }
  }
  if (walletBalance == null) {
    return {
      action: "none",
      label: "Reading balance…",
      enabled: false,
      reason: "Wallet balance not loaded yet.",
      canEditAmount: false,
    }
  }
  if (walletBalance === BigInt(0)) {
    return {
      action: "none",
      label: "No balance",
      enabled: false,
      reason: "Wallet has no balance for this token.",
      canEditAmount: true,
    }
  }
  if (!parsedAmount || parsedAmount.bigint <= BigInt(0)) {
    return {
      action: "none",
      label: "Enter an amount",
      enabled: false,
      reason: "Supply amount must be > 0.",
      canEditAmount: true,
    }
  }
  if (parsedAmount.bigint > walletBalance) {
    return {
      action: "none",
      label: "Amount > balance",
      enabled: false,
      reason: "Amount exceeds wallet balance.",
      canEditAmount: true,
    }
  }
  if (!spender) {
    return {
      action: "none",
      label: "Supply coming soon",
      enabled: false,
      reason: "Supply to this market is not available yet.",
      canEditAmount: true,
    }
  }
  if (!market.marketId) {
    return {
      action: "none",
      label: "Supply coming soon",
      enabled: false,
      reason: "Market is being prepared for supply.",
      canEditAmount: true,
    }
  }
  // Live Morpho params (oracle / irm / lltv) are required to
  // encode calldata. When missing, the market is still being
  // integrated for this chain.
  if (
    !market.oracleAddress ||
    !(market as LendingMarket & { irmAddress?: string | null })
      .irmAddress ||
    market.lltv == null
  ) {
    return {
      action: "none",
      label: "Supply coming soon",
      enabled: false,
      reason:
        "Live Morpho market params (oracle / IRM / LLTV) unavailable.",
      canEditAmount: true,
    }
  }
  const noAllowance = preflightIssues.some((i) => i.kind === "no-allowance")
  if (noAllowance) {
    return {
      action: "approve",
      label: "Approve",
      enabled: stage !== "user-confirming-approve" && stage !== "approve-submitted",
      canEditAmount: true,
    }
  }
  // No no-allowance issue: ready for supply
  return {
    action: "supply",
    label: "Supply",
    enabled: stage !== "user-confirming-supply" && stage !== "supply-submitted",
    canEditAmount: true,
  }
}

function usePreflight(args: {
  market: LendingMarket
  walletAddress: Address | null
  walletChainId: number | null
  walletProvider: EIP1193Provider | null
  spender: Address | null
  amount: bigint | null
}): { issues: PreflightIssue[] } {
  const [issues, setIssues] = React.useState<PreflightIssue[]>([])
  React.useEffect(() => {
    let cancelled = false
    if (!args.walletAddress || args.amount == null || args.amount <= BigInt(0)) {
      setIssues([])
      return
    }
    ;(async () => {
      const r = await preflightSupply({
        walletAddress: args.walletAddress,
        walletChainId: args.walletChainId,
        walletProvider: args.walletProvider,
        market: args.market,
        amount: args.amount as bigint,
        protocolSpender: args.spender,
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
    args.spender,
    args.amount,
  ])
  return { issues }
}
