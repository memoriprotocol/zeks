import AppShell from "@/components/app/app-shell"
import LoopComposition from "@/components/loop/loop-composition"

export const dynamic = "force-dynamic"

/**
 * /terminal/loop
 *
 * Loopr-style stock-collateral → borrow → yield composition view.
 * Read-only. No transactions.
 *
 * Phase 1: selector-driven carry calculator using existing Morpho
 * market data. Supply / Borrow flows are gated behind future phases.
 */
export default function LoopPage() {
  return (
    <AppShell current="loop">
      <LoopComposition />
    </AppShell>
  )
}
