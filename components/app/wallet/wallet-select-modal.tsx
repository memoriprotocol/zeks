"use client"

/**
 * WalletSelectModal — final ZEKS Connect Wallet modal.
 *
 * Visual structure (per the wallet-modal-final task):
 *
 *   ┌────────────────────────────────────────────┐
 *   │ Connect Wallet                          ×  │
 *   │ Connect to ZEKS on Robinhood Chain.        │
 *   │                                            │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ [icon] MetaMask       ● Installed   →  │ │
 *   │ │ ────────────────────────────────────── │ │
 *   │ │ [icon] Rabby        Not installed  ↗   │ │
 *   │ │ ────────────────────────────────────── │ │
 *   │ │ [icon] Coinbase      Not installed ↗   │ │
 *   │ │ ────────────────────────────────────── │ │
 *   │ │ [icon] Robinhood     Not installed ↗   │ │
 *   │ │ ────────────────────────────────────── │ │
 *   │ │ [icon] WalletConnect Not configured    │ │
 *   │ │ ────────────────────────────────────── │ │
 *   │ │ [icon] Browser Wallet Available   →    │ │
 *   │ └────────────────────────────────────────┘ │
 *   │                                            │
 *   │ Robinhood Chain · 4663      Non-custodial │
 *   └────────────────────────────────────────────┘
 *
 * Design rules:
 *   - ONE coherent list container, NOT six floating rounded cards.
 *   - 1px dividers between rows (border-b last:border-b-0).
 *   - Each row: ~52–58px tall, icon-left, name-left, status-right,
 *     trailing action glyph (`→` connect, `↗` install, none for
 *     not-configured).
 *   - Sans typography for the modal body (ZEKS SANS / DM Sans). Mono
 *     only for the footer technical microcopy.
 *   - Modal width: ~420px (max-w-[420px]). Compact, not tiny.
 *   - Outer chrome: ZEKS white surface, 1px border, restrained shadow,
 *     moderate radius — feels integrated with the Terminal, not
 *     "stacked cards on glass".
 *
 * Wallet BRAND ASSET POLICY (unchanged):
 *   ZEKS does NOT ship hand-drawn brand SVGs. Branded wallets default
 *   to `icon: null`; the modal renders the neutral `/wallets/browser.svg`
 *   whenever the row's icon is null or fails to load. Installed EIP-6963
 *   providers replace the placeholder with their own authentic
 *   `info.icon`, but only after the strict allowlist / origin / scheme
 *   safety check in `sanitizeProviderIcon()`.
 */

import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X, ArrowUpRight, ChevronRight, Loader2 } from "lucide-react"
import { useWallet } from "@/components/app/wallet/use-wallet"
import type { WalletDescriptor, WalletKind } from "@/lib/wallet/providers"

interface WalletSelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Single neutral fallback icon — the only non-brand asset in
 * /public/wallets. Same path for every wallet that has no canonical
 * brand asset available at runtime.
 */
const NEUTRAL_FALLBACK_ICON = "/wallets/browser.svg"

/* ------------------------------------------------------------------ */
/* Status helpers                                                     */
/* ------------------------------------------------------------------ */

type StatusTone = "ok" | "muted" | "muted-faded" | "warn"

function statusLabel(d: WalletDescriptor): {
  text: string
  tone: StatusTone
} {
  // WalletConnect gets its own branch so the developer-action status is
  // unambiguous ("Not configured", warning tone, no misleading arrow).
  if (d.kind === "walletconnect") {
    if (d.availability === "not-configured")
      return { text: "Not configured", tone: "warn" }
    if (d.availability === "available")
      return { text: "Available", tone: "muted" }
    if (d.availability === "installed")
      return { text: "Installed", tone: "ok" }
    return { text: "Not installed", tone: "muted-faded" }
  }
  if (d.availability === "installed") return { text: "Installed", tone: "ok" }
  if (d.availability === "available") return { text: "Available", tone: "muted" }
  if (d.availability === "unavailable")
    return { text: "Unavailable", tone: "muted-faded" }
  return { text: "Not installed", tone: "muted-faded" }
}

