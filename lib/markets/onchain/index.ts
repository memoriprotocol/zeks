/**
 * ZEKS Markets — Onchain public surface.
 *
 * The UI / preflight layer imports from here. No raw RPC calls or ABI
 * constants should appear outside this module.
 */

export {
  ROBINHOOD_PUBLIC_RPC_URL,
  ROBINHOOD_CHAIN_ID_HEX,
  ROBINHOOD_CHAIN_ID_DEC,
  ethCall,
  walletEthCall,
  publicEthCall,
  parseUint256,
  parseShortString,
  type RpcReadError,
  type RpcReadResult,
} from "./rpc"

export {
  readErc20Info,
  readErc20Balance,
  readErc20Allowance,
  readErc20UserPosition,
  readErc20InfoBatch,
  type Erc20Info,
  type Erc20UserPosition,
} from "./erc20"

export {
  fetchUserLendingPosition,
  readMarketLendingSnapshot,
  type UserLendingPosition,
  type MarketLendingSnapshot,
  type PositionAssetLeg,
  type PositionDataSource,
  type PositionIssue,
} from "./service"

export {
  preflightSupply,
  preflightBorrow,
  type SupplyPreflight,
  type BorrowPreflight,
  type PreflightIssue,
} from "./preflight"

export {
  sendApprove,
  sendSupply,
  waitForReceipt,
  MAX_UINT256,
  type ApproveArgs,
  type SupplyArgs,
  type TxStage,
  type TxSendError,
  type TxSendResult,
} from "./write"

export {
  resolveProtocolContractsForChain,
  describeProtocolContracts,
  type ProtocolContracts,
} from "../protocol/registry"
