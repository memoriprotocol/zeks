"use client"

/**
 * Page-level primitives · shared by every dashboard composition.
 *
 *   <PageTitle>Dashboard</PageTitle>
 *   <SectionTitle>Live Liquidity</SectionTitle>
 *
 * UI-1 typography:
 *   · PageTitle  → 24px sans, weight 500, -0.02em (clean fintech display)
 *   · SectionTitle → 12px sans semibold (subtle, readable)
 */

import * as React from "react"

interface PageTitleProps {
  children: React.ReactNode
  className?: string
}

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <h1
      className={["zeks-display", className ?? ""]
        .filter(Boolean)
        .join(" ")}
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
        className="zeks-label"
        style={{
          fontSize: "var(--font-section-head)",
          letterSpacing: 0,
          color: "var(--foreground)",
        }}
      >
        {children}
      </span>
      {trailing ? (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            color: "var(--muted-foreground)",
            fontWeight: 500,
          }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  )
}
