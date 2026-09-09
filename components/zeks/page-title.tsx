"use client"

/**
 * Page-level primitives · shared by every dashboard composition.
 *
 *   <PageTitle>Dashboard</PageTitle>
 *   <SectionTitle>Live Liquidity</SectionTitle>
 *
 * Typography system:
 *   · PageTitle  → 26px serif, weight 400, -0.035em (editorial display)
 *   · SectionTitle → 13px mono uppercase (true section label)
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
          /* section labels use 10px, 0.08em tracking */
          fontSize: "var(--font-section-head)",
          letterSpacing: "0.04em",
          color: "var(--foreground)",
        }}
      >
        {children}
      </span>
      {trailing ? (
        <span
          className="zeks-num-sm"
          style={{
            color: "var(--muted-foreground)",
          }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  )
}
