/**
 * ZEKS app URL helper.
 *
 * Production:
 *   https://app.zeks.fun
 *
 * Development (default):
 *   http://localhost:3000/terminal
 *
 * Override via NEXT_PUBLIC_APP_URL.
 *
 * This is the single source of truth for the "Launch App" entry point
 * across the landing site. The product app itself lives at app.zeks.fun
 * in production; we mirror it locally under /terminal for dev convenience.
 */

export const APP_PRODUCTION_URL = "https://app.zeks.fun"
export const APP_DEV_PATH = "/terminal"

function deriveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit && explicit.length > 0) return explicit

  if (process.env.NODE_ENV === "production") {
    return APP_PRODUCTION_URL
  }

  // Local development: same-origin under /terminal
  const port = process.env.PORT ?? "3000"
  return `http://localhost:${port}${APP_DEV_PATH}`
}

export const APP_URL = deriveAppUrl()

/**
 * Returns the href for the landing-page "Launch App" link.
 * - In production: external absolute URL to app.zeks.fun
 * - In development: internal Next.js route /terminal (same origin)
 */
export function launchAppHref(): string {
  if (process.env.NODE_ENV === "production") {
    return APP_PRODUCTION_URL
  }
  return APP_DEV_PATH
}

/**
 * Whether the "Launch App" link should render as an external <a>
 * (true in production where we leave the marketing domain).
 */
export function launchAppIsExternal(): boolean {
  return process.env.NODE_ENV === "production"
}
