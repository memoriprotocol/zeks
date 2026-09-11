"use client"

/**
 * BorrowActionPanel — Collateral + Borrow write flow.
 *
 * State machine (simulation-first, dynamic steps):
 *
 *   idle ─▶ simulating-approve? ─▶ user-confirming-approve
 *                              ─▶ approve-submitted
 *                              ─▶ approve-confirmed
 *   (skip approve when allowance ≥ amount)
 *
 *   simulating-supplyCollateral? ─▶ user-confirming-supplyCollateral
 *                               ─▶ supply-submitted
 *                               ─▶ supply-confirmed
 *   (skip supplyCollateral when collateral amount is 0 — user
 *    already has Morpho collateral position)
 *
 *   simulating-borrow ─▶ user-confirming-borrow
 *                    ─▶ borrow-submitted
 *                    ─▶ borrow-confirmed
 *
 * Each step:
 *   - regenerates calldata from current market state
 *   - simulates via `eth_call` (read-only, no popup)
 *   - re-runs `preSendGuard` (chain, account, balance)
 *   - requests explicit wallet confirmation
 *   - waits for confirmed receipt before next step
 *
 * Approval is exact-amount (not MAX_UINT256).
 *
 * On confirmed borrow, emits `borrow-success` via
 * `data-invalidate` which refreshes `useLendingMarkets` and
 * `usePortfolio`.
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
  encodeErc20Approve,
  encodeMorphoBorrow,
  encodeMorphoSupplyCollateral,
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

interface BorrowActionPanelProps {
  market: LendingMarket
}

type Stage =
  | "idle"
  | "simulating-approve"
  | "user-confirming-approve"
  | "approve-submitted"
  | "approve-confirmed"
  | "simulating-supply-collateral"
  | "user-confirming-supply-collateral"
  | "supply-collateral-submitted"
  | "supply-collateral-confirmed"
  | "simulating-borrow"
  | "user-confirming-borrow"
  | "borrow-submitted"
  | "borrow-confirmed"
  | "rejected"
  | "reverted"
  | "simulation-failed"
  | "rpc-error"
  | "protocol-not-configured"

interface PanelState {
  stage: Stage
  approveTxHash: `0x${string}` | null
  supplyTxHash: `0x${string}` | null
  borrowTxHash: `0x${string}` | null
  errorMessage: string | null
  simulationMessage: string | null
}

const INITIAL_STATE: PanelState = {
  stage: "idle",
  approveTxHash: null,
  supplyTxHash: null,
  borrowTxHash: null,
  errorMessage: null,
  simulationMessage: null,
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
  const [collateralInput, setCollateralInput] = React.useState<string>("")
  const [borrowInput, setBorrowInput] = React.useState<string>("")
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

  const parsedCollateral = parseAmount(
    collateralInput,
    collateralMeta?.decimals ?? null,
  )
  const parsedBorrow = parseAmount(borrowInput, 18)

  const readiness = resolveAction({
    walletStatus: wallet.status,
    collateralMeta,
    collateralBalance,
    parsedCollateral,
    parsedBorrow,
    market,
    spender,
    stage: state.stage,
  })

  const executeBorrow = React.useCallback(async () => {
    if (busyRef.current) return
    if (
      !wallet.address ||
      wallet.chainId !== ROBINHOOD_CHAIN_ID_DEC ||
      !provider ||
      !collateralMeta ||
      !spender
    ) {
      return
    }
    const collateralAmount = parsedCollateral?.bigint ?? BigInt(0)
    const borrowAmount = parsedBorrow?.bigint ?? BigInt(0)
    if (borrowAmount <= BigInt(0)) {
      return
    }
    busyRef.current = true

    let mp
    try {
      mp = marketParamsFromLendingMarket({
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
      busyRef.current = false
      return setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage:
          "Live Morpho market params are unavailable. Cannot borrow.",
      })
    }

    const morphoCore = protocolContracts.morphoBlueAddress ?? null
    if (!morphoCore) {
      busyRef.current = false
      return setState({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        errorMessage: "Morpho Blue core address missing.",
      })
    }

    const guard = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: collateralBalance,
      amount: borrowAmount,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard.ok) {
      busyRef.current = false
      return setState({
        ...INITIAL_STATE,
        stage: stageFor(guard.stage),
        errorMessage: guard.message,
      })
    }

    const needsCollateral = collateralAmount > BigInt(0)

    // Step 1 — Approve + supplyCollateral (only when collateral > 0)
    if (needsCollateral) {
      const currentAllowance = allowance ?? BigInt(0)
      const needApprove = currentAllowance < collateralAmount

      if (needApprove) {
        const approveData = encodeErc20Approve(spender, collateralAmount)
        setState({ ...INITIAL_STATE, stage: "simulating-approve" })
        const simA = await simulateWrite({
          provider,
          chainId: wallet.chainId,
          from: wallet.address as Address,
          to: collateralMeta.address,
          data: approveData,
        })
        if (!simA.ok) {
          busyRef.current = false
          if (simA.reason === "reverted") {
            return setState({
              ...INITIAL_STATE,
              stage: "simulation-failed",
              errorMessage: `Approve simulation reverted: ${
                simA.message ?? "unknown"
              }`,
              simulationMessage: simA.message,
            })
          }
          return setState({
            ...INITIAL_STATE,
            stage: "rpc-error",
            errorMessage:
              simA.reason === "wrong-network"
                ? `Wrong network: chain ${simA.chainId}.`
                : simA.reason === "no-provider"
                  ? "No wallet provider available."
                  : (simA as { message?: string }).message ??
                    "Unknown simulation error",
          })
        }

        const guard2 = preSendGuard({
          expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
          actualChainId: wallet.chainId,
          expectedAddress: wallet.address as Address,
          actualAddress: wallet.address,
          walletBalance: collateralBalance,
          amount: borrowAmount,
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
          token: collateralMeta.address,
          spender,
          amount: collateralAmount,
        })
        if (!approveRes.ok) {
          busyRef.current = false
          const stg =
            approveRes.error.stage === "rejected"
              ? "rejected"
              : stageFor(approveRes.error.stage)
          return setState({
            ...INITIAL_STATE,
            stage: stg,
            errorMessage: approveRes.error.message,
          })
        }
        setState((s) => ({
          ...s,
          stage: "approve-submitted",
          approveTxHash: approveRes.txHash,
          errorMessage: null,
          simulationMessage: null,
        }))
        const approveReceipt = await waitForReceipt(
          provider,
          approveRes.txHash,
        )
        if (!approveReceipt.ok) {
          busyRef.current = false
          return setState((s) => ({
            ...s,
            stage: stageFor(approveReceipt.error.stage),
            approveTxHash: approveRes.txHash,
            errorMessage: approveReceipt.error.message,
            simulationMessage: null,
          }))
        }
        setState((s) => ({
          ...s,
          stage: "approve-confirmed",
          approveTxHash: approveRes.txHash,
          errorMessage: null,
          simulationMessage: null,
        }))
        setRefreshTick((t) => t + 1)
      }

      let supplyData: `0x${string}`
      try {
        supplyData = encodeMorphoSupplyCollateral({
          contracts: protocolContracts,
          chainId: wallet.chainId,
          params: mp,
          assets: collateralAmount,
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
              : "Failed to construct supplyCollateral calldata.",
        }))
      }

      setState((s) => ({
        ...s,
        stage: "simulating-supply-collateral",
        supplyTxHash: null,
      }))
      const simS = await simulateWrite({
        provider,
        chainId: wallet.chainId,
        from: wallet.address as Address,
        to: morphoCore,
        data: supplyData,
      })
      if (!simS.ok) {
        busyRef.current = false
        if (simS.reason === "reverted") {
          return setState((s) => ({
            ...INITIAL_STATE,
            stage: "simulation-failed",
            approveTxHash: s.approveTxHash,
            errorMessage: `Supply collateral simulation reverted: ${
              simS.message ?? "unknown"
            }`,
            simulationMessage: simS.message,
          }))
        }
        return setState((s) => ({
          ...INITIAL_STATE,
          stage: "rpc-error",
          approveTxHash: s.approveTxHash,
          errorMessage:
            simS.reason === "wrong-network"
              ? `Wrong network: chain ${simS.chainId}.`
              : (simS as { message?: string }).message ??
                "Unknown simulation error",
        }))
      }

      const guard3 = preSendGuard({
        expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
        actualChainId: wallet.chainId,
        expectedAddress: wallet.address as Address,
        actualAddress: wallet.address,
        walletBalance: collateralBalance,
        amount: borrowAmount,
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
        stage: "user-confirming-supply-collateral",
        errorMessage: null,
        simulationMessage: null,
      }))
      const supplyRes = await sendSupplyCollateral({
        provider,
        from: wallet.address as Address,
        marketParams: mp,
        assets: collateralAmount,
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
        return setState((s) => ({
          ...INITIAL_STATE,
          stage: stg,
          approveTxHash: s.approveTxHash,
          errorMessage: supplyRes.error.message,
        }))
      }
      setState((s) => ({
        ...s,
        stage: "supply-collateral-submitted",
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
        return setState((s) => ({
          ...s,
          stage: stageFor(supplyReceipt.error.stage),
          approveTxHash: state.approveTxHash,
          supplyTxHash: supplyRes.txHash,
          errorMessage: supplyReceipt.error.message,
          simulationMessage: null,
        }))
      }
      setState((s) => ({
        ...s,
        stage: "supply-collateral-confirmed",
        approveTxHash: state.approveTxHash,
        supplyTxHash: supplyRes.txHash,
        errorMessage: null,
        simulationMessage: null,
      }))
      setRefreshTick((t) => t + 1)
    }

    // Step 2 — Borrow
    let borrowData: `0x${string}`
    try {
      borrowData = encodeMorphoBorrow({
        contracts: protocolContracts,
        chainId: wallet.chainId,
        params: mp,
        assets: borrowAmount,
        shares: BigInt(0),
        onBehalf: wallet.address as Address,
        receiver: wallet.address as Address,
      })
    } catch (err) {
      busyRef.current = false
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: "protocol-not-configured",
        approveTxHash: s.approveTxHash,
        supplyTxHash: s.supplyTxHash,
        errorMessage:
          err instanceof Error
            ? err.message
            : "Failed to construct borrow calldata.",
      }))
    }

    setState((s) => ({
      ...s,
      stage: "simulating-borrow",
      borrowTxHash: null,
    }))
    const simB = await simulateWrite({
      provider,
      chainId: wallet.chainId,
      from: wallet.address as Address,
      to: morphoCore,
      data: borrowData,
    })
    if (!simB.ok) {
      busyRef.current = false
      if (simB.reason === "reverted") {
        return setState((s) => ({
          ...INITIAL_STATE,
          stage: "simulation-failed",
          approveTxHash: s.approveTxHash,
          supplyTxHash: s.supplyTxHash,
          errorMessage: `Borrow simulation reverted: ${
            simB.message ?? "unknown"
          }`,
          simulationMessage: simB.message,
        }))
      }
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: "rpc-error",
        approveTxHash: s.approveTxHash,
        supplyTxHash: s.supplyTxHash,
        errorMessage:
          simB.reason === "wrong-network"
            ? `Wrong network: chain ${simB.chainId}.`
            : (simB as { message?: string }).message ??
              "Unknown simulation error",
      }))
    }

    const guard4 = preSendGuard({
      expectedChainId: ROBINHOOD_CHAIN_ID_DEC,
      actualChainId: wallet.chainId,
      expectedAddress: wallet.address as Address,
      actualAddress: wallet.address,
      walletBalance: collateralBalance,
      amount: borrowAmount,
      marketParams: mp,
      market,
      requireMarketIdMatch: true,
    })
    if (!guard4.ok) {
      busyRef.current = false
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: stageFor(guard4.stage),
        approveTxHash: s.approveTxHash,
        supplyTxHash: s.supplyTxHash,
        errorMessage: guard4.message,
      }))
    }

    setState((s) => ({
      ...s,
      stage: "user-confirming-borrow",
      errorMessage: null,
      simulationMessage: null,
    }))
    const borrowRes = await sendBorrow({
      provider,
      from: wallet.address as Address,
      marketParams: mp,
      assets: borrowAmount,
      shares: BigInt(0),
      onBehalf: wallet.address as Address,
      receiver: wallet.address as Address,
      contracts: protocolContracts,
      chainId: wallet.chainId,
    })
    if (!borrowRes.ok) {
      busyRef.current = false
      const stg =
        borrowRes.error.stage === "rejected"
          ? "rejected"
          : stageFor(borrowRes.error.stage)
      return setState((s) => ({
        ...INITIAL_STATE,
        stage: stg,
        approveTxHash: s.approveTxHash,
        supplyTxHash: s.supplyTxHash,
        errorMessage: borrowRes.error.message,
      }))
    }
    setState((s) => ({
      ...s,
      stage: "borrow-submitted",
      borrowTxHash: borrowRes.txHash,
      errorMessage: null,
      simulationMessage: null,
    }))
    const borrowReceipt = await waitForReceipt(provider, borrowRes.txHash)
    if (!borrowReceipt.ok) {
      busyRef.current = false
      return setState({
        stage: stageFor(borrowReceipt.error.stage),
        approveTxHash: state.approveTxHash,
        supplyTxHash: state.supplyTxHash,
        borrowTxHash: borrowRes.txHash,
        errorMessage: borrowReceipt.error.message,
        simulationMessage: null,
      })
    }

    setState({
      stage: "borrow-confirmed",
      approveTxHash: state.approveTxHash,
      supplyTxHash: state.supplyTxHash,
      borrowTxHash: borrowRes.txHash,
      errorMessage: null,
      simulationMessage: null,
    })
    setRefreshTick((t) => t + 1)
    emitDataInvalidate("borrow-success")

    busyRef.current = false
  }, [
    wallet.address,
    wallet.chainId,
    provider,
    collateralMeta,
    spender,
    parsedCollateral,
    parsedBorrow,
    market,
    protocolContracts,
    collateralBalance,
    allowance,
    state.approveTxHash,
    state.supplyTxHash,
  ])

  const resetState = React.useCallback(() => {
    if (busyRef.current) return
    setState(INITIAL_STATE)
  }, [])

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
        title="BORROW DISABLED"
        body="This market has no onchain market id (mock or unknown source)."
        tone="warn"
      />
    )
  }

  const balanceHuman =
    collateralMeta && collateralBalance != null
      ? formatUnits(collateralBalance, collateralMeta.decimals)
      : "—"
  const allowanceHuman =
    collateralMeta && allowance != null
      ? formatUnits(allowance, collateralMeta.decimals)
      : "—"

  const isPending =
    state.stage === "simulating-approve" ||
    state.stage === "simulating-supply-collateral" ||
    state.stage === "simulating-borrow" ||
    state.stage === "user-confirming-approve" ||
    state.stage === "user-confirming-supply-collateral" ||
    state.stage === "user-confirming-borrow" ||
    state.stage === "approve-submitted" ||
    state.stage === "supply-collateral-submitted" ||
    state.stage === "borrow-submitted"

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <AmountField
          inputId="borrow-collateral-amount"
          label="COLLATERAL TO ADD (optional)"
          value={collateralInput}
          onChange={setCollateralInput}
          disabled={!readiness.canEditAmount}
          placeholder="0.00"
        />
        <AmountField
          inputId="borrow-amount"
          label="BORROW AMOUNT (loan token)"
          value={borrowInput}
          onChange={setBorrowInput}
          disabled={!readiness.canEditAmount}
          placeholder="0.00"
        />
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

      <Button
        label={stageLabel(state.stage, readiness.label)}
        disabled={!readiness.enabled || isPending}
        onClick={readiness.enabled && !isPending ? executeBorrow : undefined}
        data-borrow-button
      />

      <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] font-mono tracking-wider text-foreground/70">
        <TxReceiptLine label="approve" hash={state.approveTxHash} />
        <TxReceiptLine label="supply collateral" hash={state.supplyTxHash} />
        <TxReceiptLine label="borrow" hash={state.borrowTxHash} />
      </div>

      {state.stage === "borrow-confirmed" ? (
        <SuccessLine
          message="Borrow confirmed. Positions refreshing…"
          onReset={resetState}
        />
      ) : null}

      {state.errorMessage ? (
        <p
          className="mt-2 text-[11px] font-mono tracking-wider px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          data-borrow-error
        >
          {state.errorMessage}
        </p>
      ) : null}
      {readiness.reason ? (
        <p className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground">
          {readiness.reason}
        </p>
      ) : null}
      <button
        type="button"
        onClick={resetState}
        className="mt-2 text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground"
      >
        Reset
      </button>
    </section>
  )
}

function stageLabel(stage: Stage, fallback: string): string {
  switch (stage) {
    case "simulating-approve":
      return "Simulating approve…"
    case "simulating-supply-collateral":
      return "Simulating supply collateral…"
    case "simulating-borrow":
      return "Simulating borrow…"
    case "user-confirming-approve":
      return "Confirm approve in wallet…"
    case "user-confirming-supply-collateral":
      return "Confirm supply collateral in wallet…"
    case "user-confirming-borrow":
      return "Confirm borrow in wallet…"
    case "approve-submitted":
      return "Waiting for approval receipt…"
    case "supply-collateral-submitted":
      return "Waiting for supply collateral receipt…"
    case "borrow-submitted":
      return "Waiting for borrow receipt…"
    case "approve-confirmed":
      return "Approval confirmed — running supply collateral…"
    case "supply-collateral-confirmed":
      return "Collateral confirmed — running borrow…"
    case "borrow-confirmed":
      return "Borrow confirmed"
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
      return fallback
  }
}

function AmountField({
  inputId,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  inputId: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
}) {
  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-[10px] font-mono tracking-wider text-muted-foreground/70"
      >
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "")
          const parts = v.split(".")
          const sanitized =
            parts.length > 2
              ? `${parts[0]}.${parts.slice(1).join("")}`
              : v
          onChange(sanitized)
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full mt-1 bg-secondary/40 border border-border rounded-md px-3 py-2 font-mono tabular-nums text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
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

function TxReceiptLine({
  label,
  hash,
}: {
  label: string
  hash: `0x${string}` | null
}) {
  if (!hash) {
    return (
      <span className="text-muted-foreground/60">
        {label}: —
      </span>
    )
  }
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`
  const url = `${ROBINHOOD_BLOCKSCOUT_BASE}/tx/${hash}`
  return (
    <div>
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

interface ReadinessResult {
  label: string
  enabled: boolean
  reason?: string
  canEditAmount: boolean
}

function resolveAction(args: {
  walletStatus: ReturnType<typeof useWallet>["status"]
  collateralMeta: { symbol: string; decimals: number } | null
  collateralBalance: bigint | null
  parsedCollateral: ParsedAmount | null
  parsedBorrow: ParsedAmount | null
  market: LendingMarket
  spender: Address | null
  stage: Stage
}): ReadinessResult {
  const {
    collateralBalance,
    parsedCollateral,
    parsedBorrow,
    collateralMeta,
    market,
    spender,
    stage,
  } = args
  const collateralAmount = parsedCollateral?.bigint ?? BigInt(0)
  const borrowAmount = parsedBorrow?.bigint ?? BigInt(0)

  if (!collateralMeta) {
    return {
      label: "Collateral unavailable",
      enabled: false,
      reason: "Collateral token metadata unavailable.",
      canEditAmount: false,
    }
  }
  if (collateralBalance == null) {
    return {
      label: "Reading balance…",
      enabled: false,
      reason: "Collateral balance not loaded yet.",
      canEditAmount: false,
    }
  }
  if (borrowAmount <= BigInt(0)) {
    return {
      label: "Enter borrow amount",
      enabled: false,
      reason: "Borrow amount must be > 0.",
      canEditAmount: true,
    }
  }
  if (collateralAmount > BigInt(0) && collateralAmount > collateralBalance) {
    return {
      label: "Collateral > balance",
      enabled: false,
      reason: "Collateral amount exceeds wallet balance.",
      canEditAmount: true,
    }
  }
  if (!spender) {
    return {
      label: "Borrow coming soon",
      enabled: false,
      reason: "Morpho Blue core address not configured.",
      canEditAmount: true,
    }
  }
  if (!market.marketId) {
    return {
      label: "Borrow coming soon",
      enabled: false,
      reason: "Market is being prepared.",
      canEditAmount: true,
    }
  }
  if (
    !market.oracleAddress ||
    !(market as LendingMarket & { irmAddress?: string | null }).irmAddress ||
    market.lltv == null
  ) {
    return {
      label: "Borrow coming soon",
      enabled: false,
      reason:
        "Live Morpho market params (oracle / IRM / LLTV) unavailable.",
      canEditAmount: true,
    }
  }
  const isPending =
    stage === "simulating-approve" ||
    stage === "simulating-supply-collateral" ||
    stage === "simulating-borrow" ||
    stage === "user-confirming-approve" ||
    stage === "user-confirming-supply-collateral" ||
    stage === "user-confirming-borrow" ||
    stage === "approve-submitted" ||
    stage === "supply-collateral-submitted" ||
    stage === "borrow-submitted"
  return {
    label: collateralAmount > BigInt(0) ? "Add collateral & borrow" : "Borrow",
    enabled: !isPending,
    canEditAmount: true,
  }
}
