/**
 * ZEKS Markets — F12 On-chain MarketParams verification script.
 *
 *   npm run f12:verify
 *
 * One-shot runner for the F12 on-chain MarketParams lifecycle
 * verification. Prints, for every supported stock-token symbol
 * currently visible to the Earn surface, the following fields:
 *
 *   - symbol
 *   - on-chain LLTV (in WAD, 1e18 = 100%)
 *   - on-chain LLTV (in fraction [0..1])
 *   - MarketParams discrepancies (loan-token / collateral-token /
 *     oracle / IRM / LLTV)
 *   - lifecycle (active | provisional | inactive | unknown)
 *   - transaction eligibility (true / false)
 *   - reason
 *
 * The script does NOT submit any transaction. It only issues
 * read-only `eth_call` requests against the public Robinhood
 * Chain RPC (`https://rpc.mainnet.chain.robinhood.com`) via the
 * existing `readMarketParamsOnchain` helper.
 *
 * The locked F1–F11 paths are not invoked.
 */

// Load .env* before any module reads `process.env.*`.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv({ path: ".env" })

import {
  verifyF12Markets,
  type F12LifecycleMap,
  type F12MarketClassification,
} from "../lib/markets/lending/verify"
import {
  SUPPORTED_EARN_SYMBOLS,
} from "../lib/markets/lending/supported"
import { fetchLendingMarkets } from "../lib/markets/lending/service"
import { ROBINHOOD_CHAIN_ID_DEC } from "../lib/markets/onchain"

/** WAD = 1e18 == 100% in Morpho's lltv encoding. */
const WAD = BigInt("1000000000000000000")

/** Print a fraction with 4 decimals. */
function lltvFraction(wad: bigint): string {
  // wad / 1e18 = [0..1]
  const whole = wad / WAD
  const frac = wad % WAD
  // Take 4 decimals of frac.
  const frac4 = frac * BigInt(10000) / WAD
  return `${whole.toString()}.${frac4.toString().padStart(4, "0")}`
}

function printRow(
  symbol: string,
  c: F12MarketClassification | undefined,
): string {
  if (!c) {
    return `  ${symbol.padEnd(6)}  no-verdict`
  }
  const lltvOnchain = c.onchainLltvWad
    ? `LLTV=${lltvFraction(c.onchainLltvWad)} (${c.onchainLltvWad.toString()})`
    : "LLTV=—"
  const disc = c.discrepancies.length
    ? c.discrepancies.map((d) => d.kind).join(",")
    : "—"
  return [
    `  ${symbol.padEnd(6)}`,
    `lifecycle=${c.lifecycle.padEnd(11)}`,
    `eligible=${c.transactionEligible ? "yes" : "no "}`,
    lltvOnchain.padEnd(38),
    `discrepancies=${disc.padEnd(30)}`,
    `reason="${c.reason}"`,
  ].join("  ")
}

async function main(): Promise<void> {
  // Fetch real Morpho markets for the supported earn universe
  // (server-side, no wallet).
  const stockSymbols = SUPPORTED_EARN_SYMBOLS.filter((s) => s !== "USDE")
  console.log(
    `=== F12 verify: ${stockSymbols.length} stock-token symbols on Robinhood Chain (chainId ${ROBINHOOD_CHAIN_ID_DEC}) ===`,
  )
  console.log(
    `RPC: https://rpc.mainnet.chain.robinhood.com (public, read-only)`,
  )
  console.log("")

  const result = await fetchLendingMarkets(stockSymbols, { debug: false })
  if (result.kind === "error") {
    console.error(`lending service failed: ${result.message}`)
    process.exit(1)
  }
  const markets = result.payload.markets

  // The F12 verifier is already wired into the lending service,
  // so each row carries `lifecycle` / `onchainLltvWad` /
  // `transactionEligible`. We re-run it here for a deterministic,
  // script-friendly report (so the script output never depends on
  // the lending service's internal batch ordering or timing).
  const lifecycleMap: F12LifecycleMap = await verifyF12Markets(markets, {
    provider: null,
    chainId: ROBINHOOD_CHAIN_ID_DEC,
    symbols: stockSymbols,
    concurrency: 4,
  })

  let activeCount = 0
  let provisionalCount = 0
  let inactiveCount = 0
  let unknownCount = 0
  let eligibleCount = 0

  for (const sym of stockSymbols) {
    const c = lifecycleMap.get(sym)
    console.log(printRow(sym, c))
    if (c) {
      if (c.lifecycle === "active") activeCount++
      else if (c.lifecycle === "provisional") provisionalCount++
      else if (c.lifecycle === "inactive") inactiveCount++
      else unknownCount++
      if (c.transactionEligible) eligibleCount++
    }
  }

  console.log("")
  console.log(
    `summary: active=${activeCount} provisional=${provisionalCount} inactive=${inactiveCount} unknown=${unknownCount} eligible=${eligibleCount}/${stockSymbols.length}`,
  )
  console.log(
    `note: F12 never mutates the row's on-chain LLTV. The LLTV value printed above is the verified on-chain uint256 returned by idToMarketParams(marketId).`,
  )
}

main().catch((err) => {
  console.error(
    "F12 verify: fatal error:",
    err instanceof Error ? err.message : String(err),
  )
  process.exit(1)
})
