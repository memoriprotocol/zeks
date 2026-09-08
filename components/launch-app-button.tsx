import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { launchAppHref, launchAppIsExternal } from "@/lib/app-url"

interface LaunchAppButtonProps {
  /** Visual variant — primary (lime) or ghost (outline) */
  variant?: "primary" | "outline"
  /** Include the trailing arrow icon */
  withArrow?: boolean
  /** Override the label, default "Launch App" */
  label?: string
  /** Extra classes (caller wins on padding/size) */
  className?: string
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors"

const VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "bg-transparent text-foreground border border-border hover:bg-secondary",
} as const

/**
 * LaunchAppButton
 *
 * Single source of truth for the landing-page entry into the ZEKS app.
 *
 * - In production: renders an external <a> to https://app.zeks.fun
 * - In development: renders an internal Next.js <Link> to /terminal
 *
 * Uses `lib/app-url.ts` for the URL decision. Do not hardcode URLs.
 */
export default function LaunchAppButton({
  variant = "primary",
  withArrow = true,
  label = "Launch App",
  className = "",
}: LaunchAppButtonProps) {
  const href = launchAppHref()
  const isExternal = launchAppIsExternal()

  const cls = cn(BASE, VARIANT[variant], className)

  const inner = (
    <>
      <span>{label}</span>
      {withArrow ? <ArrowRight className="w-4 h-4" aria-hidden="true" /> : null}
    </>
  )

  if (isExternal) {
    return (
      <a href={href} rel="noopener" className={cls} target="_self">
        {inner}
      </a>
    )
  }

  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  )
}