type RowAction = "connect" | "install" | "none"

function rowAction(d: WalletDescriptor): RowAction {
  // Connect: installed, available, browser-with-injected.
  if (
    d.availability === "installed" ||
    d.availability === "available"
  ) {
    return "connect"
  }
  // Install: not-installed branded wallet with a verified vendor URL.
  if (d.availability === "not-installed" && d.walletInstallUrl) {
    return "install"
  }
  // Nothing: not-configured (WalletConnect), unavailable (Browser Wallet
  // with no provider), or not-installed without install URL.
  return "none"
}

function isRowDisabled(
  d: WalletDescriptor,
  pending: boolean,
): boolean {
  if (pending) return true
  // WalletConnect not-configured: visible but inert.
  if (d.kind === "walletconnect" && d.availability === "not-configured")
    return true
  // Browser Wallet with no underlying injected provider: inert.
  if (d.kind === "browser" && d.availability === "unavailable") return true
  // Not-installed wallets are inert from the hook side; the modal
  // routes them to the install page via `openInstallPage` instead.
  if (d.availability === "not-installed") return true
  return false
}

/* ------------------------------------------------------------------ */
/* Wallet row                                                         */
/* ------------------------------------------------------------------ */

function WalletRow({
  d,
  pending,
  onConnect,
  onInstall,
}: {
  d: WalletDescriptor
  pending: boolean
  onConnect: (d: WalletDescriptor) => void
  onInstall: (d: WalletDescriptor) => void
}) {
  const s = statusLabel(d)
  const action = rowAction(d)
  const disabled = isRowDisabled(d, pending)

  // Fallback safety: if the row has no icon at all OR the icon fails
  // to load, swap to the neutral Browser Wallet icon. The modal never
  // shows the browser's broken-image placeholder, and it never
  // substitutes a homemade brand logo.
  const [erroredIcon, setErroredIcon] = React.useState(false)
  const iconSrc = !d.icon || erroredIcon ? NEUTRAL_FALLBACK_ICON : d.icon

  // Status pill colours: kept restrained. Only the dot for "Installed"
  // uses ZEKS lime; everything else is muted or warn.
  const statusColor =
    s.tone === "ok"
      ? "text-foreground"
      : s.tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : s.tone === "muted-faded"
          ? "text-muted-foreground/70"
          : "text-muted-foreground"

  const handleClick = React.useCallback(() => {
    if (disabled) return
    if (action === "install") onInstall(d)
    else if (action === "connect") onConnect(d)
  }, [disabled, action, d, onConnect, onInstall])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handleClick()
      }
    },
    [disabled, handleClick],
  )

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-wallet-kind={d.kind}
      data-wallet-availability={d.availability}
      data-wallet-status={s.text.toLowerCase().replace(/\s+/g, "-")}
      data-wallet-action={action}
      data-wallet-icon-src={d.icon && !erroredIcon ? "provider" : "neutral-fallback"}
      title={
        action === "install" && d.walletInstallUrl
          ? `Open ${d.name}'s official page in a new tab`
          : disabled && s.tone === "warn"
            ? "WalletConnect is not configured on this ZEKS build"
            : d.name
      }
      className={
        "flex items-center gap-3 px-4 h-[54px] select-none transition-colors " +
        // Row separators: every row except the last gets a 1px divider.
        "border-b border-border last:border-b-0 " +
        // Hover only for actionable rows.
        (action === "none"
          ? "cursor-not-allowed opacity-60 "
          : action === "install"
            ? "cursor-pointer hover:bg-secondary/60 "
            : "cursor-pointer hover:bg-secondary/60 ")
      }
    >
      {/* 32px icon container — fixed size, object-contain, sharp at all
          pixel densities because the asset is an SVG. The image is
          rendered as <img> (not inline SVG) so any remote provider
          icon is rendered as inert pixels even if its SVG payload
          contained <script>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        width={32}
        height={32}
        onError={() => {
          if (!erroredIcon) setErroredIcon(true)
        }}
        className="block h-8 w-8 rounded-md object-contain bg-card border border-border shrink-0"
        draggable={false}
      />

      {/* Wallet name + status — sans typography throughout */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-[14px] font-sans font-medium text-foreground leading-none truncate">
          {d.name}
        </span>
      </div>

      {/* Status text — restrained */}
      <span
        className={
          "text-[12px] font-sans leading-none whitespace-nowrap " + statusColor
        }
      >
        {s.tone === "ok" ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
            />
            {s.text}
          </span>
        ) : (
          s.text
        )}
      </span>

      {/* Trailing action glyph */}
      <span
        aria-hidden="true"
        className={
          "shrink-0 inline-flex items-center justify-center w-4 h-4 " +
          (action === "none"
            ? "text-transparent"
            : "text-muted-foreground group-hover:text-foreground")
        }
      >
        {action === "connect" ? (
          <ChevronRight className="w-4 h-4" />
        ) : action === "install" ? (
          <ArrowUpRight className="w-4 h-4" />
        ) : null}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

