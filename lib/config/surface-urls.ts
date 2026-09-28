/**
 * External surface URLs.
 *
 * Single source of truth for any destination that is NOT a route
 * in this app. The docs site in particular is meant to live on its
 * own domain (docs.zeks.fund) rather than under the app's path, so
 * moving it to a different host later is an env edit, not a code
 * change.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_DOCS_URL — set in the deploy environment.
 *   2. "/docs"              — same-origin fallback, so local dev and
 *                             previews of the app never link into
 *                             the void.
 *
 * The fallback matters: an unset env must not produce an href of
 * "undefined" or an empty anchor, which would silently render a
 * dead control in the sidebar.
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
 * External links should open in a new tab and must not use the
 * client-side router, or Next will try to resolve a path that does
 * not exist on this deployment.
 */
export const DOCS_IS_EXTERNAL: boolean = DOCS_URL.startsWith("http")
