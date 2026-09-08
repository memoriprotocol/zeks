/**
 * ZEKS Markets — Lending sort and filter utilities.
 *
 * All sort/filter operations run client-side over the already-loaded
 * lending markets. No upstream API hit per keystroke.
 *
 * REUSED: the search/filter/sort architecture from the previous
 * trading view is preserved. Only the field/mode names change.
 */

import type { LendingMarket } from "./types"

export type LendingSortField =
  | "market"
  | "oraclePrice"
  | "supplyApy"
  | "borrowApy"
  | "totalSupply"
  | "totalBorrow"
  | "utilization"
  | "liquidity"

export type LendingSortDir = "asc" | "desc"

export type LendingFilterMode =
  | "all"
  | "highest-supply-apy"
  | "lowest-borrow-apy"
  | "highest-liquidity"
  | "most-utilized"

function compareNum(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

function compareStr(a: string, b: string, dir: LendingSortDir): number {
  const cmp = a.localeCompare(b)
  return dir === "asc" ? cmp : -cmp
}

/**
 * Compare two lending markets by the given field. Nulls sort last
 * regardless of direction (matches the convention used elsewhere
 * in the terminal: missing data never blocks real data from
 * rendering at the top of the list).
 */
export function compareLending(
  a: LendingMarket,
  b: LendingMarket,
  field: LendingSortField,
  dir: LendingSortDir,
): number {
  let cmp = 0
  switch (field) {
    case "market":
      cmp = compareStr(a.symbol, b.symbol, "asc")
      return dir === "asc" ? cmp : -cmp
    case "oraclePrice":
      cmp = compareNum(a.oraclePrice, b.oraclePrice)
      break
    case "supplyApy":
      cmp = compareNum(a.supplyApy, b.supplyApy)
      break
    case "borrowApy":
      cmp = compareNum(a.borrowApy, b.borrowApy)
      break
    case "totalSupply":
      cmp = compareNum(a.totalSupply, b.totalSupply)
      break
    case "totalBorrow":
      cmp = compareNum(a.totalBorrow, b.totalBorrow)
      break
    case "utilization":
      cmp = compareNum(a.utilization, b.utilization)
      break
    case "liquidity":
      cmp = compareNum(a.availableLiquidity, b.availableLiquidity)
      break
  }
  return dir === "asc" ? cmp : -cmp
}

/**
 * Returns true when a single lending market matches the active
 * filter mode. Designed to compose with a search query.
 */
export function matchesLendingFilter(
  m: LendingMarket,
  mode: LendingFilterMode,
): boolean {
  switch (mode) {
    case "all":
      return true
    case "highest-supply-apy":
      return m.supplyApy !== null && m.supplyApy > 0
    case "lowest-borrow-apy":
      return m.borrowApy !== null && m.borrowApy > 0
    case "highest-liquidity":
      return m.availableLiquidity !== null && m.availableLiquidity > 0
    case "most-utilized":
      return m.utilization !== null && m.utilization > 0
  }
}

/**
 * Returns true when the market's symbol or name contains the
 * case-insensitive query string.
 */
export function matchesLendingQuery(
  m: LendingMarket,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    m.symbol.toLowerCase().includes(needle) ||
    m.name.toLowerCase().includes(needle)
  )
}
