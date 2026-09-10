"use client"

import AssetLogo from "@/components/asset-logo"
import { buildLogoDescriptor } from "@/lib/assets/logo"

export interface AssetIdentityItem {
  /** Ticker symbol, used to locate the logo file */
  symbol: string
  /** Optional asset name */
  name?: string | null
  /** Optional onchain contract address (trumps symbol for upstream logo). */
  contractAddress?: string | null
  /** Optional Robinhood /rhj/assets logoUrl. */
  rhLogoUrl?: string | null
  /** Optional explicit local URL. */
  src?: string | null
}

interface AssetIdentityProps {
  /** Single asset or pair — the component scales to any small N */
  assets: AssetIdentityItem[]
  /** Logo size in px. Default 22. Pairs are rendered with slight overlap. */
  size?: number
  /** Logo container shape (rounded square or circle). Default rounded. */
  shape?: "rounded" | "circle"
  /** Suffix text shown after logos. For pairs, use the pre-formatted label like "AAPL / USDG". */
  label?: string
  /** Negative margin (px) applied to each logo after the first, for pair overlap. Default 6. */
  overlap?: number
}

/**
 * AssetIdentity
 * Reusable asset identity row (single asset or pair) used across ZEKS surfaces.
 *
 * Renders:
 *   [LOGO]   [LOGO]  AAPL / USDG
 *
 * Visual contract (matches Markets + Borrow):
 * - Small, restrained AssetLogo container with the same neutral surface
 * - Slight overlap on pairs, never enlarged row heights
 * - Mono / muted ticker label beside the logo stack
 *
 * Reuse targets: Markets, Borrow, Yield, and the future /app interface.
 */
export default function AssetIdentity({
  assets,
  size = 22,
  shape = "rounded",
  label,
  overlap = 6,
}: AssetIdentityProps) {
  if (!assets.length) return null

  return (
    <div className="mt-1 inline-flex items-center">
      {/* Logo stack: each AssetLogo carries its own bg-secondary + border-border,
          so overlapping logos are separated by their native borders. */}
      <div className="flex items-center">
        {assets.map((a, i) => {
          const descriptor = buildLogoDescriptor({
            symbol: a.symbol,
            contractAddress: a.contractAddress ?? null,
            rhLogoUrl: a.rhLogoUrl ?? null,
            localLogoUrl: a.src ?? null,
          })
          return (
            <AssetLogo
              key={`${a.symbol}-${i}`}
              symbol={a.symbol}
              name={a.name ?? descriptor.symbol}
              size={size}
              shape={shape}
              src={descriptor.url ?? undefined}
              contractAddress={a.contractAddress ?? null}
              rhLogoUrl={a.rhLogoUrl ?? null}
              unresolved={descriptor.unresolved}
              className={i > 0 ? "relative" : ""}
              style={i > 0 ? { marginLeft: -overlap } : undefined}
            />
          )
        })}
      </div>

      {/* Optional label */}
      {label ? (
        <span className="ml-2 text-xs font-mono text-muted-foreground">{label}</span>
      ) : null}
    </div>
  )
}
