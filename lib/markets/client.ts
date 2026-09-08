/**
 * ZEKS Markets — public data-layer surface
 *
 * UI components should import from this module rather than reaching
 * into the per-provider files. This keeps the abstraction boundary
 * tight: when we later add Chainlink Data Streams or an internal
 * oracle, the UI keeps working unchanged.
 */

export type {
  MarketAsset,
  MarketQuote,
  MarketQuoteSet,
  MarketsPayload,
  MarketsDataState,
  AssetLifecycleStatus,
  TradingCapability,
} from "./types"

export {
  HISTORY_RANGES,
  HISTORY_ERROR_PROVIDER_NOT_CONFIGURED,
  isHistoryRange,
  type HistoryRange,
  type HistoricalPoint,
  type HistoricalSeries,
  type HistoryFetchResult,
  type ProviderUnavailableReason,
} from "./history/types"

export {
  HISTORY_RANGE_META,
  DEFAULT_HISTORY_RANGE,
  MAX_POINTS_PER_SERIES,
  type HistoryRangeMeta,
} from "./history/range"

export {
  getHistoricalSeries,
  hasUsableSeries,
  PROVIDER_PLACEHOLDER_CODE,
  type ProviderContext,
} from "./history/provider"

export { ROBINHOOD_CHAIN_ID } from "./types"

export {
  fetchRobinhoodAssets,
  refreshRobinhoodAssets,
} from "./robinhood-assets"

export { fetchRobinhoodQuotes } from "./robinhood-prices"

export {
  resolveTickerSymbols,
  TICKER_MAX_VISIBLE,
  TICKER_PRIORITY,
} from "./ticker-priority"

export { orderAssetsByPriorityThenSymbol } from "./ordering"

export {
  formatPrice,
  formatUsd,
  formatVolume,
  formatPct,
  formatApy,
  formatUtilization,
  formatCompact,
  relativeUpdated,
  absoluteTimestamp,
} from "./format"

export {
  ROBINHOOD_PUBLIC_RPC_URL,
  ROBINHOOD_CHAIN_ID_DEC,
  ROBINHOOD_CHAIN_ID_HEX,
  fetchUserLendingPosition,
  readMarketLendingSnapshot,
  preflightSupply,
  preflightBorrow,
  readErc20Info,
  readErc20Balance,
  readErc20Allowance,
  type Erc20Info,
  type Erc20UserPosition,
  type UserLendingPosition,
  type MarketLendingSnapshot,
  type PositionAssetLeg,
  type PositionDataSource,
  type PositionIssue,
  type SupplyPreflight,
  type BorrowPreflight,
  type PreflightIssue,
  type RpcReadError,
  type RpcReadResult,
} from "./onchain"

export {
  fetchUserMarketPositions,
  fetchMarketsForChain,
  MORPHO_GRAPHQL_ENDPOINT,
  type RawMorphoUserPosition,
  type UserPositionsResult,
} from "./morpho/user-positions"

export {
  buildPortfolioSnapshot,
  listOpportunities,
  type PortfolioSnapshot,
  type PortfolioLeg,
  type PortfolioIssue,
  type BuildPortfolioOptions,
} from "./portfolio"

export {
  fetchWalletActivity,
  type ActivityItem,
  type ActivityResult,
} from "./activity"
