"use client"

/**
 * Pill — small sans-serif label with optional tone + dot.
 *
 * Used for In/Out/Transfer chips, status badges.
 * Tighter padding, small radius — feels like a label, not a button.
 */

import * as React from "react"

type Tone = "neutral" | "up" | "down" | "muted" | "primary"

interface PillProps {
  children: React.ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
}

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  neutral: {
    borderColor: "var(--border)",
    backgroundColor: "var(--secondary)",
    color: "var(--muted-foreground)",
  },
  primary: {
    borderColor: "color-mix(in srgb, var(--primary) 50%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--primary) 22%, transparent)",
    color: "var(--foreground)",
  },
  up: {
    borderColor: "color-mix(in srgb, var(--up) 40%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--up) 12%, transparent)",
    color: "var(--up)",
  },
  down: {
    borderColor: "color-mix(in srgb, var(--down) 40%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--down) 12%, transparent)",
    color: "var(--down)",
  },
  muted: {
    borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
  },
}

const DOT_COLOR: Record<Tone, string> = {
  neutral: "var(--muted-foreground)",
  primary: "var(--primary)",
  up: "var(--up)",
  down: "var(--down)",
  muted: "var(--muted-foreground)",
}

export function Pill({
  children,
  tone = "neutral",
  dot,
  className,
}: PillProps) {
  return (
    <span
      className={["inline-flex items-center gap-1.5", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        height: "20px",
        padding: "0 8px",
        borderRadius: "999px",
        border: "1px solid",
        fontFamily: "var(--font-sans)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: 0,
        lineHeight: 1.2,
        ...TONE_STYLE[tone],
      }}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{
            width: "5px",
            height: "5px",
            backgroundColor: DOT_COLOR[tone],
            opacity: 0.85,
          }}
        />
      ) : null}
      {children}
    </span>
  )
}
