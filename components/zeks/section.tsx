"use client"

/**
 * `Section` — base building block.
 *   <Section>
 *     <Section.Header title="…" subtitle="…" trailing={…} />
 *     <Section.Body>{children}</Section.Body>
 *     <Section.Footer>{…}</Section.Footer>
 *   </Section>
 *
 * Read-only · no interactions.
 */

import * as React from "react"

interface SectionProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  "aria-label"?: string
  "data-testid"?: string
}

export function Section({
  children,
  className,
  style,
  ...rest
}: SectionProps) {
  const cls = [
    "rounded-[14px] border border-border overflow-hidden",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <section
      className={cls}
      style={{ backgroundColor: "var(--card-soft)", ...style }}
      {...rest}
    >
      {children}
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  className?: string
}

function SectionHeader({
  title,
  subtitle,
  trailing,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={[
        "flex items-center justify-between gap-3 flex-wrap",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="zeks-label">{title}</span>
        {subtitle ? (
          <span
            className="font-sans"
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              fontWeight: 400,
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
      {trailing ? (
        <div className="flex items-center gap-3">{trailing}</div>
      ) : null}
    </header>
  )
}

function SectionBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className ?? ""}>
      {children}
    </div>
  )
}

function SectionFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <footer
      className={["zeks-section-footer", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </footer>
  )
}

Section.Header = SectionHeader
Section.Body = SectionBody
Section.Footer = SectionFooter
