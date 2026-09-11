"use client"

/**
 * SupplyActionPanel — Real onchain supply flow.
 *
 * State machine (simulation-first):
 *
 *   idle ─▶ simulating-approve ─▶ user-confirming-approve
 *          ─▶ approve-submitted ─▶ approve-confirmed
 *                                      │
 *          (skip approve leg if allowance ≥ amount)
 *                                      │
 *          simulating-supply ─▶ user-confirming-supply
 *          ─▶ supply-submitted ─▶ supply-confirmed
 *
 * Every transition that asks the wallet for a signature is
 * preceded by:
 *   1. `preSendGuard` — re-checks chain, account, balance, amount.
 *   2. `simulateWrite` — read-only `eth_call` to catch reverts.
 *
 * Exact-amount approval (NOT MAX_UINT256) by default.
 *
 * On confirmed supply, the panel emits a `supply-success` event
 * via `data-invalidate`, which causes `useLendingMarkets` and
 * `usePortfolio` to refresh.
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
  encodeErc20Approve,
  encodeMorphoSupply,
  simulateWrite,
  preSendGuard,
  marketParamsFromLendingMarket,
  type PreflightIssue,
  type TxStage,
} from "@/lib/markets/onchain"
import { ROBINHOOD_CHAIN_ID_DEC } from "@/lib/markets/onchain"
import { ROBINHOOD_BLOCKSCOUT_BASE } from "@/lib/wallet/robinhood-chain"
import { formatUnits } from "@/lib/markets/onchain/format-units"
import { formatApy, formatPrice } from "@/lib/markets/format"
import type { LendingMarket } from "@/lib/markets/lending"
import { emitDataInvalidate } from "@/components/markets/data-invalidate"
import { devLifecycle } from "@/lib/markets/dev-log"

interface SupplyActionPanelProps {
  market: LendingMarket
}

type Stage =
  | "idle"
  | "simulating-approve"
  | "user-confirming-approve"
  | "approve-submitted"
  | "approve-confirmed"
  | "simulating-supply"
  | "user-confirming-supply"
  | "supply-submitted"
  | "supply-confirmed"
  | "rejected"
  | "reverted"
  | "simulation-failed"
  | "rpc-error"
  | "protocol-not-configured"

interface PanelState {
  stage: Stage
  approveTxHash: `0x${string}` | null
  supplyTxHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
}

const INITIAL_STATE: PanelState = {
  stage: "idle",
  approveTxHash: null,
  supplyTxHash: null,
  errorMessage: null,
  simulationMessage: null,
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
        (spender ?? "0x0000000000000000000000000000000000000000") as Address,
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

  // ── Execute (simulation-first + exact approval) ───────────────
  const executeSupply = React.useCallback(async () => {
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

    let mp
    try {
      mp = marketParamsFromLendingMarket({
        loanTokenAddress:
          (market as LendingMarket & { loanTokenAddress?: string | null })
            .loanTokenAddress as Address ?? null,
        collateralTokenAddress:
          (market as LendingMarket & {
            collateralTokenAddress?: string | null;
          }).collateralTokenAddress as Address ?? null,
        oracleAddress: market.oracleAddress,
        irmAddress:
          (market as LendingMarket & { irmAddress?: string | null })
            .irmAddress ?? null,
        lltvFraction: market.lltv,
      })
    } catch {
      busyRef.current = false
      return setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage:
          "Live Morpho market params are unavailable. Cannot supply.",
      })
    }

    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance,
      amount: parsedAmount.bigint,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      devLifecycle("GUARD_BLOCKED", {
        leg: "supply",
        stage: guard.stage,
        message: guard.message,
      })
      return setState({
        ...INITIAL_STATE,
        stage: stageFor(guard.stage),
        errorMessage: guard.message,
      })
    }

    const currentAllowance = allowance ?? BigInt(0)
    const needApprove = currentAllowance < parsedAmount.bigint
    devLifecycle("STAGE_CHANGED", {
      leg: "supply",
      market: market.symbol,
      account: wallet.address,
      chainId: wallet.chainId,
      marketId: market.marketId,
      morphoCore: spender,
      loanToken: tokenMeta.address,
      tokenDecimals: tokenMeta.decimals,
      requestedAmount: parsedAmount.bigint,
      walletBalance: walletBalance ?? BigInt(0),
      currentAllowance,
      approvalRequired: needApprove,
    })

    if (needApprove) {
      const approveData = encodeErc20Approve(spender, parsedAmount.bigint)
      setState({ ...INITIAL_STATE, stage: "simulating-approve" })
      const simApprove = await simulateWrite({
        provider,
        chainId: wallet.chainId,
        from: wallet.address as Address,
        to: tokenMeta.address,
        data: approveData,
      })
      if (!simApprove.ok) {
        busyRef.current = false
        if (simApprove.reason === "reverted") {
          devLifecycle("SIMULATION_FAILED", {
            leg: "approve",
            message: simApprove.message,
          })
          return setState({
            ...INITIAL_STATE,
            stage: "simulation-failed",
            errorMessage: `Approve simulation reverted: ${
              simApprove.message ?? "unknown"
            }`,
            simulationMessage: simApprove.message,
          })
        }
        return setState({
          ...INITIAL_STATE,
          stage: "rpc-error",
          errorMessage:
            simApprove.reason === "wrong-network"
              ? `Wrong network: chain ${simApprove.chainId}.`
              : simApprove.reason === "no-provider"
                ? "No wallet provider available."
                : (simApprove as { message?: string }).message ?? "Unknown simulation error",
        })
      }
      devLifecycle("SIMULATION_OK", { leg: "approve" })

      const guard2 = preSendGuard({
        expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
        actualChainId: wallet.chainId,
        expectedAddress: wallet.address as Address,
        actualAddress: wallet.address,
        walletBalance,
        amount: parsedAmount.bigint,
        marketParams: mp,
        market,
        requireMarketIdMatch: true,
      })
      if (!guard2.ok) {
        busyRef.current = false
        return setState({
          ...INITIAL_STATE,
          stage: stageFor(guard2.stage),
          errorMessage: guard2.message,
        })
      }

      setState({ ...INITIAL_STATE, stage: "user-confirming-approve" })
      const approveRes = await sendApprove({
        provider,
        from: wallet.address as Address,
        token: tokenMeta.address,
        spender,
        amount: parsedAmount.bigint,
      })
      if (!approveRes.ok) {
        busyRef.current = false
        const stg =
          approveRes.error.stage === "rejected"
            ? "rejected"
            : stageFor(approveRes.error.stage)
        if (approveRes.error.stage === "rejected") {
          devLifecycle("APPROAL_REJECTED", {
            account: wallet.address,
          })
        }
        return setState({
          ...INITIAL_STATE,
          stage: stg,
          errorMessage: approveRes.error.message,
        })
      }
      devLifecycle("APPROVAL_SENT", {
        txHash: approveRes.txHash,
        token: tokenMeta.address,
        spender,
        amount: parsedAmount.bigint,
        account: wallet.address,
      })
      setState({
        stage: "approve-submitted",
        approveTxHash: approveRes.txHash,
        supplyTxHash: null,
        errorMessage: null,
        simulationMessage: null,
      })
      const approveReceipt = await waitForReceipt(
        provider,
        approveRes.txHash,
      )
      if (!approveReceipt.ok) {
        busyRef.current = false
        return setState({
          stage: stageFor(approveReceipt.error.stage),
          approveTxHash: approveRes.txHash,
          supplyTxHash: null,
          errorMessage: approveReceipt.error.message,
          simulationMessage: null,
        })
      }
      devLifecycle("APPROVAL_CONFIRMED", {
        txHash: approveRes.txHash,
        token: tokenMeta.address,
        amount: parsedAmount.bigint,
      })
      setState({
        stage: "approve-confirmed",
        approveTxHash: approveRes.txHash,
        supplyTxHash: null,
        errorMessage: null,
        simulationMessage: null,
      })
      setRefreshTick((t) => t + 1)
    }

    let supplyData: `0x${string}`
    try {
      supplyData = encodeMorphoSupply({
        contracts: protocolContracts,
        chainId: wallet.chainId,
        params: mp,
        assets: parsedAmount.bigint,
        shares: BigInt(0),
        onBehalf: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        approveTxHash: s.approveTxHash,
        errorMessage:
          err instanceof Error
            ? err.message
            : "Failed to construct supply calldata.",
      }))
    }
    const morphoCore = protocolContracts.morphoBlueAddress ?? null
    if (!morphoCore) {
      busyRef.current = false
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        approveTxHash: s.approveTxHash,
        errorMessage: "Morpho Blue core address missing.",
      }))
    }

    setState((s) => ({
      ...s,
      stage: "simulating-supply",
      supplyTxHash: null,
    }))
    const simSupply = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: morphoCore,
      data: supplyData,
    })
    if (!simSupply.ok) {
      busyRef.current = false
      if (simSupply.reason === "reverted") {
        devLifecycle("SIMULATION_FAILED", {
          leg: "supply",
          message: simSupply.message,
        })
        return setState((s) => ({
          ...INITIAL_STATE,
          stage: "simulation-failed",
          approveTxHash: s.approveTxHash,
          errorMessage: `Supply simulation reverted: ${
            simSupply.message ?? "unknown"
          }`,
          simulationMessage: simSupply.message,
        }))
      }
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: "rpc-error",
        approveTxHash: s.approveTxHash,
        errorMessage:
          simSupply.reason === "wrong-network"
            ? `Wrong network: chain ${simSupply.chainId}.`
            : (simSupply as { message?: string }).message ?? "Unknown simulation error",
      }))
    }
    devLifecycle("SIMULATION_OK", {
      leg: "supply",
      morphoCore,
    })

    const guard3 = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance,
      amount: parsedAmount.bigint,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard3.ok) {
      busyRef.current = false
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: stageFor(guard3.stage),
        approveTxHash: s.approveTxHash,
        errorMessage: guard3.message,
      }))
    }

    setState((s) => ({
      ...s,
      stage: "user-confirming-supply",
      errorMessage: null,
      simulationMessage: null,
    }))
    const supplyRes = await sendSupply({
      provider,
      from: wallet.address as Address,
      marketParams: mp,
      assets: parsedAmount.bigint,
      onBehalf: wallet.address as Address,
      contracts: protocolContracts,
      chainId: wallet.chainId,
    })
    if (!supplyRes.ok) {
      busyRef.current = false
      const stg =
        supplyRes.error.stage === "rejected"
          ? "rejected"
          : stageFor(supplyRes.error.stage)
      if (supplyRes.error.stage === "rejected") {
        devLifecycle("SUPPLY_REJECTED", {
          account: wallet.address,
        })
      }
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: stg,
        approveTxHash: s.approveTxHash,
        errorMessage: supplyRes.error.message,
      }))
    }
    devLifecycle("SUPPLY_SENT", {
      txHash: supplyRes.txHash,
      morphoCore,
      account: wallet.address,
      assets: parsedAmount.bigint,
    })
    setState((s) => ({
      ...s,
      stage: "supply-submitted",
      supplyTxHash: supplyRes.txHash,
      errorMessage: null,
      simulationMessage: null,
    }))
    const supplyReceipt = await waitForReceipt(
      provider,
      supplyRes.txHash,
    )
    if (!supplyReceipt.ok) {
      busyRef.current = false
      return setState({
        stage: stageFor(supplyReceipt.error.stage),
        approveTxHash: state.approveTxHash,
        supplyTxHash: supplyRes.txHash,
        errorMessage: supplyReceipt.error.message,
        simulationMessage: null,
      })
    }

    devLifecycle("SUPPLY_CONFIRMED", {
      txHash: supplyRes.txHash,
      morphoCore,
      assets: parsedAmount.bigint,
      account: wallet.address,
    })
    devLifecycle("DATA_REFRESHED", {
      reason: "supply-success",
      market: market.symbol,
    })

    setState({
      stage: "supply-confirmed",
      approveTxHash: state.approveTxHash,
      supplyTxHash: supplyRes.txHash,
      errorMessage: null,
      simulationMessage: null,
    })
    setRefreshTick((t) => t + 1)
    emitDataInvalidate("supply-success")

    busyRef.current = false
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    tokenMeta,
    spender,
    parsedAmount,
    protocolContracts,
    market,
    allowance,
    walletBalance,
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
          "Supply to this market is not available yet. The verified " +
          "Morpho Blue core address has not been loaded from the " +
          "bundled snapshot at lib/markets/protocol/addresses.json."
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

      {/* Pre-supply verification context — always visible to the human */}
      <PreFlightContext
        market={market}
        tokenMeta={tokenMeta}
        walletAddress={wallet.address}
        walletChainId={wallet.chainId}
        spender={spender}
        walletBalance={walletBalance}
        allowance={allowance}
        parsedAmount={parsedAmount}
      />

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

      <ActionArea
        stage={state.stage}
        approveHash={state.approveTxHash}
        supplyHash={state.supplyTxHash}
        errorMessage={state.errorMessage}
        simulationMessage={state.simulationMessage}
        readiness={readiness}
        onExecute={executeSupply}
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
    tone === "positive" ? "text-emerald-500" : "text-foreground"
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
        tone === "warn" ? "border-amber-500/30" : "border-border"
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
  simulationMessage,
  readiness,
  onExecute,
  onReset,
}: {
  stage: Stage
  approveHash: `0x${string}` | null
  supplyHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
  readiness: ReadinessResult
  onExecute: () => void
  onReset: () => void
}) {
  const isPending =
    stage === "simulating-approve" ||
    stage === "simulating-supply" ||
    stage === "user-confirming-approve" ||
    stage === "user-confirming-supply" ||
    stage === "approve-submitted" ||
    stage === "supply-submitted"
  const label = (() => {
    switch (stage) {
      case "simulating-approve":
        return "Simulating approve…"
      case "simulating-supply":
        return "Simulating supply…"
      case "user-confirming-approve":
        return "Confirm approve in wallet…"
      case "user-confirming-supply":
        return "Confirm supply in wallet…"
      case "approve-submitted":
        return "Waiting for approval receipt…"
      case "supply-submitted":
        return "Waiting for supply receipt…"
      case "approve-confirmed":
        return "Approval confirmed — running supply…"
      case "supply-confirmed":
        return "Supply confirmed"
      case "simulation-failed":
        return "Simulation failed"
      case "rejected":
        return "Wallet rejected"
      case "reverted":
        return "Transaction reverted"
      case "rpc-error":
        return "RPC error"
      case "protocol-not-configured":
        return "Protocol not configured"
      default:
        return readiness.label
    }
  })()
  return (
    <>
      <Button
        label={label}
        disabled={!readiness.enabled || isPending}
        onClick={readiness.enabled && !isPending ? onExecute : undefined}
        data-supply-button
      />
      <TxReceiptLink label="approval" hash={approveHash} />
      <TxReceiptLink label="supply" hash={supplyHash} />
      {stage === "supply-confirmed" ? (
        <SuccessLine
          message="Supply confirmed. Balances refreshing…"
          onReset={onReset}
        />
      ) : null}
      {errorMessage ? (
        <p
          className="mt-2 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          data-supply-error
        >
          {errorMessage}
        </p>
      ) : null}
      {simulationMessage && stage !== "simulation-failed" ? (
        <p className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground">
          {simulationMessage}
        </p>
      ) : null}
      {!errorMessage && readiness.reason ? (
        <p className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground">
          {readiness.reason}
        </p>
      ) : null}
      <ResetButton onReset={onReset} />
    </>
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
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`
  const url = `${ROBINHOOD_BLOCKSCOUT_BASE}/tx/${hash}`
  return (
    <div className="mt-2 text-[10px] font-mono tracking-wider text-foreground/70">
      <span>{label}: </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        data-tx-link={label}
      >
        {short} ↗
      </a>
    </div>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
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

function PreFlightContext({
  market,
  tokenMeta,
  walletAddress,
  walletChainId,
  spender,
  walletBalance,
  allowance,
  parsedAmount,
}: {
  market: LendingMarket
  tokenMeta: { address: Address; symbol: string; decimals: number } | null
  walletAddress: string | null
  walletChainId: number | null
  spender: Address | null
  walletBalance: bigint | null
  allowance: bigint | null
  parsedAmount: { bigint: bigint } | null
}) {
  const fields: { label: string; value: string; ok: boolean }[] = [
    {
      label: "account",
      value: walletAddress ?? "—",
      ok: !!walletAddress,
    },
    {
      label: "chainId",
      value: walletChainId != null ? `${walletChainId}` : "—",
      ok: walletChainId === 4663,
    },
    {
      label: "marketSymbol",
      value: market.symbol,
      ok: true,
    },
    {
      label: "marketId",
      value: market.marketId ?? "—",
      ok: !!market.marketId,
    },
    {
      label: "morphoCore",
      value: spender ?? "—",
      ok: !!spender,
    },
    {
      label: "loanToken",
      value: tokenMeta?.address ?? "—",
      ok: !!tokenMeta?.address,
    },
    {
      label: "tokenDecimals",
      value: tokenMeta?.decimals != null ? `${tokenMeta.decimals}` : "—",
      ok: tokenMeta?.decimals != null,
    },
    {
      label: "walletBalance",
      value: walletBalance != null && tokenMeta
        ? `${formatUnits(walletBalance, tokenMeta.decimals)} ${tokenMeta.symbol}`
        : "—",
      ok: walletBalance != null,
    },
    {
      label: "requestedAmount",
      value: parsedAmount && tokenMeta
        ? `${formatUnits(parsedAmount.bigint, tokenMeta.decimals)} ${tokenMeta.symbol}`
        : "—",
      ok: parsedAmount != null && parsedAmount.bigint > BigInt(0),
    },
    {
      label: "currentAllowance",
      value: allowance != null && tokenMeta
        ? `${formatUnits(allowance, tokenMeta.decimals)} ${tokenMeta.symbol}`
        : "—",
      ok: true,
    },
    {
      label: "approvalRequired",
      value:
        allowance != null && parsedAmount != null
          ? allowance >= parsedAmount.bigint
            ? "NO"
            : "YES"
          : "—",
      ok: true,
    },
  ]

  return (
    <details className="mb-4 border border-border rounded-lg overflow-hidden">
      <summary className="px-3 py-2 text-[10px] font-mono tracking-wider text-muted-foreground hover:bg-secondary/20 cursor-pointer select-none">
        VERIFIED EXECUTION CONTEXT — click to inspect
      </summary>
      <div className="bg-secondary/20 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <span
              className="text-[9px] font-mono tracking-wider text-muted-foreground"
              data-pf-label={f.label}
            >
              {f.label}
            </span>
            <span
              className={`text-[9px] font-mono tracking-wider ${
                f.label === "approvalRequired"
                  ? f.value === "YES"
                    ? "text-amber-500"
                    : "text-emerald-500"
                  : f.ok
                    ? "text-foreground/80"
                    : "text-amber-500"
              }`}
              data-pf-value={f.label}
            >
              {f.value}
            </span>
          </div>
        ))}
      </div>
    </details>
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
      return "Borrow exceeds safe collateral capacity"
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

interface ParsedAmount {
  bigint: bigint
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
      label: "Token unavailable",
      enabled: false,
      reason: "Loan token metadata unavailable.",
      canEditAmount: false,
    }
  }
  if (walletBalance == null) {
    return {
      label: "Reading balance…",
      enabled: false,
      reason: "Wallet balance not loaded yet.",
      canEditAmount: false,
    }
  }
  if (walletBalance === BigInt(0)) {
    return {
      label: "No balance",
      enabled: false,
      reason: "Wallet has no balance for this token.",
      canEditAmount: true,
    }
  }
  if (!parsedAmount || parsedAmount.bigint <= BigInt(0)) {
    return {
      label: "Enter an amount",
      enabled: false,
      reason: "Supply amount must be > 0.",
      canEditAmount: true,
    }
  }
  if (parsedAmount.bigint > walletBalance) {
    return {
      label: "Amount > balance",
      enabled: false,
      reason: "Amount exceeds wallet balance.",
      canEditAmount: true,
    }
  }
  if (!spender) {
    return {
      label: "Supply coming soon",
      enabled: false,
      reason: "Morpho Blue core address not configured.",
      canEditAmount: true,
    }
  }
  if (!market.marketId) {
    return {
      label: "Supply coming soon",
      enabled: false,
      reason: "Market is being prepared for supply.",
      canEditAmount: true,
    }
  }
  if (
    !market.oracleAddress ||
    !(market as LendingMarket & { irmAddress?: string | null }).irmAddress ||
    market.lltv == null
  ) {
    return {
      label: "Supply coming soon",
      enabled: false,
      reason:
        "Live Morpho market params (oracle / IRM / LLTV) unavailable.",
      canEditAmount: true,
    }
  }
  const noAllowance = preflightIssues.some((i) => i.kind === "no-allowance")
  const isPending =
    stage === "simulating-approve" ||
    stage === "simulating-supply" ||
    stage === "user-confirming-approve" ||
    stage === "user-confirming-supply" ||
    stage === "approve-submitted" ||
    stage === "supply-submitted"
  return {
    label: noAllowance
      ? "Approve & supply"
      : parsedAmount &&
          (allowanceGte(args, parsedAmount.bigint))
        ? "Supply"
        : "Approve & supply",
    enabled: !isPending,
    canEditAmount: true,
  }
}

// Tiny helper that resolves whether current allowance covers the amount.
function allowanceGte(
  args: {
    preflightIssues: PreflightIssue[]
  },
  amount: bigint,
): boolean {
  return !args.preflightIssues.some((i) => i.kind === "no-allowance")
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
