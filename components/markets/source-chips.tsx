"use client"

/**
 * SourceChips (P2A polish)
 *
 * Compact, user-friendly source chips used at the top of pages
 * that aggregate live data.
 *
 *   Oracle / Protocol / Asset / Network — labelled badges for the
 *   underlying data sources.
 *
 * The status pill on the right reflects the overall data freshness:
 *   - "Live"        → all live sources
 *   - "Partial"     → some sources unavailable
 *   - "Stale"       → previously-live data, last refresh failed
 *
 * Intentionally no "MOCK DATA" badge — mock/fallback data must not
 * appear in this build.
 *
 * P2A polish: chip typography matches the P1A Earn mono-caps
 * rhythm (10.5px, 0.04em tracking, weight 400). No new labels,
 * no new states, no new logic.
 */

import * as React from "react"

export interface SourceChipsProps {
  oracle:
    | "chainlink"
    | "robinhood-rpc"
    | "mock"
    | "unknown"
    | "none"
  protocol:
    | "morpho"
    | "aave"
    | "robinhood-rpc"
    | "mock"
    | "unknown"
    | "none"
  asset: "robinhood-asset-registry" | "mock" | "unknown"
  network: "robinhood-chain"
  /** Overall data freshness/state for the page */
  sourceMode?: "live" | "stale" | "partial"
}

function Chip({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md border border-border bg-secondary/60 font-sans"
      style={{
        fontSize: "10.5px",
        letterSpacing: "0.04em",
        color: "var(--muted-foreground)",
        fontWeight: 400,
      }}
    >
      <span className="text-muted-foreground/70">{label}</span>
      <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
        {value}
      </span>
    </span>
  )
}

const ORACLE_LABEL: Record<SourceChipsProps["oracle"], string> = {
  chainlink: "Chainlink",
  "robinhood-rpc": "RH RPC",
  mock: "Mock",
  unknown: "Pending",
  none: "—",
}

const PROTOCOL_LABEL: Record<SourceChipsProps["protocol"], string> = {
  morpho: "Morpho",
  aave: "Aave",
  "robinhood-rpc": "RH RPC",
  mock: "Mock",
  unknown: "—",
  none: "—",
}

const ASSET_LABEL: Record<SourceChipsProps["asset"], string> = {
  "robinhood-asset-registry": "Robinhood",
  mock: "Mock",
  unknown: "—",
}

export default function SourceChips({
  oracle,
  protocol,
  asset,
  network: _network,
  sourceMode,
}: SourceChipsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-markets-source-chips
    >
      <Chip label="Oracle" value={ORACLE_LABEL[oracle]} />
      <Chip label="Protocol" value={PROTOCOL_LABEL[protocol]} />
      <Chip label="Asset" value={ASSET_LABEL[asset]} />
      <Chip label="Network" value="Robinhood Chain" />

      {sourceMode === "live" ? (
        <span
          data-source-mode="live"
          className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-secondary border border-border font-sans"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--up)",
            fontWeight: 400,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Live
        </span>
      ) : null}
      {sourceMode === "stale" ? (
        <span
          data-source-mode="stale"
          className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 font-sans"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground)",
            fontWeight: 400,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Stale
        </span>
      ) : null}
      {sourceMode === "partial" ? (
        <span
          data-source-mode="partial"
          className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 font-sans"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground)",
            fontWeight: 400,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Partial
        </span>
      ) : null}
    </div>
  )
}
