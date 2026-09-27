"use client"

/**
 * useWallet — minimal React Context wrapper around EIP-1193
 *
 * Responsibilities:
 *   - Detect injected EVM browser wallets (MetaMask / Rabby / Coinbase /
 *     Robinhood / generic) via EIP-6963 + legacy heuristics
 *   - Connect through a specific provider chosen from the selection modal
 *   - Switch to Robinhood Chain 4663, adding it if necessary
 *   - Listen to accountsChanged / chainChanged / disconnect events
 *   - Silently restore the connected wallet on mount using ONLY
 *     `eth_accounts` (no popup, no `wallet_requestPermissions`)
 *   - Expose a clean typed error surface (no raw RPC stack traces)
 *
 * Design notes:
 *   - This is NOT a wallet aggregator, NOT a settings panel. It is one
 *     connection state + one chain switcher exposed through one provider.
 *   - No wagmi / viem / ethers / WalletConnect dependencies. Per the
 *     wallet connection spec, the project stays wallet-library-free and
 *     uses EIP-1193 directly.
 *   - Provider discovery is split out to `lib/wallet/providers.ts`. This
 *     file consumes a list of `WalletDescriptor` and routes connect
 *     requests through the chosen one.
 *   - WalletConnect is intentionally not faked. We only surface it as a
 *     connector option when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set
 *     AND the WalletConnect SDK is installed; otherwise the modal marks
 *     it "Not configured" so the developer can wire it later.
 *
 * Persistence model:
 *   - localStorage holds the LAST KNOWN address + wallet kind for
 *     COSMETIC hinting only (e.g. showing "Reconnect" instead of
 *     "Connect Wallet"). It is NEVER the source of truth.
 *   - On every mount, the authoritative check is
 *     `provider.request({ method: "eth_accounts" })`. If that returns a
 *     non-empty list, we restore the FIRST authorized account as
 *     connected. If it returns [] (or throws), we are disconnected.
 *   - We do NOT call `wallet_requestPermissions` or `eth_requestAccounts`
 *     on mount, ever. Those are user-initiated only.
 */

import * as React from "react"
import {
  ROBINHOOD_CHAIN_ID_DEC,
  ROBINHOOD_CHAIN_ID_HEX,
  ROBINHOOD_CHAIN_CONFIG,
} from "@/lib/wallet/robinhood-chain"
import type { EIP1193Provider, EIP1193RpcError } from "@/lib/wallet/types"
import type { Address } from "@/lib/wallet/types-common"
import { explorerAddressUrl } from "@/lib/explorer/robinhood-chain"
import {
  buildCanonicalWalletList,
  findWalletByRdns,
  getDiscoveredWallets,
  resolveWalletConnectProjectId,
  startWalletDiscovery,
  subscribeToWalletAnnouncements,
  type WalletDescriptor,
  type WalletKind,
} from "@/lib/wallet/providers"
import {
  collectStaticInfoExport,
  logSnapshot,
  recordAnnouncements,
} from "@/lib/wallet/debug"

const STORAGE_KEY = "zeks.wallet.lastConnected"
const STORAGE_RDNS_KEY = "zeks.wallet.lastConnectedRdns"
const STORAGE_WALLET_KEY = "zeks.wallet.lastConnectedKind"

/**
 * Normalized connection state.
 *
 *   - `initializing`  silent restore is in flight (eth_accounts pending)
 *   - `idle`          no injected provider detected
 *   - `available`     provider detected, no account yet
 *   - `connecting`    user clicked Connect, awaiting permission
 *   - `connected`     authorized on Robinhood Chain
 *   - `wrong-network` authorized but on a different chain
 *   - `disconnected`  wallet was previously authorized but is now
 *                     unavailable (locked, revoked, or switched
 *                     wallet/profile). User can click Reconnect.
 */
export type WalletStatus =
  | "initializing"
  | "idle"
  | "available"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "disconnected"

export interface WalletState {
  status: WalletStatus
  address: Address | null
  chainId: number | null
  hasProvider: boolean
}

export interface WalletError {
  message: string
}

function friendlyError(err: unknown): WalletError {
  const e = err as EIP1193RpcError
  if (!e || typeof e !== "object") {
    return { message: "Something went wrong." }
  }
  // EIP-1193 / MetaMask: a permission / connection request is already
  // open in the wallet. We must NOT retry — just tell the user to
  // complete or reject the existing request in their wallet.
  if (
    e.code === -32002 ||
    /already pending/i.test(e.message ?? "") ||
    /already pending for origin/i.test(e.message ?? "")
  ) {
    return {
      message: "Connection request already open in your wallet.",
    }
  }
  if (e.code === 4001) {
    return { message: "Connection cancelled." }
  }
  if (e.code === 4902) {
    return {
      message: "Robinhood Chain is not installed in your wallet yet.",
    }
  }
  if (e.code === 4900 || e.code === 4901) {
    return { message: "Wallet disconnected." }
  }
  if (/rejected/i.test(e.message ?? "")) {
    return { message: "Switch to Robinhood Chain to continue." }
  }
  return { message: e.message ?? "Something went wrong." }
}

function getProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined
  return window.ethereum
}

function getStoredAddress(): Address | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null
    return raw as Address
  } catch {
    return null
  }
}

function setStoredAddress(addr: Address | null): void {
  if (typeof window === "undefined") return
  try {
    if (addr) window.localStorage.setItem(STORAGE_KEY, addr)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage may be disabled — silently no-op
  }
}

function getStoredWalletKind(): WalletKind | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_WALLET_KEY)
    return (raw as WalletKind) || null
  } catch {
    return null
  }
}

function setStoredWalletKind(kind: WalletKind | null): void {
  if (typeof window === "undefined") return
  try {
    if (kind) window.localStorage.setItem(STORAGE_WALLET_KEY, kind)
    else window.localStorage.removeItem(STORAGE_WALLET_KEY)
  } catch {
    // localStorage may be disabled — silently no-op
  }
}

/**
 * The EIP-6963 rdns of the wallet the user last connected to.
 *
 * Why rdns and not the kind ("metamask"/"rabby")?
 *   - rdns is the canonical EIP-6963 stable id that uniquely
 *     identifies a wallet extension.
 *   - Two different rdns values can map to the same `kind` (e.g.
 *     when legacy heuristics misclassify Rabby as MetaMask).
 *   - The user may have MetaMask AND Rabby installed simultaneously.
 *     `window.ethereum` points to whichever injected last; calling
 *     `eth_accounts` on it may return [] even when one of them is
 *     authorized. We MUST call eth_accounts on the SAME provider
 *     object the user originally approved.
 */
function getStoredRdns(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_RDNS_KEY)
    if (typeof raw !== "string" || raw.length === 0) return null
    return raw
  } catch {
    return null
  }
}

function setStoredRdns(rdns: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (rdns) window.localStorage.setItem(STORAGE_RDNS_KEY, rdns)
    else window.localStorage.removeItem(STORAGE_RDNS_KEY)
  } catch {
    // localStorage may be disabled — silently no-op
  }
}

function shorten(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseChainId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string") {
    const n = raw.startsWith("0x") ? parseInt(raw, 16) : parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

interface WalletContextValue extends WalletState {
  shortAddress: string | null

  /**
   * The EIP-1193 provider that is currently bound for this session.
   *
   * This is the SAME provider object identity that the wallet's
   * `accountsChanged` / `chainChanged` / `disconnect` listeners are
   * attached to. Transaction writers MUST use this provider — not
   * `window.ethereum` — so that a multi-injected environment
   * (MetaMask + Rabby + Coinbase, etc.) where the user picked a
   * wallet that does NOT own `window.ethereum` still routes every
   * `eth_sendTransaction` to the wallet the user actually authorized.
   *
   * `null` when no wallet is currently bound (disconnected / wrong
   * network during restore / no provider detected).
   *
   * H1 — wallet / provider plumbing consistency.
   */
  provider: EIP1193Provider | null

  /** Detected wallets shown in the selection modal. */
  availableWallets: WalletDescriptor[]

  /** Which wallet kind the user is currently connecting through / connected to. */
  activeWalletKind: WalletKind | null

  /**
   * Open the selection modal. Connect through the wallet descriptor chosen
   * by the user. Safe to call repeatedly; concurrent calls are coalesced.
   */
  selectAndConnect: (descriptor: WalletDescriptor) => Promise<void>

  /**
   * Open the wallet's OFFICIAL install page (used for not-installed
   * rows). `target="_blank"`, `rel="noopener noreferrer"`. The modal
   * uses this instead of `selectAndConnect` when the row's
   * `availability === "not-installed"`.
   */
  openInstallPage: (descriptor: WalletDescriptor) => void

  /** Re-run connection on the previously-chosen wallet (used for "Reconnect"). */
  reconnect: () => Promise<void>

  disconnect: () => void
  switchToRobinhoodChain: () => Promise<void>
  copyAddress: () => Promise<boolean>
  openExplorer: () => void
  lastError: WalletError | null
  clearError: () => void
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext)
  if (!ctx) {
    throw new Error("useWallet must be used within <WalletProvider />")
  }
  return ctx
}

/* ------------------------------------------------------------------ */
/* Provider                                                           */
/* ------------------------------------------------------------------ */

interface WalletProviderProps {
  children: React.ReactNode
}

