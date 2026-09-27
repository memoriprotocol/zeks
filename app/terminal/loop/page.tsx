import AppShell from "@/components/app/app-shell"
import LoopComposition from "@/components/loop/loop-composition"

export const dynamic = "force-dynamic"

/**
 * /terminal/loop
 *
 * Loopr-style stock-collateral → borrow → yield composition view.
 * Surfaces a carry calculator AND a `LoopTransactionPanel` (F13)
 * that wires the locked supply / borrow writers for the selected
 * stock + venue pair. Per-tab F12 lifecycle + readiness gates
 * control every CTA.
 */
export default function LoopPage() {
  return (
    <AppShell>
      <LoopComposition />
    </AppShell>
  )
}

