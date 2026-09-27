/**
 * ZEKS Markets — Morpho Blue position read.
 *
 * Read-only. No transactions, no writes, no signatures.
 *
 * Provides the canonical `position(bytes32, address)` view of Morpho
 * Blue. Returned tuple (per the official `IMorpho.sol` interface):
 *
 *     function position(bytes32 id, address user)
 *       returns (
 *         uint256 supplyShares,
 *         uint256 borrowShares,
 *         uint256 collateral
 *       )
 *
 * Provenance:
 *   https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol
 *
 * Selector derivation:
 *   keccak256("position(bytes32,address)")[:4]
 *   → 0x93c52062 (computed from the canonical signature via
 *     @noble/hashes/sha3 — not invented from memory).
 */

import { ethCall, parseUint256 } from "./rpc"
import type { EIP1193Provider } from "@/lib/wallet/types"

const SELECTOR_POSITION = "0x93c52062" as const

export interface MorphoPosition {
  /** Raw supply-shares balance, no decimals applied. */
  supplyShares: bigint
  /** Raw borrow-shares balance. */
  borrowShares: bigint
  /** Raw collateral balance (token-native decimals). */
  collateral: bigint
}

/**
 * Encode `position(bytes32 id, address user)` calldata.
 *
 * Layout:
 *   head[0] = bytes32 id  (padded to 32)
 *   head[1] = address user (padded to 32)
 */
export function encodeMorphoPositionCall(
  marketId: `0x${string}`,
  user: `0x${string}`,
): `0x${string}` {
  const id = marketId.replace(/^0x/, "").toLowerCase()
  if (id.length !== 64) {
    throw new Error("position: marketId must be a 32-byte hex string")
  }
  const cleanedUser = user.replace(/^0x/, "").toLowerCase()
  if (cleanedUser.length !== 40) {
    throw new Error("position: user must be a 20-byte address")
  }
  return (SELECTOR_POSITION + id + cleanedUser.padStart(64, "0")) as `0x${string}`
}

/**
 * Read the user's Morpho Blue position for a given market.
 *
 * Returns `null` on any read failure — callers must treat "I cannot
 * see your position" as "I don't know", not as "you have a zero
 * position". This is critical for not fabricating state.
 */
export async function readMorphoPosition(
  morphoBlue: `0x${string}`,
  marketId: `0x${string}`,
  user: `0x${string}`,
  options: {
    provider?: EIP1193Provider | null
    chainId?: number | null
    timeoutMs?: number
  } = {},
): Promise<MorphoPosition | null> {
  const res = await ethCall<string>(
    { to: morphoBlue, data: encodeMorphoPositionCall(marketId, user) },
    options,
  )
  if (res.kind === "error") return null
  // 3 contiguous uint256 values = 96 bytes.
  return {
    supplyShares: parseUint256(res.value, 0),
    borrowShares: parseUint256(res.value, 1),
    collateral: parseUint256(res.value, 2),
  }
}
