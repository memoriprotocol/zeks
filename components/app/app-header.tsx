"use client"

import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { Toaster } from "sonner"
import { useWallet } from "@/components/app/wallet/use-wallet"
import WalletButton from "@/components/app/wallet/wallet-button"

interface AppHeaderProps {
  /** Optional compact page title shown in the header */
  title?: string
}

/**
 * AppHeader (v3 — Loopr-density)
 *
 * Compact top bar (h-12) with:
 *   - Wordmark pill on mobile, hidden on desktop (sidebar handles brand)
 *   - Compact page title (when provided)
 *   - Slim network pill
 *   - Connect Wallet button
 *
 * Search input removed (was a dev-era placeholder and is not needed
 * for an app of this density).
 */
export default function AppHeader(props: AppHeaderProps) {
  return (
    <>
      <Toaster
        position="top-right"
        theme="light"
        toastOptions={{
          classNames: {
            toast: "border border-border bg-card text-foreground rounded-xl",
            title: "text-xs font-mono",
            description: "text-[10px] font-mono text-muted-foreground",
          },
        }}
      />
      <AppHeaderChrome {...props} />
    </>
  )
}

function AppHeaderChrome({ title }: AppHeaderProps) {
  const { lastError, status, switchToRobinhoodChain } = useWallet()

  React.useEffect(() => {
    if (!lastError) return
    const id = toast.error(lastError.message, {
      description: "Robinhood Chain",
      duration: 4500,
    })
    return () => {
      toast.dismiss(id)
    }
  }, [lastError])

  const isWrongNetwork = status === "wrong-network"

  return (
    <header className="h-12 border-b border-border bg-card flex items-center px-4 md:px-6 gap-3 shrink-0">
      {/* Mobile brand (sidebar handles it on desktop) */}
      <Link
        href="/terminal"
        className="flex items-center gap-1.5 md:hidden shrink-0"
        aria-label="ZEKS"
      >
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="font-serif text-[15px] font-semibold tracking-tight text-foreground leading-none">
          ZEKS
        </span>
      </Link>

      {/* Page title */}
      {title ? (
        <span className="hidden md:inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium text-foreground shrink-0">
          {title}
        </span>
      ) : null}

      <div className="flex-1" />

      {/* Network pill */}
      {isWrongNetwork ? (
        <button
          type="button"
          onClick={() => void switchToRobinhoodChain()}
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-[11px] font-medium text-destructive shrink-0 hover:bg-destructive/15 transition-colors"
          aria-label="Switch to Robinhood Chain"
        >
          <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-destructive opacity-70 animate-ping" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
          </span>
          <span>Switch network</span>
        </button>
      ) : (
        <div
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-secondary/70 text-[11px] text-foreground shrink-0"
          aria-label="Network: Robinhood Chain"
        >
          <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          </span>
          <span className="font-medium">Robinhood Chain</span>
        </div>
      )}

      <WalletButton />
    </header>
  )
}
