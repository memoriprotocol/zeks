/**
 * ZEKS — Canonical Market & Source Status Vocabulary
 *
 * Single source of truth for:
 *   - market lifecycle state (active / paused / delisted / unknown)
 *   - source mode (live / real-morpho / real-morpho-unlisted / mock /
 *     unavailable / stale)
 *   - oracle availability (chainlink live / robert / unknown)
 *
 * Every terminal page (Dashboard, Markets, Market Detail, Earn,
 * Borrow, Loop, Portfolio) MUST render the same state the same way.
 * Inventing new state names is forbidden.
 *
 * All mappers are pure, total functions:
 *   - `null`, `undefined`, empty string, or unknown strings → canonical
 *     `"unknown"` / `"unavailable"` form.
 *   - Never throws.
 */

import type {
  MarketLifecycleStatus,
  MarketSourceMode,
  OracleSource,
} from "@/lib/markets/lending/types"

/** Canonical lifecycle vocabulary exposed by ZEKS UI. */
export type CanonicalLifecycleStatus =
  | "live"
  | "active"
  | "paused"
  | "delisted"
  | "unlisted"
  | "mock"
  | "unavailable"
  | "stale"
  | "unknown"

/** Canonical source-mode vocabulary. */
export type CanonicalSourceMode =
  | "live"
  | "real-morpho"
  | "real-morpho-unlisted"
  | "mock"
  | "unavailable"
  | "unknown"

/** Canonical oracle availability. */
export type CanonicalOracleSource =
  | "chainlink"
  | "robinhood-rpc"
  | "mock"
  | "unknown"
  | "unavailable"

function isStringy(v: unknown): v is string {
  return typeof v === "string"
}

function normalizeStatusString(raw: unknown): CanonicalLifecycleStatus {
  const s = isStringy(raw) ? raw.trim().toLowerCase() : ""
  if (!s) return "unknown"
  switch (s) {
    case "live":
    case "active":
      return "active"
    case "paused":
    case "halt":
    case "halted":
      return "paused"
    case "delisted":
    case "inactive":
    case "retired":
      return "delisted"
    case "unlisted":
      return "unlisted"
    case "mock":
      return "mock"
    case "stale":
      return "stale"
    case "unavailable":
    case "offline":
    case "down":
      return "unavailable"
    default:
      return "unknown"
  }
}

function normalizeSourceMode(raw: unknown): CanonicalSourceMode {
  const s = isStringy(raw) ? raw.trim().toLowerCase() : ""
  if (!s) return "unknown"
  switch (s) {
    case "live":
      return "live"
    case "real-morpho":
      return "real-morpho"
    case "real-morpho-unlisted":
      return "real-morpho-unlisted"
    case "mock":
      return "mock"
    case "unavailable":
      return "unavailable"
    default:
      return "unknown"
  }
}

function normalizeOracleSource(raw: unknown): CanonicalOracleSource {
  const s = isStringy(raw) ? raw.trim().toLowerCase() : ""
  if (!s) return "unknown"
  switch (s) {
    case "chainlink":
      return "chainlink"
    case "robinhood-rpc":
      return "robinhood-rpc"
    case "mock":
      return "mock"
    case "unavailable":
      return "unavailable"
    case "unknown":
      return "unknown"
    default:
      return "unknown"
  }
}

/* ── Public mappers ───────────────────────────────────────────── */

export function canonicalLifecycleStatus(
  status: MarketLifecycleStatus | string | null | undefined,
): CanonicalLifecycleStatus {
  return normalizeStatusString(status)
}

export function canonicalSourceMode(
  mode: MarketSourceMode | string | null | undefined,
): CanonicalSourceMode {
  return normalizeSourceMode(mode)
}

export function canonicalOracleSource(
  source: OracleSource | string | null | undefined,
): CanonicalOracleSource {
  return normalizeOracleSource(source)
}

/* ── Display labels (single source of truth) ──────────────────── */

export const LIFECYCLE_LABEL: Record<CanonicalLifecycleStatus, string> = {
  live: "Live",
  active: "Active",
  paused: "Paused",
  delisted: "Delisted",
  unlisted: "Unlisted",
  mock: "Mock",
  unavailable: "Unavailable",
  stale: "Stale",
  unknown: "—",
}

export const SOURCE_MODE_LABEL: Record<CanonicalSourceMode, string> = {
  live: "Live",
  "real-morpho": "Live · Morpho",
  "real-morpho-unlisted": "Live · Morpho (unlisted)",
  mock: "Mock",
  unavailable: "Unavailable",
  unknown: "Unknown",
}

export const ORACLE_LABEL: Record<CanonicalOracleSource, string> = {
  chainlink: "Chainlink",
  "robinhood-rpc": "Robinhood RPC",
  mock: "Mock",
  unknown: "—",
  unavailable: "Unavailable",
}

/** Is the oracle price safe to render as a USD value? */
export function isOracleLive(source: OracleSource | string | null | undefined): boolean {
  return canonicalOracleSource(source) === "chainlink"
}
