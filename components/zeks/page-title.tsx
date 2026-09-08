"use client"

/**
 * Page-level primitives · shared by every dashboard composition.
 *
 *   <PageTitle>Dashboard</PageTitle>
 *   <SectionTitle>Live Liquidity</SectionTitle>
 *
 * Per spec (measured reference):
 *   · Page title  → 26px serif, -0.04em
 *   · Section heading → 13px mono uppercase
 */

import * as React from "react"

interface PageTitleProps {
  children: React.ReactNode
  className?: string
}

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <h1
      className={["font-serif text-foreground", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        fontSize: "var(--font-dash-title)",
        lineHeight: 1.1,
        letterSpacing: "-0.04em",
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
      className={["flex items-baseline justify-between gap-3", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ marginBottom: "var(--dash-heading-gap)" }}
      data-testid="section-title"
    >
      <span
        className="font-mono uppercase"
        style={{
          fontSize: "var(--font-section-head)",
          color: "var(--foreground)",
          letterSpacing: "0.04em",
        }}
      >
        {children}
      </span>
      {trailing ? (
        <span
          className="font-mono"
          style={{
            fontSize: "11px",
            color: "var(--muted-foreground)",
          }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  )
}
