import AppShell from "@/components/app/app-shell"
import BorrowLive from "@/components/borrow/borrow-live"

export const metadata = { title: "ZEKS Terminal — Borrow" }

export default function TerminalBorrowPage() {
  return (
    <AppShell current="borrow" title="BORROW">
      <div className="max-w-5xl">
        <BorrowLive />
      </div>
    </AppShell>
  )
}