export default function WalletSelectModal({
  open,
  onOpenChange,
}: WalletSelectModalProps) {
  const {
    availableWallets,
    selectAndConnect,
    openInstallPage,
    reconnect,
    status,
    clearError,
    activeWalletKind,
  } = useWallet()

  const pending = status === "connecting"

  // Auto-close once we're connected or on the wrong network.
  React.useEffect(() => {
    if (!open) return
    if (status === "connected" || status === "wrong-network") {
      onOpenChange(false)
    }
  }, [open, status, onOpenChange])

  const onConnect = React.useCallback(
    async (d: WalletDescriptor) => {
      clearError()
      await selectAndConnect(d)
    },
    [clearError, selectAndConnect],
  )

  const onInstall = React.useCallback(
    (d: WalletDescriptor) => {
      clearError()
      openInstallPage(d)
    },
    [clearError, openInstallPage],
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[420px] rounded-xl bg-card border border-border shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby="zeks-wallet-modal-desc"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <Dialog.Title className="font-sans text-[16px] font-semibold text-foreground leading-tight">
                Connect Wallet
              </Dialog.Title>
              <Dialog.Description
                id="zeks-wallet-modal-desc"
                className="font-sans text-[12px] text-muted-foreground mt-1 leading-snug"
              >
                Connect to ZEKS on Robinhood Chain.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Pending state strip */}
          {pending ? (
            <div
              className="mx-5 mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60 border border-border"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs font-sans text-muted-foreground">
                Connecting…
              </span>
            </div>
          ) : null}

          {/* Reconnect shortcut — only when there is an active wallet kind
              AND the user is currently in a connectable state. */}
          {!pending &&
          activeWalletKind &&
          status !== "connected" &&
          status !== "wrong-network" ? (
            <button
              type="button"
              onClick={() => void reconnect()}
              className="mx-5 mt-4 w-auto inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-sans hover:bg-primary/90 transition-colors"
            >
              Reconnect
            </button>
          ) : null}

          {/* Wallet list — single coherent container, 1px dividers
              between rows, no nested rounded cards. */}
          <div
            className={
              "mx-5 mt-4 mb-4 overflow-hidden rounded-lg border border-border bg-card " +
              "divide-y divide-border"
            }
            role="list"
            aria-label="Available wallets"
          >
            {availableWallets.length === 0 ? (
              <div className="px-4 h-[54px] flex items-center">
                <p className="text-xs font-sans text-muted-foreground">
                  Scanning for installed wallets…
                </p>
              </div>
            ) : (
              availableWallets.map((w) => (
                <WalletRow
                  key={`${w.rdns}::${w.uuid}`}
                  d={w}
                  pending={pending}
                  onConnect={onConnect}
                  onInstall={onInstall}
                />
              ))
            )}
          </div>

          {/* Footer — single line, mono microcopy. Whitespace-nowrap +
              flex layout so it stays one line at the modal width. */}
          <div
            className="flex items-center justify-between gap-3 px-5 pb-4 text-[10px] font-mono tracking-wider text-muted-foreground whitespace-nowrap"
            data-testid="wallet-modal-footer"
          >
            <span>ROBINHOOD CHAIN · 4663</span>
            <span>NON-CUSTODIAL</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
