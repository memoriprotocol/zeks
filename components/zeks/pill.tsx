"use client"

/**
 * Pill — small mono-letter-spaced label with optional tone + dot.
 *
 * Used for IN / OUT / TRANSFER chips, status badges, ranking markers.
 * Tighter padding, smaller radius — feels more like a label than a button.
 */

import * as React from "react"

type Tone = "neutral" | "up" | "down" | "muted" | "primary"

interface PillProps {
  children: React.ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
}

const TONE_CLS: Record<Tone, string> = {
  neutral:
    "border-border/60 bg-secondary/60 text-muted-foreground",
  primary: "border-primary/50 bg-primary/20 text-foreground",
  up:      "border-up/40 bg-up/15 text-up",
  down:    "border-down/40 bg-down/15 text-down",
  muted:   "border-border/40 bg-transparent text-muted-foreground/70",
}

const DOT_CLS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  primary: "bg-primary",
  up:      "bg-up",
  down:    "bg-down",
  muted:   "bg-muted-foreground/50",
}

export function Pill({
  children,
  tone = "neutral",
  dot,
  className,
}: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md",
        "font-mono text-[9.5px] tracking-wide border",
        TONE_CLS[tone],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={["w-1 h-1 rounded-full shrink-0", DOT_CLS[tone]].join(" ")}
        />
      ) : null}
      {children}
    </span>
  )
}
