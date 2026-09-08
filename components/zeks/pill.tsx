"use client"

/**
 * Pill — small mono-letter-spaced label with optional tone.
 *
 * Used for live/circuit badges, status chips, ranking markers.
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
    "border-border bg-secondary/40 text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-foreground",
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
  muted: "border-border bg-transparent text-muted-foreground/70",
}

const DOT_CLS: Record<Tone, string> = {
  neutral: "bg-foreground/60",
  primary: "bg-primary",
  up: "bg-up",
  down: "bg-down",
  muted: "bg-muted-foreground/40",
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
        "inline-flex items-center gap-1.5 h-5 px-1.5 rounded-md font-mono text-[10px] tracking-wide border",
        TONE_CLS[tone],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={["w-1.5 h-1.5 rounded-full", DOT_CLS[tone]].join(" ")}
        />
      ) : null}
      {children}
    </span>
  )
}
