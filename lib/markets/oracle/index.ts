/**
 * ZEKS Markets — Oracle public surface.
 */

export {
  readOraclePrice,
  readOraclePrices,
  ROBINHOOD_RPC_URL,
  type OracleReading,
} from "./service"

export {
  resolveChainlinkFeed,
  getChainlinkFeeds,
  LATEST_ROUND_DATA_SELECTOR,
  type ChainlinkFeed,
} from "./chainlink-feeds"
