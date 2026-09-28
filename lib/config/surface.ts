/**
 * Deployment surface — which site is this build?
 *
 * The repository builds TWO deployments from the same source:
 *
 *   APP_SURFACE=app    -> app.zeks.fund
 *                          full terminal: /terminal/*, /api/*
 *   APP_SURFACE=docs   -> docs.zeks.fund
 *                          documentation only: /docs redirects to /,
 *                          no terminal, no API routes
 *
 * This is read at BUILD time, not runtime, which is the point:
 * a docs deployment physically does not contain the terminal
 * bundle, so a docs build cannot leak the app, and an app build
 * does not need to evaluate terminal code for docs visitors.
 *
 * Docs is the default. The reasoning is that this repo is mostly
 * terminal, and a Vercel project created from it without reading
 * this file should not silently expose the app on a public docs
 * domain. Opting INTO app must be deliberate.
 */

export type AppSurface = "app" | "docs"

const raw = process.env.NEXT_PUBLIC_APP_SURFACE

export const APP_SURFACE: AppSurface = raw === "app" ? "app" : "docs"

/** True when this build serves the trading terminal. */
export const IS_APP_SURFACE: boolean = APP_SURFACE === "app"

/** True when this build serves the documentation site. */
export const IS_DOCS_SURFACE: boolean = APP_SURFACE === "docs"
