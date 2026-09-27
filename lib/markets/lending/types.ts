/**
 * ZEKS Markets — Onchain Lending Market model
 *
 * The /terminal/markets page is pivoting from a trading-centric
 * (bid/ask/volume) view to a Loopr-style onchain lending view.
 *
 * This file defines the normalized lending-market shape consumed by
 * the UI. All numeric fields are `number | null` — we NEVER coerce
 * a malformed upstream string to NaN; missing data renders as `—`.
 *
 * Future data sources (clearly separated so swap-in is trivial):
 *
 *   - Robinhood RPC   → totalSupply, totalBorrow, availableLiquidity
 *                        (onchain balance reads from market/vault contracts)
 *   - Chainlink        → oraclePrice  (offchain price feed)
 *   - Morpho           → supplyApy, borrowApy, utilization, totalSupply,
 *                        totalBorrow  (lending protocol / vault metrics)
 *
 * The current implementation uses MOCK values living in
 * `lib/markets/lending/mock.ts`. None of those values are exposed
 * to the UI without a `sourceMode: "mock" | "live"` tag — the UI
 * surfaces this in the page chrome so users can tell.
 *
 * IMPORTANT:
 *   - This model is ADDITIVE relative to the trading types in
 *     `./types.ts`. The old `MarketQuote` (bid/ask/volume) is
 *     still used by `/terminal/trade`, ticker, etc. We do NOT
 *     delete those fields.
 *   - When a future phase wires real Morpho/Chainlink/RPC calls,
 *     only `lib/markets/lending/*` needs to change; the UI imports
 *     from `lib/markets/lending` and never touches RPC/HTTP.
 */

import { ROBINHOOD_CHAIN_ID } from "../types"

/** Source of an oracle price feed. */
export type OracleSource =
  | "chainlink"
  | "robinhood-rpc" // future onchain oracle contract read
  | "mock"
  | "unknown"
  | "none" // curated-only row with no onchain oracle (e.g. SPCX)

/** Source of the lending-protocol metrics (APY, TVL, utilization). */
export type ProtocolSource =
  | "morpho"
  | "aave" // future
  | "robinhood-rpc" // future direct vault reads
  | "mock"
  | "unknown"
  | "none" // curated-only row with no Morpho metrics (e.g. SPCX)

/**
 * F12 — On-chain MarketParams lifecycle status.
 *
 * Derived by verifying the on-chain `idToMarketParams(marketId)`
 * returned by the deployed Morpho Blue core on Robinhood Chain
 * against the row's GraphQL-supplied fields. F12 does NOT modify
 * the locked F1–F11 readiness / writer / preflight / receipt paths;
 * the field is purely additive — old consumers continue to work
 * because every existing call site ignores it.
 *
 *   - "active"      → on-chain MarketParams match the row
 *                    (loanToken / collateralToken / oracle / irm /
 *                    lltv). The market is transaction-eligible.
 *   - "provisional" → on-chain MarketParams were read but some
 *                    field disagrees (e.g. LLTV != 1% but also
 *                    not equal to the row's `lltv`). Investigate
 *                    but do NOT silently replace values.
 *   - "inactive"    → on-chain LLTV equals the deployment default
 *                    (1%) OR the row has no `marketId`. Not
 *                    transaction-eligible — `simulateWrite` would
 *                    revert.
 *   - "unknown"     → the verifier could not run (RPC failure,
 *                    missing marketId, etc.). The UI shows this as
 *                    a soft "unverified" indicator. Conservative
 *                    default for non-mock rows.
 */
export type F12MarketLifecycle =
  | "active"
  | "provisional"
  | "inactive"
  | "unknown"

/** Lifecycle status of a lending market. */
export type MarketLifecycleStatus =
  | "active"
  | "paused"
  | "delisted"
  | "unknown"

/**
 * Whether the current LendingMarket was constructed from real
 * upstream data or from local mock values.
 *
 *   - "live"               → reserved for future Chainlink /
 *                            Robinhood RPC sources (Phase 3+).
 *   - "real-morpho"        → real Morpho Blue market on Robinhood
 *                            Chain via `api.morpho.org`, listed.
 *   - "real-morpho-unlisted" → real Morpho Blue market on Robinhood
 *                              Chain, but NOT in Morpho's official
 *                              listed set. On-chain data is real;
 *                              only the listing status is false.
 *                              Surfaced with its own badge so users
 *                              can see the difference.
 *   - "mock"               → placeholder values from `./mock.ts`.
 *                            The page chrome MUST clearly surface
 *                            this so users can never mistake it for
 *                            live data.
 */
export type MarketSourceMode =
  | "live"
  | "real-morpho"
  | "real-morpho-unlisted"
  | "mock"
  | "curated-reference" // curated ticker with no Morpho market
                       // (e.g. SPCX). Has referencePrice from
                       // Robinhood /rhj/prices only — never used
                       // as oracle input for risk / writes.

/** Onchain lending market for one asset on Robinhood Chain. */
export interface LendingMarket {
  /** Canonical ticker symbol, uppercase. e.g. "AAPL" */
  symbol: string
  /** Human-friendly asset name. e.g. "Apple" */
  name: string
  /** Optional logo URL (robinhood asset registry or local /assets path). */
  logoUrl: string | null

