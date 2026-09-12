import AppShell from "@/components/app/app-shell"
import ActivityLive from "@/components/activity/activity-live"

export const metadata = { title: "ZEKS Terminal — Activity" }

export default function TerminalActivityPage() {
  return (
    <AppShell current="activity">
      <ActivityLive />
    </AppShell>
  )
}
