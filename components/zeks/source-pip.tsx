"use client"

/**
 * Source pip — tiny dot that signals source mode.
 *
 *   live      → green
 *   unlisted  → amber
 *   mock      → muted
 */

import * as React from "react"
import type { LendingMarket } from "@/lib/markets/lending"

export function SourcePip({
  mode,
  size = 6,
  title,
}: {
  mode: LendingMarket["sourceMode"]
  size?: number
  title?: string
}) {
  const w = `${size / 4}rem`
  const h = `${size / 4}rem`
  if (mode === "real-morpho") {
    return (
      <span
        aria-hidden="true"
        title={title ?? "live"}
        className="inline-block rounded-full bg-up"
        style={{ width: w, height: h }}
      />
    )
  }
  if (mode === "real-morpho-unlisted") {
    return (
      <span
        aria-hidden="true"
        title={title ?? "unlisted"}
        className="inline-block rounded-full bg-amber-500"
        style={{ width: w, height: h }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      title={title ?? "mock"}
      className="inline-block rounded-full bg-muted-foreground/40"
      style={{ width: w, height: h }}
    />
  )
}
