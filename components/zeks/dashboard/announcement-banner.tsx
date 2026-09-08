"use client"

/**
 * AnnouncementBanner — full-width strip under the page title.
 *
 *   Compact (56px), single row, mono metadata. Not a hero.
 *   No developer-facing copy.
 */

import * as React from "react"

export function AnnouncementBanner() {
  return (
    <div
      data-testid="section-announcement"
      aria-label="Announcement"
      className="w-full rounded-[14px] border border-border overflow-hidden flex items-center px-5"
      style={{
        height: "var(--dash-banner-h)",
        backgroundColor: "var(--card-soft)",
      }}
    >
      <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-md font-mono text-[10px] tracking-wide border border-primary/40 bg-primary/10 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        ZEKS
      </span>

      <span className="mx-4 hidden sm:inline-block w-px h-4 bg-border" />

      <p className="text-[13px] text-foreground/90 truncate" style={{ lineHeight: 1.4 }}>
        Live data from Morpho and Chainlink on Robinhood Chain.
      </p>

      <span className="ml-auto font-mono text-[10px] tracking-wide text-muted-foreground/70 hidden md:inline">
        Robinhood Chain · 4663
      </span>
    </div>
  )
}