  // ── Oracle (price reference) ───────────────────────────────────
  /**
   * Oracle price for one whole token, in USD. Driven by Chainlink
   * (future), or by the asset's own onchain oracle contract.
   * Null when no oracle data is available yet.
   */
  oraclePrice: number | null
  /** Tag identifying which feed produced `oraclePrice`. */
  oracleSource: OracleSource

  // ── Lending rates ──────────────────────────────────────────────
  /** Supply APY in percent. e.g. 4.32 means 4.32%. Null if unknown. */
  supplyApy: number | null
  /** Borrow APY in percent. e.g. 5.18 means 5.18%. Null if unknown. */
  borrowApy: number | null

  // ── Vault / market state ───────────────────────────────────────
  /**
   * Total supplied principal, in USD. Source: Morpho (real) or
   * direct onchain balance read (future RPC). Null when unknown.
   */
  totalSupply: number | null
  /**
   * Total borrowed principal, in USD. Source: Morpho (real) or
   * direct onchain balance read (future RPC). Null when unknown.
   */
  totalBorrow: number | null
  /**
   * Available liquidity (withdrawable supply), in USD. Equal to
   * totalSupply - totalBorrow when both are known. Null when either
   * input is unknown.
   */
  availableLiquidity: number | null
  /**
   * Utilization ratio in percent (0..100). Equal to totalBorrow /
   * totalSupply * 100 when both are known. Null when either is
   * unknown.
   */
  utilization: number | null
  /**
   * Total deposits / TVL in USD. On Morpho this is the same as
   * `totalSupply` for a Blue market — surfaced as a separate field
   * so future sources (vaults, multi-market aggregations) can
   * diverge cleanly.
   */
  tvl: number | null

  // ── Lifecycle / status ─────────────────────────────────────────
  status: MarketLifecycleStatus

  /**
   * F12 — Verified on-chain MarketParams lifecycle. Additive only;
   * F1–F11 writers ignore it. See `F12MarketLifecycle` for the
   * classification rules. `null` when the verifier did not run
   * (e.g. mock rows, no `marketId`).
   */
  lifecycle: F12MarketLifecycle | null

  /**
   * F12 — On-chain LLTV in WAD (1e18) form, read by
   * `readMarketParamsOnchain(marketId)`. `null` when the verifier
   * could not run. The locked F1–F11 writers never read this field;
   * they use `LendingMarket.lltv` (the GraphQL row value). F12
   * only USES this to compute the lifecycle classification; F12
   * does NOT mutate `lltv`.
   */
  onchainLltvWad: bigint | null

  /**
   * F12 — Whether transaction writes are allowed for this row,
   * derived from `lifecycle`. Computed once when the verifier
   * runs. F1–F11 writers MUST continue to gate on
   * `chainId + marketId + sourceMode` exactly as they did before;
   * F12's eligibility flag is informational for the UI and the
   * dedicated verification script (`scripts/verify-f12.ts`).
   */
  transactionEligible: boolean

  // ── Provenance ─────────────────────────────────────────────────
  /** Protocol that produced the lending metrics. */
  protocolSource: ProtocolSource
  /** Whether the row is backed by real upstream data or mock values. */
  sourceMode: MarketSourceMode
  /**
   * Whether Morpho's official listing flag is `true` for this
   * market. `null` when the source isn't Morpho (e.g. mock).
   */
  listed: boolean | null
  /**
   * Underlying lending market / vault contract on Robinhood Chain.
   * May be null if the market has not been deployed yet.
   */
  contractAddress: string | null
  /**
   * Morpho Blue `marketId` (32-byte hex). Populated when the row
   * was sourced from Morpho. Null when mock.
   */
  marketId: string | null
  /** Collateral asset symbol (e.g. "AAPL") when sourced from Morpho. */
  collateralAssetSymbol: string | null
  /** Loan asset symbol (e.g. "USDG") when sourced from Morpho. */
  loanAssetSymbol: string | null
  /** LLTV (loan-to-value cap) as a 0..1 decimal (e.g. 0.965). */
  lltv: number | null
  /** Oracle contract address (lowercased). Morpho-sourced markets only. */
  oracleAddress: string | null
  /** IRM (interest rate model) contract address (Morpho-sourced only). */
  irmAddress: string | null
  /** Loan token contract address (Morpho-sourced only). */
  loanTokenAddress: string | null
  /** Collateral token contract address (Morpho-sourced only). */
  collateralTokenAddress: string | null
  /**
   * Decimals of the onchain loan token (ERC20.decimals()). Falls
   * back to `rhTokenDecimals` then 18 when unknown. Set when the
   * service actually read `decimals()` via RPC; otherwise null.
   */
  loanTokenDecimals: number | null
  // ── Robinhood Stock Token metadata (from /rhj/assets) ─────────
  /**
   * Deployed ERC-20 contract address for this asset on Robinhood
   * Chain (4663), from the Robinhood asset registry.
   * Null when the asset is not in the registry.
   */
  rhContractAddress: string | null
  /**
   * Current onchain multiplier as a decimal (e.g. 1.000566).
   * Null when not available.
   */
  rhMultiplier: number | null
  /**
   * Token decimal places (commonly 18).
   */
  rhTokenDecimals: number | null
  /**
   * Logo URL from the Robinhood asset registry. May be the generic
   * upstream placeholder; the normalize layer filters known
   * placeholder paths so this is null when Robinhood has no
   * per-symbol logo.
   */
  rhLogoUrl: string | null

