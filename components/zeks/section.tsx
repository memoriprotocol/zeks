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
        "px-4 py-2 border-b border-border flex items-center justify-between gap-3 flex-wrap",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80">
          {title.toUpperCase()}
        </span>
        {subtitle ? (
          <span className="text-[11px] text-muted-foreground truncate">
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
      className={[
        "px-4 py-1.5 border-t border-border font-mono text-[10px] tracking-wider text-muted-foreground/60 flex items-center justify-between gap-2 flex-wrap",
        className ?? "",
      ]
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
