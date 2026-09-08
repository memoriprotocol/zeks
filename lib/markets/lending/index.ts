/**
 * ZEKS Markets — Onchain Lending public surface.
 *
 * The UI imports from here, not from individual provider files.
 */

export type {
  LendingMarket,
  LendingMarketSet,
  LendingServiceResult,
  LendingDiagnostics,
  OracleSource,
  ProtocolSource,
  MarketLifecycleStatus,
  MarketSourceMode,
  LendingSourceDescriptor,
} from "./types"

export { LENDING_SOURCE } from "./types"

export {
  fetchLendingMarkets,
  fetchLendingMarket,
  knownLendingSymbols,
} from "./service"

export type {
  LendingSortField,
  LendingSortDir,
  LendingFilterMode,
} from "./sort"

export {
  compareLending,
  matchesLendingFilter,
  matchesLendingQuery,
} from "./sort"

export {
  MORPHO_GRAPHQL_ENDPOINT,
  DEFAULT_MORPHO_CHAIN_ID,
  type MorphoMarket,
  type MorphoFetchResult,
} from "./morpho"

export {
  readOraclePrice,
  readOraclePrices,
  ROBINHOOD_RPC_URL,
  type OracleReading,
} from "../oracle"

export {
  resolveChainlinkFeed,
  getChainlinkFeeds,
  LATEST_ROUND_DATA_SELECTOR,
  type ChainlinkFeed,
} from "../oracle"
