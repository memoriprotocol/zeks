/**
 * External surface URLs.
 *
 * Single source of truth for any destination that is NOT a route
 * in this app. The docs site lives on its own domain
 * (docs.zeks.fund), so the terminal links outward to it.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_DOCS_URL — set on the APP deployment.
 *   2. A same-origin "/docs" — used on the docs deployment itself
 *      and in local dev, so neither a link into the void nor a
 *      needless cross-origin hop during development.
 *
 * The fallback is not a nicety. An unset env must never produce
 * href="undefined" or an empty anchor, because that renders a
 * dead control in the sidebar with no build-time error.
 *
 * Invariant: the docs deployment must NOT set this variable. It
 * would point docs visitors back at the terminal domain, which is
 * exactly the loop this split exists to prevent.
 */

/** Docs site base URL. No trailing slash. */
export const DOCS_URL: string = (() => {
  const raw = process.env.NEXT_PUBLIC_DOCS_URL
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, "")
  }
  return "/docs"
})()

/**
 * True when docs are hosted on a different origin than the app.
 *
 * External destinations must render as plain anchors opening in a
 * new tab, not next/link: the client router can only resolve paths
 * inside the current deployment and has no way to navigate away
 * from it.
 */
export const DOCS_IS_EXTERNAL: boolean = DOCS_URL.startsWith("http")

/**
 * The terminal, as seen FROM the docs surface.
 *
 * Reverse direction of DOCS_URL. Needed because the docs site is
 * on a different deployment entirely, so a relative "/terminal"
 * would resolve against docs.zeks.fund and 404. The same-origin
 * fallback keeps the docs site usable in local dev, where both
 * surfaces are the same process.
 */
export const APP_URL: string = (() => {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, "")
  }
  return "/terminal"
})()

/** Deep link into the markets screen, from the docs surface. */
export const APP_MARKETS_URL: string = `${APP_URL}/markets`

/**
 * True when the terminal lives on a different origin than docs.
 * Same reasoning as DOCS_IS_EXTERNAL, in the other direction.
 */
export const APP_IS_EXTERNAL: boolean = APP_URL.startsWith("http")
