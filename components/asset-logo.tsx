"use client"

import { CSSProperties, useEffect, useState } from "react"
import { resolveAssetLogo, buildLogoDescriptor } from "@/lib/assets/logo"

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
  /** Optional onchain contract address — trumps symbol for upstream logo. */
  contractAddress?: string | null
  /** Optional Robinhood asset-registry logoUrl — preferred when valid. */
  rhLogoUrl?: string | null
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
 *
 * Single-source logo renderer. Resolution priority (per data-quality
 * spec):
 *
 *   a) explicit `src` prop (local or remote)
 *   b) local registry (`/assets/logos/{SYMBOL}.png`)
 *   c) Robinhood /rhj/assets `rhLogoUrl` matched by contract address
 *   d) deterministic ticker-initial fallback (rendered before any
 *      network probe so a 404 is never visible)
 *
 * Preload-gated image swap: the letter fallback renders on the very
 * first paint; a `new Image()` probe runs in `useEffect` and only
 * swaps in the real <img> after `onload`. A failed probe is cached
 * in a session-scoped Map so we never re-request the same broken URL.
 */

const BROKEN_CACHE: Set<string> =
  typeof window === "undefined"
    ? new Set<string>()
    : ((window as unknown as { __zeksBrokenLogos?: Set<string> })
        .__zeksBrokenLogos ??= new Set<string>())

export default function AssetLogo({
  symbol,
  name,
  size = 30,
  src,
  contractAddress,
  rhLogoUrl,
  shape = "rounded",
  className = "",
  style,
  unresolved,
}: AssetLogoProps) {
  const descriptor = buildLogoDescriptor({
    symbol,
    contractAddress,
    rhLogoUrl,
    localLogoUrl: src,
  })

  // The resolver's URL wins when present. Otherwise the explicit `src`
  // prop is honored (legacy callers).
  const resolvedSrc = descriptor.url ?? src ?? null

  // First paint: always show the fallback. No <img> is mounted
  // until we have positive proof the URL actually resolves.
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageBroken, setImageBroken] = useState(false)

  const fallbackLetter = (symbol?.[0] ?? "?").toUpperCase()
  const isUnresolved = Boolean(unresolved ?? !descriptor.url)

  // Letter fallback sizing — scale with container
  const letterSize = Math.round(size * 0.46)
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-lg"

  // Preload-gated image swap. We never mount <img> until this
  // resolves with success; if it errors, we mark the URL as broken
  // and the fallback stays visible (no broken-image icon, no
  // console noise, no retry loop).
  useEffect(() => {
    setImageLoaded(false)
    setImageBroken(false)

    if (!resolvedSrc) return

    if (BROKEN_CACHE.has(resolvedSrc)) {
      setImageBroken(true)
      return
    }

    const probe = new Image()
    probe.decoding = "async"
    probe.onload = () => setImageLoaded(true)
    probe.onerror = () => {
      BROKEN_CACHE.add(resolvedSrc)
      setImageBroken(true)
    }
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
      title={name ?? descriptor.symbol}
      data-symbol={descriptor.symbol}
      data-unresolved={isUnresolved ? "true" : undefined}
      data-logo-source={descriptor.source}
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
          src={resolvedSrc ?? undefined}
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

// Re-export the descriptor helper so callers can compose with their
// own data without re-implementing the priority chain.
export { buildLogoDescriptor, resolveAssetLogo }
