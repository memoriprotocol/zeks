/**
 * /terminal/docs — user-facing how-to guide.
 *
 *   Server page, but the guide itself is static client-rendered text.
 *   Wrapped in AppShell so the sidebar and toolbar match every other
 *   page. No market fetches, no wallet reads, no dynamic data.
 */

import AppShell from "@/components/app/app-shell"
import DocsPage from "@/components/docs/docs-page"

export const metadata = {
  title: "ZEKS Terminal — Docs",
}

export default function DocsRoute() {
  return (
    <AppShell>
      <DocsPage />
    </AppShell>
  )
}