  // ── Reference market (from /rhj/prices) ──────────────────────
  /**
   * Underlying-equity bid from the Robinhood REST price feed.
   * This is NOT the oracle value used for lending — it is an
   * informational reference market price.
   */
  referenceBid: number | null
  /**
   * Underlying-equity ask from the Robinhood REST price feed.
   * This is NOT the oracle value used for lending.
   */
  referenceAsk: number | null
  /**
   * Midpoint of referenceBid and referenceAsk.
   */
  referencePrice: number | null
  /**
   * ISO timestamp of the Robinhood quote generation.
   */
  referenceGeneratedAt: string | null
  /**
   * Whether Robinhood reports the reference market as halted.
   */
  referenceIsHalt: boolean

  chainId: typeof ROBINHOOD_CHAIN_ID

  /** ISO timestamp of last refresh. */
  fetchedAt: string
}

/**
 * Container returned by the lending-markets service.
 * Holds the markets + freshness metadata.
 */
export interface LendingMarketSet {
  markets: LendingMarket[]
  fetchedAt: string
  /** Symbols whose data could not be fetched this cycle. */
  failedSymbols: string[]
}

/**
 * Discriminated union returned by the lending service. The UI uses
 * this to render loading / error / empty / partial / ok states.
 *
 *   - "ok"       → real Morpho data was fetched (with or without a
 *                  mock fallback). `markets` is non-empty.
 *   - "partial"  → at least one requested symbol could not be
 *                  resolved (in `failedSymbols`). UI shows the
 *                  available markets with a soft warning.
 *   - "empty"    → no markets returned. UI shows the empty state.
 *   - "error"    → the entire fetch failed. UI shows error + retry.
 */
export type LendingServiceResult =
  | { kind: "ok"; payload: LendingMarketSet }
  | { kind: "partial"; payload: LendingMarketSet; reason: string }
  | { kind: "empty"; payload: LendingMarketSet; reason: string }
  | { kind: "error"; message: string }

/**
 * Diagnostics emitted by the lending service. Surfaced in the
 * server console during development so we can verify the live
 * Morpho integration is reaching the right endpoint, filtering
 * the right chain, and returning expected counts.
 *
 * NEVER includes API keys or secrets.
 */
export interface LendingDiagnostics {
  /** Public GraphQL endpoint used. */
  morphoEndpoint: string
  /** Morpho chain filter applied. */
  chainId: number
  /** Number of markets returned by Morpho (before client filtering). */
  morphoMarketsReturned: number | null
  /** Number of markets Morpho returned for the target chain. */
  chainMarketsReturned: number | null
  /** Number of markets the service surfaced to the UI. */
  marketsServed: number
  /** Per-ZEKS-symbol: which Morpho market id was selected (if any). */
  symbolMapping: Record<string, string | null>
  /** When the fetch was issued. */
  fetchedAt: string
}

/** Service source descriptor shown in the page chrome. */
export interface LendingSourceDescriptor {
  oracle: OracleSource
  protocol: ProtocolSource
  asset: "robinhood-asset-registry" | "mock" | "unknown"
  network: "robinhood-chain"
  chainId: typeof ROBINHOOD_CHAIN_ID
}

/** Constant descriptor used by the UI for source chips. */
export const LENDING_SOURCE: LendingSourceDescriptor = {
  oracle: "chainlink",
  protocol: "morpho",
  asset: "robinhood-asset-registry",
  network: "robinhood-chain",
  chainId: ROBINHOOD_CHAIN_ID,
}

/**
 * Earn BigInt bug — wire-safe representation of `LendingMarket` for
 * JSON serialization. The internal `onchainLltvWad: bigint | null`
 * becomes a decimal string at the API boundary. Internal computation
 * stays `bigint`; no client component or transaction writer reads
 * this field.
 *
 * Mirrors the portfolio route's `BigIntLike` pattern
 * (`{ raw: string, decimals: number | null }`) — a single-field
 * shape, decimal-string preservation, lossless round-trip via
 * `BigInt(s)`.
 */
export type LendingMarketWire = Omit<LendingMarket, "onchainLltvWad"> & {
  onchainLltvWad: string | null
}

/**
 * Earn BigInt bug — map an internal `LendingMarket` to its
 * JSON-safe wire shape. Pure function; does not mutate the input.
 * Decimal conversion preserves precision (no `Number` coercion).
 */
export function toWireLendingMarket(m: LendingMarket): LendingMarketWire {
  return {
    ...m,
    onchainLltvWad:
      m.onchainLltvWad === null ? null : m.onchainLltvWad.toString(),
  }
}
