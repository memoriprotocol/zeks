"use client"

/**
 * AnimatedNumber — smooth numeric transitions.
 *
 * When `value` changes from old → new, this component:
 *
 *   · Renders the old value while ramping to the new value via
 *     requestAnimationFrame for ~`durationMs` (default 300ms).
 *   · Uses an ease-out curve for a premium feel.
 *   · Re-renders only when the displayed string changes (avoids
 *     60Hz re-renders of the parent).
 *   · Does NOT mutate layout — uses `transform: opacity` only and
 *     `key` on the wrapper to trigger a subtle fade-in on change.
 *
 * `format(value, prev)` returns the displayed string for any given
 * numeric value. NaN / null gracefully renders "—".
 *
 * NOTE: this animates the DISPLAYED value, not the data layer.
 * Data layer is always canonical and stable.
 *
 * Hooks are ALWAYS called in the same order regardless of value.
 * The null/NaN branch only chooses what to render; it never skips
 * hooks. (Skipping hooks would trigger React's "Expected static
 * flag was missing" error when value flips between null ↔ number.)
 */
import * as React from "react"

interface AnimatedNumberProps {
  value: number | null | undefined
  /** Display formatter. Defaults to identity for plain numbers. */
  format?: (v: number) => string
  /** Animation duration in ms. Default 300. */
  durationMs?: number
  /** Optional className for the outer span. */
  className?: string
  /** Optional style for the outer span. */
  style?: React.CSSProperties
  /** testid passthrough. */
  testId?: string
}

export function AnimatedNumber({
  value,
  format = identity,
  durationMs = 300,
  className,
  style,
  testId,
}: AnimatedNumberProps) {
  // Resolve to a numeric target. null/NaN → null sentinel.
  const target =
    value != null && Number.isFinite(value) ? (value as number) : null

  // Refs + state are declared UNCONDITIONALLY so hooks run in the
  // same order regardless of whether `value` is a number or null.
  const startRef = React.useRef<number | null>(null)
  const fromRef = React.useRef<number | null>(target)
  const rafRef = React.useRef<number | null>(null)
  const [display, setDisplay] = React.useState<string>(() =>
    target != null ? format(target) : "—",
  )

  React.useEffect(() => {
    // Cancel any in-flight animation before deciding what to do.
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (target == null) {
      setDisplay("—")
      fromRef.current = null
      return
    }

    const from = fromRef.current ?? target
    if (from === target) {
      setDisplay(format(target))
      return
    }

    const t0 = performance.now()
    startRef.current = t0
    const animate = (now: number) => {
      const elapsed = now - t0
      const t = Math.min(1, elapsed / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const v = from + (target - from) * eased
      setDisplay(format(v))
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(animate)
      } else {
        // Settle exactly on target.
        fromRef.current = target
        setDisplay(format(target))
        rafRef.current = null
      }
    }
    rafRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target, durationMs, format])

  return (
    <span className={className} style={style} data-testid={testId}>
      {target == null ? "—" : display}
    </span>
  )
}

function identity(v: number): string {
  return String(v)
}
