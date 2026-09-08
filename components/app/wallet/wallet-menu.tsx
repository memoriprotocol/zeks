"use client"

/**
 * WalletMenu
 *
 * Compact ZEKS-styled dropdown for the connected wallet pill.
 * Uses the project's existing @radix-ui/react-dropdown-menu
 * (already a dependency).
 *
 * Per spec §06:
 *   - CONNECTED WALLET label
 *   - 0xFULL_WALLET_ADDRESS (full, copy-pastable)
 *   - Copy Address
 *   - View on Explorer (Blockscout)
 *   - Disconnect
 *
 * Compact, not a settings panel. Tokens match the rest of the
 * ZEKS terminal (white surface, cool border, mono labels).
 */

import * as React from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, Copy, ExternalLink, LogOut } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import { ROBINHOOD_BLOCKSCOUT_BASE } from "@/lib/wallet/robinhood-chain"

interface WalletMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export default function WalletMenu({
  open,
  onOpenChange,
  children,
}: WalletMenuProps) {
  const {
    address,
    copyAddress,
    openExplorer,
    disconnect,
    lastError,
    clearError,
  } = useWallet()
  const [copied, setCopied] = React.useState(false)
  const copyTimer = React.useRef<number | null>(null)

  const onCopy = React.useCallback(async () => {
    const ok = await copyAddress()
    if (!ok) return
    setCopied(true)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }, [copyAddress])

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
    }
  }, [])

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[280px] rounded-xl bg-card border border-border p-2 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* CONNECTED WALLET label */}
          <div className="px-2 py-1.5">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
              CONNECTED WALLET
            </p>
          </div>

          {/* Full address */}
          {address ? (
            <div className="px-2 pb-2 select-all">
              <p className="text-xs font-mono text-foreground break-all leading-relaxed">
                {address}
              </p>
            </div>
          ) : null}

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {/* Copy Address */}
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault()
              void onCopy()
            }}
            className="flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-secondary cursor-pointer outline-none data-[highlighted]:bg-secondary"
          >
            {copied ? (
              <Check className="w-4 h-4 text-foreground" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="font-mono text-xs">
              {copied ? "Copied" : "Copy Address"}
            </span>
          </DropdownMenu.Item>

          {/* View on Explorer */}
          <DropdownMenu.Item
            onSelect={() => openExplorer()}
            className="flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-secondary cursor-pointer outline-none data-[highlighted]:bg-secondary"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xs">View on Explorer</span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {ROBINHOOD_BLOCKSCOUT_BASE.replace(/^https?:\/\//, "")}
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {/* Disconnect */}
          <DropdownMenu.Item
            onSelect={() => {
              disconnect()
            }}
            className="flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-secondary cursor-pointer outline-none data-[highlighted]:bg-secondary"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xs">Disconnect</span>
          </DropdownMenu.Item>

          {/* Optional inline error footer */}
          {lastError ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <div className="px-2 py-2">
                <p className="text-[10px] font-mono text-destructive">{lastError.message}</p>
                <button
                  type="button"
                  onClick={() => clearError()}
                  className="mt-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
