"use client"

/**
 * WalletButton
 *
 * Header CTA that swaps between two states:
 *
 *   - Not connected  → lime primary "Connect Wallet" — opens the
 *                      WalletSelectModal (spec §02).
 *   - Connecting     → compact "Connecting…" with spinner.
 *   - Connected      → compact shortened address (0x12A4…91F2) that
 *                      opens the existing WalletMenu on click.
 *
 * The wrong-network state is shown in the AppHeader's network
 * indicator, NOT here (per spec §07 of the original wallet task).
 */

import * as React from "react"
import { Wallet, Loader2 } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletMenu from "@/components/app/wallet/wallet-menu"
import WalletSelectModal from "@/components/app/wallet/wallet-select-modal"

export default function WalletButton() {
  const { status, shortAddress } = useWallet()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [selectOpen, setSelectOpen] = React.useState(false)

  // Initializing — silent restore (eth_accounts) is in flight. We do
  // NOT want to flash a "Connect Wallet" CTA here, because the wallet
  // might already be authorized and the next paint will show the
  // shortened address. Render a deterministic disabled button so the
  // header layout doesn't shift when the real state arrives.
  if (status === "initializing") {
    return (
      <>
        <button
          type="button"
          disabled
          aria-label="Wallet initializing"
          title="Restoring wallet state"
          data-status={status}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-mono opacity-60 cursor-wait"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>WALLET</span>
        </button>
        <WalletSelectModal open={selectOpen} onOpenChange={setSelectOpen} />
      </>
    )
  }

  // Not connected → open the selection modal
  if (status === "idle" || status === "available" || status === "disconnected") {
    const label =
      status === "disconnected" ? "Reconnect" : "Connect Wallet"
    return (
      <>
        <button
          type="button"
          onClick={() => setSelectOpen(true)}
          className="inline-flex items-center gap-2 h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors"
          aria-label={label}
          aria-haspopup="dialog"
          title={label}
          data-status={status}
        >
          <Wallet className="w-4 h-4" />
          <span>{label}</span>
        </button>
        <WalletSelectModal open={selectOpen} onOpenChange={setSelectOpen} />
      </>
    )
  }

  // Connecting — show a deterministic pending state on the button itself
  // (the modal also shows its own connecting strip if it's open).
  if (status === "connecting") {
    return (
      <>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium opacity-90 cursor-progress"
          aria-label="Connecting wallet"
          title="Awaiting wallet approval"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Connecting…</span>
        </button>
        <WalletSelectModal open={selectOpen} onOpenChange={setSelectOpen} />
      </>
    )
  }

  // Connected or wrong-network → show shortened address as a pill that
  // opens the existing WalletMenu dropdown.
  return (
    <WalletMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <button
        type="button"
        aria-label={`Wallet ${shortAddress}`}
        title={shortAddress ?? "Wallet"}
        data-status={status}
        className="inline-flex items-center gap-2 h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors"
      >
        <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-primary-foreground opacity-70 animate-ping" />
          <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-primary-foreground" />
        </span>
        <span>{shortAddress}</span>
      </button>
    </WalletMenu>
  )
}