/**
 * A set of provider-bound event handlers. We keep ONE record per
 * provider so we can remove exactly the same listeners we attached
 * (preventing the classic "duplicate accountsChanged handler" leak).
 */
interface ProviderHandlers {
  accountsChanged: (accounts: unknown) => void
  chainChanged: (chainId: unknown) => void
  disconnect: (err: unknown) => void
}

export function WalletProvider({ children }: WalletProviderProps) {
  // Provider tracked here is the one we last connected through / are
  // currently listening to. It is the SAME object identity we pass to
  // add/removeListener, so cleanup is exact.
  const providerRef = React.useRef<EIP1193Provider | null>(null)
  // H1 — React-state mirror of `providerRef.current`. Components that
  // consume `useWallet()` (transaction writer hooks, in particular)
  // need to know which provider they must use; mirrors are required
  // because `providerRef.current` mutations inside callbacks do not
  // trigger re-renders. The setter helper `bindProvider(...)` below
  // updates both the ref and this state together so the two never
  // drift apart.
  const [providerState, setProviderState] = React.useState<EIP1193Provider | null>(
    null,
  )
  /** EIP-6963 rdns of the provider we are bound to. Used during
   * silent restore to re-select the SAME wallet the user originally
   * connected to (critical for multi-injected environments). */
  const activeRdnsRef = React.useRef<string | null>(null)
  const activeKindRef = React.useRef<WalletKind | null>(null)
  const handlersRef = React.useRef<ProviderHandlers | null>(null)
  /** Set while a connect attempt is in flight. Synchronous guard. */
  const connectingRef = React.useRef<boolean>(false)
  /** Set while the silent restore on mount is in flight. Prevents
   * double-fire when the user rapidly navigates between terminal
   * pages that all re-mount this provider. */
  const restoringRef = React.useRef<boolean>(false)

  // Initial status is `initializing` so the UI does NOT flash
  // "Connect Wallet" before the silent restore resolves. The button
  // treats `initializing` like a non-actionable placeholder.
  const [status, setStatus] = React.useState<WalletStatus>("initializing")
  const [address, setAddress] = React.useState<Address | null>(null)
  const [chainId, setChainId] = React.useState<number | null>(null)
  const [hasProvider, setHasProvider] = React.useState(false)
  const [lastError, setLastError] = React.useState<WalletError | null>(null)
  const [availableWallets, setAvailableWallets] = React.useState<
    WalletDescriptor[]
  >([])
  const [activeWalletKind, setActiveWalletKind] =
    React.useState<WalletKind | null>(null)

  /* -------- Provider detection (EIP-6963 + legacy) ----------------- */

  React.useEffect(() => {
    if (typeof window === "undefined") return

    startWalletDiscovery()

    const unsubscribe = subscribeToWalletAnnouncements(() => {
      setAvailableWallets(
        buildCanonicalWalletList({
          walletConnectProjectId: resolveWalletConnectProjectId(),
        }),
      )
    })
    return () => {
      unsubscribe()
    }
  }, [])

  /* -------- hasProvider ref mirror --------------------------------- */

  const hasProviderRef = React.useRef(false)
  React.useEffect(() => {
    hasProviderRef.current = hasProvider
  }, [hasProvider])

  /* -------- Status derivation -------------------------------------- */

  /**
   * Compute the right status from (address, chainId). Pure function
   * — does NOT read localStorage. The only inputs are the address
   * argument and the chainId argument; the caller has already
   * decided whether to call us with null vs an address.
   */
  const computeStatus = React.useCallback(
    (addr: Address | null, cid: number | null): WalletStatus => {
      if (!addr) {
        // Disconnected (no address). If a provider exists the user can
        // still connect; otherwise we are idle.
        return hasProviderRef.current ? "available" : "idle"
      }
      // We have an authorized address. Status depends on the chain.
      return cid === ROBINHOOD_CHAIN_ID_DEC ? "connected" : "wrong-network"
    },
    [],
  )

  /* -------- bindProvider (H1) ------------------------------------- */

  /**
   * H1 — provider / state setters always go through here so that
   * `providerRef.current` and the React-state mirror stay in lockstep.
   *
   * Use this whenever the bound provider changes:
   *   - silent restore success → call `bindProvider(provider)`
   *   - `selectAndConnect`     → call `bindProvider(provider)`
   *   - tear-down (accountsChanged → [], disconnect event, manual
   *     `disconnect()`) → call `bindProvider(null)`
   *
   * Identity check guards against redundant React state churn.
   * This helper does NOT rebind event listeners; callers that want
   * the listeners attached must additionally call `bindListeners(p)`
   * exactly as the pre-H1 code did.
   */
  const bindProvider = React.useCallback(
    (next: EIP1193Provider | null) => {
      if (providerRef.current === next) return
      providerRef.current = next
      setProviderState(next)
    },
    [],
  )

  /**
   * Apply a new (address, chainId) pair. Single setter path so all
   * state transitions go through one well-defined function.
   *
   * IMPORTANT: this does NOT consult localStorage. The caller has
   * already decided which address to apply (usually the result of
   * `eth_accounts`); localStorage is only a cosmetic hint here.
   */
  const apply = React.useCallback(
    (addr: Address | null, cid: number | null) => {
      setAddress(addr)
      setChainId(cid)
      setStatus(computeStatus(addr, cid))
      if (addr) {
        // Cache the address for cosmetic Reconnect/shortAddress hints.
        setStoredAddress(addr)
      } else {
        // Wallet truly is gone. Drop the cached address so subsequent
        // mounts don't show a stale "Reconnect" hint.
        setStoredAddress(null)
        setStoredWalletKind(null)
        setStoredRdns(null)
      }
    },
    [computeStatus],
  )

  /* -------- Bind / unbind event listeners ------------------------- */

  const bindListeners = React.useCallback(
    (provider: EIP1193Provider) => {
      if (!provider.on || !provider.removeListener) {
        handlersRef.current = null
        return
      }
      // Idempotent: if we already have handlers for THIS provider,
      // don't attach again. Same-object identity check.
      if (providerRef.current === provider && handlersRef.current) return

      const handlers: ProviderHandlers = {
        accountsChanged: (accounts: unknown) => {
          const list = (Array.isArray(accounts) ? accounts : []) as string[]
          if (list.length === 0) {
            // Wallet is locked or user revoked. Drop to disconnected.
            apply(null, null)
            return
          }
          // Always trust the wallet's first address. Do NOT compare
          // against localStorage — the wallet is the source of truth.
          const next = list[0] as Address
          setAddress(next)
          setStoredAddress(next)
          setStatus((curr) =>
            curr === "wrong-network"
              ? "wrong-network"
              : computeStatus(next, chainIdRef.current),
          )
        },
        chainChanged: (chainIdRaw: unknown) => {
          const cid = parseChainId(chainIdRaw)
          // Update chainId. If we have an authorized address, the
          // status recomputes based on the new chain. We never trigger
          // another permission request from a chainChanged event.
          chainIdRef.current = cid
          setChainId(cid)
          setAddress((curr) => {
            if (!curr) return curr
            setStatus(
              cid === ROBINHOOD_CHAIN_ID_DEC ? "connected" : "wrong-network",
            )
            return curr
          })
        },
        disconnect: () => {
          // Some providers emit `disconnect` with an Error-shaped
          // payload; we ignore the payload. The wallet is gone.
          apply(null, null)
        },
      }

      provider.on("accountsChanged", handlers.accountsChanged as never)
      provider.on("chainChanged", handlers.chainChanged as never)
      provider.on("disconnect", handlers.disconnect as never)
      handlersRef.current = handlers
    },
    [apply, computeStatus],
  )

  const unbindListeners = React.useCallback((provider: EIP1193Provider) => {
    const h = handlersRef.current
    handlersRef.current = null
    if (!h || !provider.removeListener) return
    provider.removeListener(
      "accountsChanged",
      h.accountsChanged as never,
    )
    provider.removeListener("chainChanged", h.chainChanged as never)
    provider.removeListener("disconnect", h.disconnect as never)
  }, [])

  // Mirror chainId into a ref so handlers can read the latest value
  // without re-binding on every chain change.
  const chainIdRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    chainIdRef.current = chainId
  }, [chainId])

  /* -------- Mount: silent restore ---------------------------------- */

  React.useEffect(() => {
    if (typeof window === "undefined") return

    // Coalesce: if a sibling provider re-mount is already restoring,
    // skip the duplicate work. (e.g. rapid navigation between terminal
    // pages that all re-mount this provider.)
    if (restoringRef.current) return
    restoringRef.current = true

    const hasInjectedProvider = Boolean(getProvider())
    setHasProvider(hasInjectedProvider)

    void (async () => {
      // Step 1: kick off EIP-6963 discovery. The dispatch is
      // synchronous; announcements arrive via event listeners in the
      // background. We start this BEFORE we ask for any accounts so
      // the providers have a chance to announce themselves.
      startWalletDiscovery()

      // Step 2: figure out which provider the user previously
      // connected through. We persist the EIP-6963 rdns, NOT the
      // kind and NOT window.ethereum.
      const storedRdns = getStoredRdns()
      const storedKind = getStoredWalletKind() // legacy hint

      // Step 3: wait briefly for EIP-6963 announcements to land.
      // Wallets respond almost instantly (<10ms) but we give the
      // event loop a couple of microtasks to settle.
      await waitForAnnouncements(storedRdns)

      // Step 4: pick the right provider object.
      const pick = pickRestoreProvider(storedRdns, storedKind)
      const provider = pick.provider
      const selectedRdns = pick.rdns

      // Collect static environment info (provider identity, flags, etc.)
      // but do NOT call eth_accounts yet — wait for the provider to be
      // bound so the log shows the authoritative result.
      const snap = collectStaticInfoExport(selectedRdns, provider)
      recordAnnouncements(
        snap,
        getDiscoveredWallets().map((w) => w.rdns),
      )
      // Log happens below — after eth_accounts resolves (see "restore" tag).

      // Persist hasProvider based on what we actually have. If the
      // user previously connected to a wallet that no longer exists,
      // hasProvider may still be true (window.ethereum is present) but
      // the stored rdns could not be resolved.
      if (!provider) {
        snap.ethAccountsResult = "no-provider"
        logSnapshot("restore", snap)
        if (hasInjectedProvider) {
          setStatus("available")
        } else {
          setStatus("idle")
        }
        // H1 — drop both ref and state mirror together.
        bindProvider(null)
        restoringRef.current = false
        return
      }

      // Step 5: bind listeners on the EXACT provider we picked.
      // This is critical — events must come from the provider the
      // user authorized.
      // H1 — update ref + state mirror atomically.
      bindProvider(provider)
      bindListeners(provider)
      activeRdnsRef.current = selectedRdns
      activeKindRef.current = pick.kind

      // Step 6: call eth_accounts on the picked provider. This is
      // the AUTHORITATIVE restore check. No popup is opened.
      try {
        const [accountsRaw, chainRaw] = await Promise.all([
          provider.request({ method: "eth_accounts" }) as Promise<
            string[] | undefined
          >,
          provider.request({ method: "eth_chainId" }) as Promise<string>,
        ])
        const authorized = Array.isArray(accountsRaw) ? accountsRaw : []
        const cid = parseChainId(chainRaw)
        chainIdRef.current = cid

        // Fill in eth_accounts results on the snapshot and log.
        snap.ethAccountsResult = authorized.length > 0 ? "non-empty" : "empty"
        snap.ethAccountsCount = authorized.length
        snap.chainId = typeof chainRaw === "string" ? chainRaw : null
        logSnapshot("restore", snap)

        if (authorized.length > 0) {
          // Wallet is the source of truth. Restore the FIRST
          // authorized address from the SAME provider we bound to.
          const next = authorized[0] as Address
          setAddress(next)
          setChainId(cid)
          setStatus(
            cid === ROBINHOOD_CHAIN_ID_DEC ? "connected" : "wrong-network",
          )
          // Cosmetic: persist for the next mount's Reconnect hint.
          setStoredAddress(next)
          if (selectedRdns) setStoredRdns(selectedRdns)
          if (pick.kind) {
            activeKindRef.current = pick.kind
            setActiveWalletKind(pick.kind)
            setStoredWalletKind(pick.kind)
          }
        } else {
          // The picked provider has no authorized accounts. This
          // means either (a) user never connected, (b) wallet is
          // locked, or (c) user revoked. Don't trust localStorage
          // for the address — wallet is the authority. We show
          // "disconnected" if we have a cosmetic hint that we WERE
          // previously connected, otherwise "available".
          const cached = getStoredAddress()
          setAddress(null)
          setChainId(cid)
          if (cached) {
            setStoredAddress(null)
            setStoredRdns(null)
            setStoredWalletKind(null)
            setStatus("disconnected")
          } else {
            setStatus("available")
          }
        }
      } catch {
        // eth_accounts threw (rare — most wallets return []). Don't
        // trust localStorage; treat as disconnected-but-available.
        snap.ethAccountsResult = "threw"
        snap.ethAccountsCount = 0
        snap.chainId = null
        logSnapshot("restore", snap)
        const cached = getStoredAddress()
        if (cached) {
          setStoredAddress(null)
          setStoredRdns(null)
          setStoredWalletKind(null)
          setAddress(null)
          const cid = parseChainId(
            (await safeChainId(provider)) as string | null,
          )
          chainIdRef.current = cid
          setChainId(cid)
          setStatus("disconnected")
        } else {
          setAddress(null)
          setChainId(null)
          setStatus("available")
        }
      } finally {
        restoringRef.current = false
      }
    })()

    return () => {
      // Cleanup runs on unmount or when the effect identity changes
      // (effectively never). Always unbind from the provider
      // currently in the ref so we don't accidentally remove
      // listeners from a different provider that replaced the one
      // we bound to.
      const current = providerRef.current
      if (current) unbindListeners(current)
    }
    // bindListeners and unbindListeners are stable callbacks; we
    // intentionally omit them from deps to keep this effect
    // mount-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------- Actions ------------------------------------------------ */

  /**
   * Connect through a specific wallet descriptor chosen from the modal.
   *
   * SINGLE-FLIGHT GUARANTEE
   * ------------------------
   * ZEKS MUST NEVER create overlapping wallet permission / connection
   * requests. EIP-1193 providers (MetaMask, Rabby, Coinbase, Robinhood,
   * generic Browser Wallet) reject a second `wallet_requestPermissions`
   * (or `eth_requestAccounts` that internally issues one) with code
   * -32002 while one is already pending.
   *
   * Therefore the very first thing this function does — BEFORE any
   * async work, BEFORE any state setter, BEFORE any provider lookup —
   * is establish a synchronous guard via `connectingRef`. If another
   * connect attempt is already in flight, this call is a complete no-op.
   * The guard is released in `finally` so the user can retry after the
   * pending request resolves or is rejected.
   *
   * We do NOT call `wallet_requestPermissions` directly. For initial
   * connection, `eth_requestAccounts` alone is the standards-compliant
   * permission-triggering method in EIP-1193. Issuing a separate
   * `wallet_requestPermissions` would be a duplicate request.
   *
   * Chain switching happens AFTER account permission is granted, so we
   * never trigger `wallet_switchEthereumChain` during a pending
   * permission popup.
   */
  const selectAndConnect = React.useCallback(
    async (descriptor: WalletDescriptor) => {
      // ---- (A) SYNCHRONOUS SINGLE-FLIGHT GUARD ----
      // Must be the FIRST statement. Synchronous. No awaits above this
      // line, ever. If we already have an in-flight connection, we
      // neither call any provider method nor update any state.
      if (connectingRef.current) return
      connectingRef.current = true
      setLastError(null)
      setStatus("connecting")

      // ---- (B) DESCRIPTOR VALIDATION (synchronous) ----
      // Not-installed wallets: inert. We never trigger a connection on a
      // row whose provider wasn't actually detected.
      if (descriptor.availability === "not-installed") {
        connectingRef.current = false
        setStatus(hasProviderRef.current ? "available" : "idle")
        setLastError({
          message: `${descriptor.name} is not installed in this browser.`,
        })
        return
      }

      // WalletConnect: explicit not-configured guard.
      if (descriptor.kind === "walletconnect") {
        connectingRef.current = false
        setStatus(hasProviderRef.current ? "available" : "idle")
        if (descriptor.availability === "not-configured") {
          setLastError({
            message:
              "WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and install the connector SDK.",
          })
          return
        }
        // Even when "available", we don't fake a QR. The SDK is not
        // installed in this project, so we surface a clear message.
        setLastError({
          message:
            "WalletConnect connector SDK is not installed yet. Add @walletconnect/modal and wire the connector to enable QR.",
        })
        return
      }

      // Browser Wallet fallback: this only works if there's actually an
      // injected provider present. If not, surface a friendly error.
      if (descriptor.kind === "browser" && !descriptor.provider) {
        connectingRef.current = false
        setStatus(hasProviderRef.current ? "available" : "idle")
        setLastError({
          message: "No compatible wallet detected.",
        })
        return
      }

      // Resolve the actual provider — falls back to window.ethereum for
      // the generic Browser Wallet option so we still get a working
      // connection in single-injected environments.
      const provider =
        descriptor.provider ??
        (descriptor.kind === "browser" ? getProvider() : undefined)

      if (!provider) {
        connectingRef.current = false
        setStatus(hasProviderRef.current ? "available" : "idle")
        setLastError({ message: "No wallet detected." })
        return
      }

      try {
        // If we're switching to a different provider than the one we
        // previously bound listeners to, unbind from the old one and
        // bind to the new one. We never have two providers listened to
        // at once.
        if (providerRef.current !== provider) {
          if (providerRef.current) unbindListeners(providerRef.current)
          // H1 — update ref + state mirror atomically before
          // binding listeners so the React-state view never points
          // at a stale reference between call sites.
          bindProvider(provider)
          bindListeners(provider)
        }

        // ---- (C) SINGLE PERMISSION-REQUESTING CALL ----
        // EIP-1193's `eth_requestAccounts` is the canonical method for
        // requesting account access. Modern wallets implement this by
        // internally issuing `wallet_requestPermissions` once. We do
        // NOT explicitly call `wallet_requestPermissions` ourselves —
        // doing so would create a duplicate request.
        const raw = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[]
        const chainHex = (await provider.request({
          method: "eth_chainId",
        })) as string
        const cid = parseChainId(chainHex)

        if (!raw || raw.length === 0) {
          throw Object.assign(new Error("No accounts returned"), { code: 4001 })
        }
        const next = raw[0] as Address
        setStoredAddress(next)
        setStoredWalletKind(descriptor.kind)
        // Persist the EIP-6963 rdns of the provider the user just
        // connected through. THIS is what makes silent restore work
        // across refreshes in multi-injected environments: next
        // mount will pick this same provider object.
        setStoredRdns(descriptor.rdns ?? null)
        activeRdnsRef.current = descriptor.rdns ?? null
        activeKindRef.current = descriptor.kind
        setActiveWalletKind(descriptor.kind)
        setAddress(next)
        chainIdRef.current = cid
        setChainId(cid)
        setStatus(
          cid === ROBINHOOD_CHAIN_ID_DEC ? "connected" : "wrong-network",
        )
      } catch (err) {
        // EIP-1193 -32002: another permission request is already
        // pending in the wallet. We surface a clean ZEKS message via
        // friendlyError and DO NOT retry. The user must complete or
        // reject the existing request in their wallet first.
        setStatus(hasProviderRef.current ? "available" : "idle")
        setLastError(friendlyError(err))
      } finally {
        // Always release the single-flight guard, regardless of success,
        // user rejection (4001), provider error (-32002), or any other
        // outcome. This guarantees a subsequent explicit user click can
        // start a fresh attempt after the wallet's pending request is
        // dismissed.
        connectingRef.current = false
      }
    },
    [bindListeners, unbindListeners],
  )

  /** Reconnect through the last-used wallet kind. */
  const reconnect = React.useCallback(async () => {
    // Prefer rdns match (exact EIP-6963 id of the wallet we were
    // last bound to). Fall back to kind only for legacy users who
    // never persisted rdns.
    const rdns = activeRdnsRef.current
    const kind = activeKindRef.current
    const wallet = rdns
      ? availableWallets.find((w) => w.rdns === rdns)
      : kind
        ? availableWallets.find((w) => w.kind === kind)
        : undefined
    if (wallet) await selectAndConnect(wallet)
  }, [availableWallets, selectAndConnect])

  /**
   * Open the wallet's OFFICIAL install page in a new tab. Only used for
   * `not-installed` rows. The descriptor's `walletInstallUrl` is verified
   * to be a static https URL in `walletMetaFor()`; we additionally
   * re-validate here so a runtime-mutated descriptor cannot escape
   * that constraint.
   */
  const openInstallPage = React.useCallback(
    (descriptor: WalletDescriptor) => {
      if (typeof window === "undefined") return
      const url = descriptor.walletInstallUrl
      if (typeof url !== "string") return
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return
      }
      if (parsed.protocol !== "https:") return
      window.open(parsed.toString(), "_blank", "noopener,noreferrer")
    },
    [],
  )

  const switchToRobinhoodChain = React.useCallback(async () => {
    setLastError(null)
    const provider = providerRef.current ?? getProvider()
    if (!provider) {
      setLastError({ message: "No wallet detected." })
      return
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ROBINHOOD_CHAIN_ID_HEX }],
      })
    } catch (err) {
      const e = err as EIP1193RpcError
      if (e && (e.code === 4902 || /Unrecognized chain/i.test(e.message ?? ""))) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: ROBINHOOD_CHAIN_CONFIG.chainId,
                chainName: ROBINHOOD_CHAIN_CONFIG.chainName,
                nativeCurrency: ROBINHOOD_CHAIN_CONFIG.nativeCurrency,
                rpcUrls: ROBINHOOD_CHAIN_CONFIG.rpcUrls,
                blockExplorerUrls: ROBINHOOD_CHAIN_CONFIG.blockExplorerUrls,
              },
            ],
          })
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ROBINHOOD_CHAIN_ID_HEX }],
          })
        } catch (err2) {
          setLastError(friendlyError(err2))
        }
      } else {
        setLastError(friendlyError(err))
      }
    }
  }, [])

  /**
   * Disconnect the wallet from ZEKS's UI perspective. We do not (and
   * cannot) forcibly disconnect the wallet extension itself — we just
   * forget the address, the chain, and the cached kind so the next
   * interaction starts from "available". We also rebind listeners so
   * any subsequent accountsChanged event is captured cleanly (some
   * wallets only emit accountsChanged when the dapp re-subscribes).
   */
  const disconnect = React.useCallback(() => {
    setStoredAddress(null)
    setStoredWalletKind(null)
    setStoredRdns(null)
    activeRdnsRef.current = null
    activeKindRef.current = null
    setActiveWalletKind(null)
    setAddress(null)
    chainIdRef.current = null
    setChainId(null)
    setStatus(hasProviderRef.current ? "available" : "idle")
    setLastError(null)
  }, [])

  const copyAddress = React.useCallback(async () => {
    if (!address) return false
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(address)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [address])

  const openExplorer = React.useCallback(() => {
    if (!address) return
    if (typeof window === "undefined") return
    window.open(explorerAddressUrl(address), "_blank",
      "noopener,noreferrer",
    )
  }, [address])

  const clearError = React.useCallback(() => setLastError(null), [])

  const value: WalletContextValue = {
    status,
    address,
    chainId,
    hasProvider,
    // H1 — the bound EIP-1193 provider. This is the SAME provider
    // that `accountsChanged` / `chainChanged` / `disconnect` listeners
    // are attached to, and the SAME provider `selectAndConnect` and
    // `switchToRobinhoodChain` route their EIP-1193 requests through.
    // Transaction writer hooks MUST consume this — not
    // `window.ethereum` — so multi-injected environments
    // (MetaMask + Rabby + Coinbase, etc.) cannot misroute reads /
    // approvals / writes to an unrelated injected wallet.
    provider: providerState,
    shortAddress: address ? shorten(address) : null,
    availableWallets,
    activeWalletKind,
    selectAndConnect,
    openInstallPage,
    reconnect,
    disconnect,
    switchToRobinhoodChain,
    copyAddress,
    openExplorer,
    lastError,
    clearError,
  }

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Defensive eth_chainId probe used in the catch path of the silent
 * restore. Some wallets throw on eth_accounts but still respond to
 * eth_chainId. Returns null on any failure so the caller can keep
 * the user in a non-connected state without crashing.
 */
async function safeChainId(provider: EIP1193Provider): Promise<string | null> {
  try {
    const raw = (await provider.request({ method: "eth_chainId" })) as string
    return typeof raw === "string" ? raw : null
  } catch {
    return null
  }
}

/**
 * Wait briefly for EIP-6963 announcements to arrive. Wallets
 * respond within a few milliseconds, but the dispatch / announce
 * pair crosses an event-loop boundary. We yield a few microtasks
 * and a short timeout so the discovery list is settled before we
 * pick a provider.
 *
 * If we are waiting for a specific rdns (the one the user previously
 * connected through), we resolve early once it appears. Otherwise we
 * just wait the full timeout.
 */
async function waitForAnnouncements(preferredRdns: string | null): Promise<void> {
  const TIMEOUT_MS = 250
  const start = Date.now()
  if (preferredRdns) {
    while (Date.now() - start < TIMEOUT_MS) {
      if (findWalletByRdns(preferredRdns)) return
      await new Promise((r) => setTimeout(r, 16))
    }
    return
  }
  // No preferred rdns: just yield a couple of event-loop ticks so
  // the dispatch → listener → setState chain settles.
  await new Promise((r) => setTimeout(r, Math.min(TIMEOUT_MS, 50)))
}

interface RestorePick {
  provider: EIP1193Provider | null
  rdns: string | null
  kind: WalletKind | null
}

/**
 * Decide which provider object to use for the silent restore.
 *
 * Resolution order:
 *   1. If we have a stored rdns (the rdns of the provider the user
 *      previously connected to), look it up in the EIP-6963
 *      announcement list. This is the CORRECT answer for
 *      multi-injected environments where `window.ethereum` is not
 *      necessarily the wallet the user authorized.
 *   2. If we don't have a stored rdns, but we have a legacy stored
 *      `kind`, try to find an announced wallet with that kind.
 *   3. Otherwise fall back to `window.ethereum` for legacy
 *      single-injected environments.
 */
function pickRestoreProvider(
  storedRdns: string | null,
  storedKind: WalletKind | null,
): RestorePick {
  if (storedRdns) {
    const found = findWalletByRdns(storedRdns)
    if (found?.provider) {
      return {
        provider: found.provider,
        rdns: found.rdns,
        kind: found.kind,
      }
    }
    // Stored rdns but the wallet is no longer announced. This means
    // the user uninstalled the wallet, switched browser profiles, or
    // is in a context where the extension is not injected. We still
    // try the legacy window.ethereum as a best-effort fallback.
  }
  if (storedKind) {
    const list = getDiscoveredWallets()
    const match = list.find((w) => w.kind === storedKind)
    if (match?.provider) {
      return {
        provider: match.provider,
        rdns: match.rdns,
        kind: match.kind,
      }
    }
  }
  // Fallback: window.ethereum (legacy single-injected or unknown env).
  const eth = getProvider()
  if (eth) {
    // Try to identify which wallet it is so we can persist the
    // rdns going forward.
    const list = getDiscoveredWallets()
    // The same provider object identity may be reachable via one of
    // the descriptors. If we find a match, use its rdns.
    const match = list.find((w) => w.provider === eth)
    if (match) {
      return { provider: eth, rdns: match.rdns, kind: match.kind }
    }
    return { provider: eth, rdns: null, kind: null }
  }
  return { provider: null, rdns: null, kind: null }
}
