"use client"

import { CSSProperties, useEffect, useState } from "react"
import { resolveAsset } from "@/lib/assets/registry"

interface AssetLogoProps {
  /** Ticker symbol, used to locate the logo file and as fallback initial */
  symbol: string
  /** Optional asset name — kept on the component for future use */
  name?: string | null
  /** Pixel size of the container (square). Default 30. */
  size?: number
  /**
   * Optional logo source. Can be:
   *   - A local path       "/assets/logos/AAPL.svg"  (default lookup)
   *   - An absolute URL    "https://..."              (remote / dynamic)
   *   - Undefined          (falls back to registry, then ticker-initial letter)
   */
  src?: string
  /** Container shape: "rounded" (default, soft rounded square) or "circle" (pill-ready) */
  shape?: "rounded" | "circle"
  /** Additional classes */
  className?: string
  /** Optional inline style override (e.g. negative margin for pair overlap) */
  style?: CSSProperties
  /**
   * Marks the logo as unresolved. The container renders
   * `data-unresolved="true"` so the next phase can target it for
   * replacement once the underlying token identity is confirmed.
   */
  unresolved?: boolean
}

/**
 * AssetLogo
 * Renders a small, neutral, softly-rounded logo container with an asset mark.
 *
 * Resolution order:
 *   1. Explicit `src` prop (local path OR remote URL — future stock tokens)
 *   2. Registry entry (lib/assets/registry.ts)
 *   3. `/assets/logos/{SYMBOL}.svg`
 *   4. Deterministic ticker-initial fallback (mono, muted)
 *
 * The container itself is intentionally a quiet surface (bg-secondary +
 * border) so ANY logo above it reads as authentic without the chrome
 * dragging the row height around.
 *
 * Designed to scale to:
 *   stock tokens, crypto assets, stablecoins, future RH-Chain tokens,
 *   launchpad assets — and to accept external logoUrl values when the
 *   Stock Token registry hydrates.
 *
 * --------------------------------------------------------------------------
 * FALLBACK-FIRST RENDER (locked in for Markets List V1)
 *
 * Per the visual cleanup spec: a browser broken-image icon MUST NOT
 * appear. The previous implementation mounted <img> eagerly and only
 * swapped to the letter fallback on the `error` event — which left a
 * brief "broken image" flash on any 404. In the Featured grid (six
 * logos side by side) even a one-frame flash is visually distracting.
 *
 * The new implementation inverts the order:
 *
 *   - Render the neutral letter fallback on the very first paint.
 *   - Kick off `new Image()` preload in `useEffect`. Preload is async
 *     and never blocks the initial render, so no broken-image icon
 *     can ever be visible on screen.
 *   - Only swap the fallback for the real <img> AFTER the preload
 *     reports `onload`. If the preload errors, the fallback stays
 *     visible and we mark `imageBroken = true` so we don't retry.
 *
 * Net effect: every AssetLogo always shows either the real logo OR
 * the neutral ZEKS fallback — never a browser broken-image icon.
 * We never invent a brand logo: missing-asset states use the same
 * neutral letter fallback the rest of the app already uses.
 */
export default function AssetLogo({
  symbol,
  name,
  size = 30,
  src,
  shape = "rounded",
  className = "",
  style,
  unresolved,
}: AssetLogoProps) {
  // First paint: always show the fallback. No <img> is mounted
  // until we have positive proof the URL actually resolves.
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageBroken, setImageBroken] = useState(false)

  const fallbackLetter = (symbol?.[0] ?? "?").toUpperCase()
  const entry = resolveAsset(symbol)
  const resolvedSrc =
    src ?? entry.logoUrl ?? `/assets/logos/${symbol}.svg`
  const isUnresolved = Boolean(unresolved ?? entry.unresolved)

  // Letter fallback sizing — scale with container
  const letterSize = Math.round(size * 0.46)
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-lg"

  // Preload-gated image swap. We never mount <img> until this
  // resolves with success; if it errors, we mark the URL as broken
  // and the fallback stays visible (no broken-image icon, no
  // console noise, no retry loop).
  useEffect(() => {
    // Reset on URL change so a future src swap gets a fresh attempt.
    setImageLoaded(false)
    setImageBroken(false)

    if (!resolvedSrc) return

    const probe = new Image()
    probe.decoding = "async"
    probe.onload = () => setImageLoaded(true)
    probe.onerror = () => setImageBroken(true)
    probe.src = resolvedSrc

    return () => {
      probe.onload = null
      probe.onerror = null
    }
  }, [resolvedSrc])

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${shapeClass} bg-secondary border border-border ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
      title={name ?? entry.name ?? symbol}
      data-symbol={entry.symbol}
      data-unresolved={isUnresolved ? "true" : undefined}
      data-asset-kind={entry.kind}
      data-logo-state={
        imageLoaded
          ? "loaded"
          : imageBroken
            ? "fallback-broken"
            : "fallback-pending"
      }
    >
      {imageLoaded && !imageBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc}
          alt=""
          width={size}
          height={size}
          className="block h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <span
          className="font-mono font-medium text-foreground/70 leading-none"
          style={{ fontSize: letterSize }}
        >
          {fallbackLetter}
        </span>
      )}
    </div>
  )
}
