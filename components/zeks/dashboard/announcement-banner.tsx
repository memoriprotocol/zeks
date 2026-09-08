"use client"

/**
 * AnnouncementBanner — compact single-row strip.
 *
 *   warm off-white surface · rounded-2xl · p-5 (vertical 4) · mb-4
 *   mono metadata · thin border
 */

import * as React from "react"

export function AnnouncementBanner() {
  return (
    <div
      data-testid="section-announcement"
      aria-label="Announcement"
      className="flex items-center justify-between gap-3 border"
      style={{
        padding: "10px 20px",
        borderRadius: "var(--dash-card-radius)",
        backgroundColor: "var(--card-soft)",
        borderColor: "var(--border)",
        marginBottom: "var(--dash-banner-mb)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="font-mono uppercase shrink-0"
          style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            padding: "3px 8px",
            borderRadius: "4px",
            background: "var(--secondary)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          ZEKS
        </span>
        <p
          className="truncate"
          style={{
            fontSize: "var(--font-body)",
            color: "var(--foreground)",
            opacity: 0.78,
          }}
        >
          Live data from Morpho &amp; Chainlink on Robinhood Chain
        </p>
      </div>

      <span
        className="font-mono shrink-0 hidden md:inline"
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
        }}
      >
        Robinhood Chain · 4663
      </span>
    </div>
  )
}
