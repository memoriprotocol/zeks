import type { Metadata } from "next"
import { IS_APP_SURFACE } from "@/lib/config/surface"
import LaunchpadPanel from "@/components/launchpad-panel"

export const metadata: Metadata = {
  title: "Launchpad — ZEKS",
  description:
    "Deploy a fixed-supply token to Robinhood Chain through Pons. Pool goes live and liquidity locks in one transaction.",
}

/**
 * /launchpad — token creation, on its own route.
 *
 * Separate from the landing page on purpose. Launching a token is a
 * deliberate act that ends in a signed transaction, and burying the
 * form at the bottom of a marketing scroll invites someone to sign
 * without having read what they are signing. A dedicated route gives
 * it its own title, its own history entry, and a Back link.
 *
 * Shares the app's colour tokens, so it reads as part of the product
 * rather than as a third surface.
 */
export default function LaunchpadPage() {
  if (!IS_APP_SURFACE) {
    // A docs build ships no wallet layer, so it ships no launchpad.
    return null
  }

  return (
    <main className="min-h-screen bg-background">
      <LaunchpadPanel />
    </main>
  )
}
