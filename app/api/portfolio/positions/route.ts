/**
 * GET /api/portfolio/positions?address=0x...
 *
 * Server-side portfolio aggregator. The browser NEVER calls the
 * Morpho GraphQL API directly — that endpoint is only reachable
 * from this route. Wallet ERC20 reads ALSO route through here so the
 * browser never hits Robinhood's public RPC for portfolio data.
 *
 * Response shape mirrors the existing `PortfolioSnapshot` shape,
 * but every `bigint` is replaced with `{ raw: string, decimals: number | null }`
 * so the response is fully JSON-serializable.
 *
 *   {
 *     ok: boolean,
 *     snapshot: PortfolioSnapshotJson | null,
 *     issues: PortfolioIssueJson[],
 *     message?: string,
 *   }
 *
 * `ok: false` only when the `address` query param is missing or
 * invalid. Per-field failures are surfaced in `issues[]` and as null
 * numeric values inside `snapshot`.
 */

import { NextResponse } from "next/server"
import type { Address } from "@/lib/wallet/types-common"
import { fetchUserMarketPositions } from "@/lib/markets/morpho/user-positions"
import { readErc20InfoBatch } from "@/lib/markets/onchain/erc20"
import { readErc20Balance } from "@/lib/markets/onchain/erc20"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/* ── In-flight dedupe (per address) ──────────────────────────── */

const INFLIGHT_TTL_MS = 3_000
const inflight = new Map<string, Promise<unknown>>()

function getInflight(key: string): Promise<unknown> | null {
  const entry = inflight.get(key)
  return entry ?? null
}
function setInflight(key: string, p: Promise<unknown>): void {
  inflight.set(key, p)
  p.finally(() => {
    setTimeout(() => inflight.delete(key), INFLIGHT_TTL_MS).unref?.()
    inflight.delete(key)
  })
}

/* ── JSON-safe types ─────────────────────────────────────────── */

interface BigIntLike {
  raw: string
  decimals: number | null
}

interface LegJson {
  source: "morpho" | "wallet"
  symbol: string
  contractAddress: string | null
  balance: BigIntLike
  balanceUsd: number | null
  marketId: string | null
  supplyApy: number | null
  borrowApy: number | null
  utilization: number | null
}

interface SnapshotJson {
  wallet: {
    address: string
    chainId: number | null
    wrongNetwork: boolean
    fetchedAt: string
  }
  supplied: LegJson[]
  borrowed: LegJson[]
  collateral: LegJson[]
  walletBalances: LegJson[]
  totalSuppliedUsd: number | null
  totalBorrowedUsd: number | null
  totalCollateralUsd: number | null
  netValueUsd: number | null
  weightedSupplyApy: number | null
  weightedBorrowApy: number | null
  estimatedYieldUsd: number | null
  positionCount: number
  fetchedAt: string
}

type IssueJson =
  | { kind: "morpho-unavailable"; message: string }
  | { kind: "rpc-unavailable"; message: string }
  | { kind: "missing-token-info"; symbol: string; contractAddress: string }
  | { kind: "wrong-network"; chainId: number }
  | { kind: "no-position" }

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/* ── Handler ─────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const url = new URL(request.url)
  const rawAddress = url.searchParams.get("address") ?? ""
  if (!ADDRESS_RE.test(rawAddress)) {
    return NextResponse.json(
      {
        ok: false,
        snapshot: null,
        issues: [],
        message: "Missing or invalid address",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
  const address = rawAddress.toLowerCase() as Address
  const cacheKey = address

  const existing = getInflight(cacheKey)
  if (existing) {
    try {
      const data = await existing
      return NextResponse.json(data as object, {
        headers: { "Cache-Control": "no-store" },
      })
    } catch {
      // fall through to a fresh attempt
    }
  }

  const promise = (async () => buildSnapshot(address))()
  setInflight(cacheKey, promise as Promise<unknown>)

  try {
    const data = await promise
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      {
        ok: false,
        snapshot: null,
        issues: [],
        message,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}

/* ── Snapshot builder ────────────────────────────────────────── */

interface BuildOutcome {
  ok: boolean
  snapshot: SnapshotJson | null
  issues: IssueJson[]
  message?: string
}

