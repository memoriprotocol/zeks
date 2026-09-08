"use client"

/**
 * Page-level primitives · shared by every dashboard composition.
 *
 *   <PageTitle>Dashboard</PageTitle>
 *   <SectionTitle>Live Liquidity</SectionTitle>
 *
 * Per spec: section titles live OUTSIDE cards; cards are quiet
 * beige surfaces beneath them. Mono tracking is reduced to `tracking-wide`
 * to avoid the "dev-console" feel.
 */

import * as React from "react"

interface PageTitleProps {
  children: React.ReactNode
  className?: string
}

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <h1
      className={[
        "font-serif text-foreground",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        fontSize: "28px",
        lineHeight: 1.1,
        letterSpacing: "-0.01em",
      }}
      data-testid="page-title"
    >
      {children}
    </h1>
  )
}

interface SectionTitleProps {
  children: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}

export function SectionTitle({
  children,
  trailing,
  className,
}: SectionTitleProps) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-3 px-0.5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="section-title"
    >
      <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
        {children}
      </span>
      {trailing ? (
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}
