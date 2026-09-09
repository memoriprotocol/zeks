"use client"

/**
 * Metric — large numeric value + small caption + optional tone.
 *
 * Used by MarketCapacity stats and hero metrics.
 *
 * Typography: serif is reserved for headings / prominent names.
 * This metric uses clean sans tabular numerals (`zeks-num-*`).
 */

import * as React from "react"

type Tone = "default" | "up" | "down" | "muted"

interface MetricProps {
  label: string
  value: React.ReactNode
  caption?: string
  tone?: Tone
  size?: "hero" | "lg" | "md"
  className?: string
}

const SIZE_CLS = {
  hero: "zeks-num-xl",
  lg: "zeks-num-lg",
  md: "zeks-num-summary",
}

const TONE_CLS: Record<Tone, string> = {
  default: "text-foreground",
  up: "text-up",
  down: "text-down",
  muted: "text-muted-foreground",
}

export function Metric({
  label,
  value,
  caption,
  tone = "default",
  size = "lg",
  className,
}: MetricProps) {
  return (
    <div className={["min-w-0", className ?? ""].filter(Boolean).join(" ")}>
      <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70">
        {label}
      </div>
      <div
        className={[
          SIZE_CLS[size],
          TONE_CLS[tone],
          "mt-2",
        ].join(" ")}
      >
        {value}
      </div>
      {caption ? (
        <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60 mt-2">
          {caption}
        </div>
      ) : null}
    </div>
  )
}
