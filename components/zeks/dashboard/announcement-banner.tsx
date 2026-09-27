"use client"

/**
 * AnnouncementBanner — compact single-row strip.
 *
 *   sage-cream surface · rounded-2xl · soft border · p-3
 *   sans labels and meta
 */

import * as React from "react"

export function AnnouncementBanner() {
  return (
    <div
      data-testid="section-announcement"
      aria-label="Announcement"
      className="flex items-center justify-between gap-3 border"
      style={{
        padding: "10px 16px",
        borderRadius: "10px",
        backgroundColor: "var(--card-soft)",
        borderColor: "var(--border)",
        marginBottom: "16px",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="shrink-0"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11px",
            letterSpacing: "0.04em",
            padding: "3px 9px",
            borderRadius: "6px",
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            fontWeight: 600,
          }}
        >
          Robinhood Chain
        </span>
        <p
          className="truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            color: "var(--foreground)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          Live data from Morpho & Chainlink on Robinhood Chain
        </p>
      </div>

      <span
        className="shrink-0 hidden md:inline"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "11.5px",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        Chain ID 4663
      </span>
    </div>
  )
}
