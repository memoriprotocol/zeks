/**
 * Deployment surface — which site is this build?
 *
 * The repository builds TWO deployments from the same source:
 *
 *   APP_SURFACE=app    -> app.zeks.fund
 *                          full terminal: /terminal/*, /api/*
 *   APP_SURFACE=docs   -> docs.zeks.fund
 *                          documentation only, served at the root
 *
 * Read at BUILD time, not runtime, and that is the point: the two
 * deployments ship different bundles, so terminal code never reaches
 * a docs visitor and vice versa, with no runtime branch and no
 * middleware in front of every request.
 *
 * APP is the default, not docs. The root route is the product
 * landing page, so defaulting the other way means a contributor who
 * clones this repo and runs `npm run dev` sees documentation in place
 * of the site they were building. Losing the landing page in local
 * dev is a confusing, hard-to-diagnose failure; losing docs is not,
 * because /terminal still works and docs still exist under their own
 * deployment.
 *
 * A docs deployment must set the variable explicitly. The exposure
 * risk runs the other way: a project created from this repo without
 * reading this file gets the landing page, not a trading terminal,
 * which is the safe direction to fail.
 */

export type AppSurface = "app" | "docs"

const raw = process.env.NEXT_PUBLIC_APP_SURFACE

export const APP_SURFACE: AppSurface = raw === "docs" ? "docs" : "app"

/** True when this build serves the app: landing page plus terminal. */
export const IS_APP_SURFACE: boolean = APP_SURFACE === "app"

/** True when this build serves the documentation site. */
export const IS_DOCS_SURFACE: boolean = APP_SURFACE === "docs"