async function buildSnapshot(address: Address): Promise<BuildOutcome> {
  const fetchedAt = new Date().toISOString()
  const issues: IssueJson[] = []

  // 1. Morpho positions (server-only — never called by browser)
  const morphoResult = await fetchUserMarketPositions(address, {
    fetchTimeoutMs: 6_000,
  })
  if (morphoResult.partial || morphoResult.apiError) {
    issues.push({
      kind: "morpho-unavailable",
      message: morphoResult.apiError ?? "Morpho API error",
    })
  }
  const positions = morphoResult.positions

  // 2. Aggregate positions into supplied / borrowed / collateral legs.
  const supplied: LegJson[] = []
  const borrowed: LegJson[] = []
  const collateral: LegJson[] = []
  const touchedTokens = new Set<string>()

  for (const p of positions) {
    if (p.supplyAssetsRaw > BigInt(0)) {
      supplied.push({
        source: "morpho",
        symbol: p.loanAssetSymbol,
        contractAddress: p.loanAssetAddress || null,
        balance: {
          raw: p.supplyAssetsRaw.toString(),
          decimals: null,
        },
        balanceUsd: p.supplyAssetsUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
      if (p.loanAssetAddress) {
        touchedTokens.add(p.loanAssetAddress.toLowerCase())
      }
    }
    if (p.borrowAssetsRaw > BigInt(0)) {
      borrowed.push({
        source: "morpho",
        symbol: p.loanAssetSymbol,
        contractAddress: p.loanAssetAddress || null,
        balance: {
          raw: p.borrowAssetsRaw.toString(),
          decimals: null,
        },
        balanceUsd: p.borrowAssetsUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
    }
    if (p.collateralRaw > BigInt(0) && p.collateralAssetAddress) {
      collateral.push({
        source: "morpho",
        symbol: p.collateralAssetSymbol ?? "?",
        contractAddress: p.collateralAssetAddress || null,
        balance: {
          raw: p.collateralRaw.toString(),
          decimals: null,
        },
        balanceUsd: p.collateralUsd,
        marketId: p.marketId,
        supplyApy: p.marketSupplyApy,
        borrowApy: p.marketBorrowApy,
        utilization: p.marketUtilization,
      })
      touchedTokens.add(p.collateralAssetAddress.toLowerCase())
    }
  }

  // 3. Wallet ERC20 balances for every token the user has touched.
  // Uses the public Robinhood RPC server-side (browser never calls it).
  const walletBalances: LegJson[] = []
  if (touchedTokens.size > 0) {
    const tokens = Array.from(touchedTokens) as `0x${string}`[]

    // Resolve metadata in parallel for richer balances.
    let infoMap: Map<string, { symbol: string; decimals: number }>
    try {
      const all = await readErc20InfoBatch(tokens, {
        provider: null,
        chainId: ROBINHOOD_CHAIN_ID_DEC,
        timeoutMs: 5_000,
      })
      infoMap = new Map(
        Array.from(all.entries()).map(([k, v]) => [
          k.toLowerCase(),
          { symbol: v.symbol, decimals: v.decimals },
        ]),
      )
    } catch {
      infoMap = new Map()
      for (const addr of tokens) {
        issues.push({
          kind: "missing-token-info",
          symbol: addr,
          contractAddress: addr,
        })
      }
    }

    for (const token of tokens) {
      const balRes = await readErc20Balance(token, address, {
        provider: null,
        chainId: ROBINHOOD_CHAIN_ID_DEC,
        timeoutMs: 5_000,
      })
      if (balRes.kind !== "ok") {
        issues.push({
          kind: "rpc-unavailable",
          message: `balance read failed for ${token}`,
        })
        continue
      }
      const info = infoMap.get(token.toLowerCase())
      const sym = info?.symbol ?? token.slice(0, 8)
      const dec = info?.decimals ?? null
      walletBalances.push({
        source: "wallet",
        symbol: sym,
        contractAddress: token,
        balance: { raw: balRes.value.toString(), decimals: dec },
        balanceUsd: null,
        marketId: null,
        supplyApy: null,
        borrowApy: null,
        utilization: null,
      })
    }
  }

  // 4. Aggregate USD values.
  const totalSuppliedUsd = sumUsd(supplied)
  const totalBorrowedUsd = sumUsd(borrowed)
  const totalCollateralUsd = sumUsd(collateral)
  const netValueUsd =
    totalSuppliedUsd != null && totalBorrowedUsd != null
      ? (totalSuppliedUsd ?? 0) - (totalBorrowedUsd ?? 0)
      : null

  const weightedSupplyApy = weightedApy(supplied)
  const weightedBorrowApy = weightedApy(borrowed)

  // estimated yield = suppliedUsd × (apy / 100) — annualized USD
  const estimatedYieldUsd =
    totalSuppliedUsd != null && weightedSupplyApy != null
      ? (totalSuppliedUsd * weightedSupplyApy) / 100
      : null

  const positionCount =
    supplied.length + borrowed.length + collateral.length

  if (
    positionCount === 0 &&
    walletBalances.length === 0 &&
    !issues.some(
      (i) =>
        i.kind === "morpho-unavailable" || i.kind === "rpc-unavailable",
    )
  ) {
    issues.push({ kind: "no-position" })
  }

  return {
    ok: true,
    snapshot: {
      wallet: {
        address,
        chainId: ROBINHOOD_CHAIN_ID_DEC,
        wrongNetwork: false,
        fetchedAt,
      },
      supplied,
      borrowed,
      collateral,
      walletBalances,
      totalSuppliedUsd,
      totalBorrowedUsd,
      totalCollateralUsd,
      netValueUsd,
      weightedSupplyApy,
      weightedBorrowApy,
      estimatedYieldUsd,
      positionCount,
      fetchedAt,
    },
    issues,
  }
}

/* ── Math helpers ────────────────────────────────────────────── */

const ROBINHOOD_CHAIN_ID_DEC = 4663

function sumUsd(legs: LegJson[]): number | null {
  let sum = 0
  let anyUsd = false
  for (const l of legs) {
    if (l.balanceUsd != null) {
      sum += l.balanceUsd
      anyUsd = true
    }
  }
  return anyUsd ? sum : null
}

function weightedApy(legs: LegJson[]): number | null {
  let weighted = 0
  let total = 0
  for (const l of legs) {
    if (l.balanceUsd != null && l.balanceUsd > 0) {
      const apy = (l.supplyApy ?? l.borrowApy ?? 0) / 100
      weighted += apy * l.balanceUsd
      total += l.balanceUsd
    }
  }
  if (total === 0) return null
  return weighted / total
}
