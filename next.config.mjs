/** @type {import('next').NextConfig} */

/**
 * This repo builds TWO deployments from one source.
 *
 *   NEXT_PUBLIC_APP_SURFACE=app    -> app.zeks.fund  (terminal)
 *   NEXT_PUBLIC_APP_SURFACE=docs   -> docs.zeks.fund (documentation)
 *
 * Routing between the two is handled here rather than in a
 * middleware or in per-page conditionals, because both surfaces
 * ship their own bundles: the terminal code never reaches a docs
 * visitor, and the docs never reach a terminal visitor.
 */

const surface = process.env.NEXT_PUBLIC_APP_SURFACE === "app" ? "app" : "docs"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  async rewrites() {
    if (surface !== "docs") return []
    // On the docs surface, "/docs" is the path we advertise and the
    // path that appears in shared examples, but the site lives at
    // the root. Map it rather than serving the same page twice.
    return [{ source: "/docs", destination: "/" }]
  },

  async redirects() {
    if (surface !== "app") return []
    // On the app surface, /docs belongs to another domain. Pointing
    // it at the external docs host means any old or hand-typed link
    // still lands somewhere correct instead of 404ing.
    const docsHost = process.env.NEXT_PUBLIC_DOCS_URL
    if (typeof docsHost !== "string" || docsHost.trim().length === 0) {
      return []
    }
    return [
      {
        source: "/docs",
        destination: docsHost.trim().replace(/\/+$/, ""),
        permanent: false,
      },
    ]
  },
}

export default nextConfig
