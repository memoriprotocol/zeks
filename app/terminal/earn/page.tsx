import AppShell from "@/components/app/app-shell"
import EarnLive from "@/components/earn/earn-live"

export const metadata = { title: "ZEKS Terminal — Earn" }

export default function TerminalEarnPage() {
  return (
    <AppShell current="earn" title="EARN">
      <EarnLive />
    </AppShell>
  )
}
