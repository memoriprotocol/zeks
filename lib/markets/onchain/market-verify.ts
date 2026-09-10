/**
 * ZEKS Markets — Onchain Morpho MarketParams verifier.
 *
 * For each live Morpho market on Robinhood Chain (4663) returned
 * by the GraphQL service, this module:
 *
 *   1. Calls `idToMarketParams(marketId)` against the deployed
 *      Morpho Blue core via `eth_call`.
 *   2. Decodes the 5 returned slots
 *      (loanToken, collateralToken, oracle, irm, lltv).
 *   3. Compares each field against the ZEKS `LendingMarket` entry
 *      produced by `service.ts`.
 *
 * If any field differs, the market is flagged with a typed
 * discrepancy reason. Discrepancies do NOT modify LendingMarket
 * — they are surfaced separately so the UI can decide whether
 * the market is executable.
 *
 * IMPORTANT: This module only verifies deployed markets. It does
 * not invent calldata and does not depend on private keys.
 */

import type { LendingMarket } from "../lending/types"
import type { Address } from "@/lib/wallet/types-common"
import {
  MORPHO_BLUE_SELECTORS,
  MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663,
} from "./abi"
import { ethCall } from "./rpc"

export type MarketParamsDiscrepancy =
  | { kind: "loan-token-mismatch"; expected: string; onchain: string }
  | { kind: "collateral-token-mismatch"; expected: string; onchain: string }
  | { kind: "oracle-mismatch"; expected: string; onchain: string }
  | { kind: "irm-mismatch"; expected: string; onchain: string }
  | {
      kind: "lltv-mismatch"
      /** Fraction in [0..1]. */
      expected: number
      /** Raw uint256 from onchain. */
      onchainRaw: bigint
    }
  | { kind: "market-id-unknown"; marketId: string }
  | { kind: "rpc-unavailable"; message: string }

export interface MarketVerification {
  market: LendingMarket
  verified: boolean
  discrepancies: MarketParamsDiscrepancy[]
  /** Onchain MarketParams (decoded). Null if the call failed. */
  onchainMarketParams: {
    loanToken: Address
    collateralToken: Address
    oracle: Address
    irm: Address
    lltv: bigint
  } | null
}

/**
 * ABI-codec selector for `idToMarketParams(bytes32)`.
 * Identical to MORPHO_BLUE_SELECTORS.idToMarketParams — exposed
 * here for callers that only depend on this module.
 */
const SELECTOR_ID_TO_MARKET_PARAMS =
  MORPHO_BLUE_SELECTORS.idToMarketParams

function pad32(hexNoPrefix: string): string {
  return hexNoPrefix.toLowerCase().padStart(64, "0")
}

/**
 * Call `idToMarketParams(marketId)` against the verified Morpho
 * Blue core and decode the 5 returned slots.
 *
 * Returns `null` on transport failure or malformed result.
 */
export async function readMarketParamsOnchain(
  marketId: string,
  options: { provider?: import("@/lib/wallet/types").EIP1193Provider | null; chainId?: number | null } = {},
): Promise<{
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  lltv: bigint
} | null> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(marketId)) return null
  const morpho = MORPHO_BLUE_VERIFIED_DEPLOYMENT_4663.morpho
  const calldata = (SELECTOR_ID_TO_MARKET_PARAMS +
    pad32(marketId.replace(/^0x/, ""))) as `0x${string}`
  const res = await ethCall(
    { to: morpho, data: calldata },
    {
      provider: options.provider,
      chainId: options.chainId,
      timeoutMs: 6_000,
    },
  )
  if (res.kind !== "ok") return null
  const hex = res.value
  if (!hex || hex === "0x") return null
  if (hex.length < 2 + 5 * 64) return null
  const r = hex.slice(2)
  const slot = (i: number) => BigInt("0x" + r.slice(i * 64, (i + 1) * 64))
  const hexAddr = (v: bigint): Address => {
    const s = v.toString(16).padStart(40, "0")
    return ("0x" + s) as Address
  }
  return {
    loanToken: hexAddr(slot(0)),
    collateralToken: hexAddr(slot(1)),
    oracle: hexAddr(slot(2)),
    irm: hexAddr(slot(3)),
    lltv: slot(4),
  }
}

/**
 * Compare a ZEKS `LendingMarket` row against onchain MarketParams.
 * Returns a structured verification record listing any
 * discrepancies.
 */
export async function verifyLendingMarketOnchain(
  market: LendingMarket,
  options: { provider?: import("@/lib/wallet/types").EIP1193Provider | null; chainId?: number | null } = {},
): Promise<MarketVerification> {
  const discrepancies: MarketParamsDiscrepancy[] = []
  if (!market.marketId) {
    discrepancies.push({
      kind: "market-id-unknown",
      marketId: "",
    })
    return { market, verified: false, discrepancies, onchainMarketParams: null }
  }
  const onchain = await readMarketParamsOnchain(market.marketId as `0x${string}`, options)
  if (!onchain) {
    discrepancies.push({
      kind: "rpc-unavailable",
      message: "idToMarketParams returned no data",
    })
    return { market, verified: false, discrepancies, onchainMarketParams: null }
  }

  const lower = (s: string | null | undefined) =>
    (s ?? "").toLowerCase()

  if (
    market.loanTokenAddress &&
    lower(market.loanTokenAddress) !== lower(onchain.loanToken)
  ) {
    discrepancies.push({
      kind: "loan-token-mismatch",
      expected: lower(market.loanTokenAddress),
      onchain: lower(onchain.loanToken),
    })
  }
  if (
    market.collateralTokenAddress &&
    lower(market.collateralTokenAddress) !== lower(onchain.collateralToken)
  ) {
    discrepancies.push({
      kind: "collateral-token-mismatch",
      expected: lower(market.collateralTokenAddress),
      onchain: lower(onchain.collateralToken),
    })
  }
  if (
    market.oracleAddress &&
    lower(market.oracleAddress) !== lower(onchain.oracle)
  ) {
    discrepancies.push({
      kind: "oracle-mismatch",
      expected: lower(market.oracleAddress),
      onchain: lower(onchain.oracle),
    })
  }
  // IRM: Morpho GraphQL doesn't return IRM at the market level on
  // this endpoint, so we only flag if we have an explicit
  // expectation (irmAddress on ZEKS LendingMarket).
  if (
    market.irmAddress &&
    lower(market.irmAddress) !== lower(onchain.irm)
  ) {
    discrepancies.push({
      kind: "irm-mismatch",
      expected: lower(market.irmAddress),
      onchain: lower(onchain.irm),
    })
  }
  if (market.lltv != null) {
    const expectedWad = BigInt(Math.round(market.lltv * 1e18))
    if (expectedWad !== onchain.lltv) {
      discrepancies.push({
        kind: "lltv-mismatch",
        expected: market.lltv,
        onchainRaw: onchain.lltv,
      })
    }
  }

  return {
    market,
    verified: discrepancies.length === 0,
    discrepancies,
    onchainMarketParams: onchain,
  }
}

/**
 * Verify a list of markets, returning one record per market.
 * Markets without a `marketId` (mock rows) are flagged but not
 * refetched.
 */
export async function verifyLendingMarketsOnchain(
  markets: readonly LendingMarket[],
  options: { provider?: import("@/lib/wallet/types").EIP1193Provider | null; chainId?: number | null } = {},
): Promise<MarketVerification[]> {
  const out: MarketVerification[] = []
  for (const m of markets) {
    out.push(await verifyLendingMarketOnchain(m, options))
  }
  return out
}
