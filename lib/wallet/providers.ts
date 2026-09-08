/**
 * ZEKS — Wallet provider detection.
 *
 * Multi-provider environments are now standard. Spec §06:
 *   "Do not assume window.ethereum equals MetaMask.
 *    Correctly distinguish EIP-1193 injected providers where possible.
 *    Support multi-provider environments.
 *    Avoid treating Rabby as MetaMask / Coinbase as MetaMask.
 *    Avoid duplicate providers.
 *    If provider identification is ambiguous, fall back to a generic
 *    Browser Wallet entry."
 *
 * Wallet BRAND ASSET POLICY (per the wallet-brand-assets correction):
 *
 *   ZEKS does NOT ship hand-drawn, approximated, or AI-generated brand
 *   logos. No MetaMask / Rabby / Coinbase / Robinhood / WalletConnect
 *   SVG lives in this repo, because none of them are canonical assets
 *   we can verify at build time.
 *
 *   Instead:
 *
 *     - The default `icon` for every branded wallet is `null`.
 *     - The modal renders the neutral Browser Wallet icon
 *       (`/wallets/browser.svg`, the only non-brand asset in the repo)
 *       whenever `icon` is null or fails to load.
 *     - When an EIP-6963 provider announces itself with `info.icon`,
 *       we USE that URL — but only after a strict allowlist / origin
 *       check that protects against XSS or remote-SVG injection.
 *
 *   Concretely we accept a provider-supplied icon URL only if it is:
 *
 *     (a) a `data:` URL whose media type starts with `image/`, OR
 *     (b) an `https://` URL whose host is on the canonical vendor
 *         allowlist below.
 *
 *   Everything else is treated as untrusted and discarded. If a
 *   provider announces an unsafe icon we still accept the provider —
 *   we just fall back to the neutral icon for visual rendering.
 *
 * Strategy:
 *
 *   1. Listen for `eip6963:announceProvider` events. The EIP-6963
 *      Multi Injected Provider Discovery spec defines a discovery
 *      channel that lets wallets announce themselves with
 *      `{ info: { rdns, name, icon, uuid }, provider }` so we can
 *      identify them by stable rdns.
 *
 *   2. If EIP-6963 is not supported, fall back to legacy heuristics
 *      on `window.ethereum`: Rabby > Coinbase Wallet > MetaMask >
 *      generic Browser Wallet.
 *
 *   3. Deduplicate by rdns/uuid so we never show the same provider
 *      twice.
 *
 *   4. `buildCanonicalWalletList()` always returns the full canonical
 *      roster (MetaMask / Rabby / Coinbase / Robinhood / WalletConnect
 *      / Browser Wallet) with the right availability per current
 *      detection.
 */

import type { EIP1193Provider } from "./types"

export type WalletRdns =
  | "io.metamask"
  | "io.rabby"
  | "com.coinbase.wallet"
  | "com.robinhood.wallet"
  | "app.walletconnect"
  | "browser" // synthetic fallback when no identity is provided

export type WalletKind =
  | "metamask"
  | "rabby"
  | "coinbase"
  | "robinhood"
  | "walletconnect"
  | "browser"

export interface WalletDescriptor {
  /** Stable identifier (EIP-6963 rdns, or "browser" fallback). */
  rdns: WalletRdns | string
  /** Wallet kind used for ordering + status messaging. */
  kind: WalletKind
  /** Human-readable wallet name. */
  name: string
  /**
   * URL of the wallet's brand mark. `null` for every branded wallet
   * until an authoritative source provides one:
   *   - For installed providers: the EIP-6963 `info.icon`, if the
   *     allowlist accepts it.
   *   - For Browser Wallet: the local `/wallets/browser.svg`.
   * The modal renders the Browser Wallet fallback whenever this is
   * null or fails to load.
   */
  icon: string | null
  /**
   * Official install / homepage URL the row opens in a new tab when
   * the wallet is `not-installed`. Verified https vendor URLs only.
   * `null` for kinds that are not "installable extensions" (e.g.
   * WalletConnect is a connector SDK, not an extension).
   */
  walletInstallUrl: string | null
  /** The actual EIP-1193 provider handle, if any. */
  provider: EIP1193Provider | null
  /** Stable instance id (uuid from EIP-6963, or a generated token). */
  uuid: string
  /**
   * Availability lifecycle:
   *   "installed"       — provider detected, ready to connect.
   *   "available"       — connectable but not injected (e.g. WalletConnect
   *                       with env var set, or generic Browser Wallet when
   *                       a generic injected provider exists).
   *   "not-installed"   — known wallet that is not currently installed.
   *   "unavailable"     — no underlying provider reachable (Browser Wallet
   *                       with no injected window.ethereum at all).
   *   "not-configured"  — depends on env var that isn't set (WalletConnect).
   */
  availability:
    | "installed"
    | "available"
    | "not-installed"
    | "unavailable"
    | "not-configured"
  /**
   * Provenance of `icon` — purely informational; the UI uses it for
   * diagnostics / debugging but never for display.
   */
  iconSource:
    | "provider" // from EIP-6963 info.icon
    | "static-browser" // the local neutral /wallets/browser.svg
    | null
}

/* ----------------------------------------------------------------- */
/* EIP-6963 helpers                                                    */
/* ----------------------------------------------------------------- */

export const EIP6963_REQUEST_EVENT = "eip6963:requestProvider"
export const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider"

interface EIP6963ProviderInfo {
  rdns: string
  name: string
  icon: string
  uuid: string
}

interface EIP6963AnnounceDetail {
  info: EIP6963ProviderInfo
  provider: EIP1193Provider
}

/* ----------------------------------------------------------------- */
/* Brand-icon allowlist                                                */
/* ----------------------------------------------------------------- */

/**
 * Canonical vendor domains that may host wallet brand assets. If a
 * provider announces an `info.icon` URL whose host is NOT on this
 * list, we discard the URL and render the neutral fallback instead.
 *
 * IMPORTANT: this allowlist is intentionally conservative. It is
 * not exhaustive — it covers only the vendors ZEKS explicitly
 * supports today. Adding a new vendor requires an explicit decision
 * and a code review.
 */
const CANONICAL_ICON_HOSTS: ReadonlySet<string> = new Set([
  "metamask.io",
  "raw.githubusercontent.com", // some wallets host their icon on a github raw URL
  "rabby.io",
  "coinbase.com",
  "robinhood.com",
  "walletconnect.com",
  "reown.com",
  "cdn.walletconnect.com",
])

/**
 * Validate an icon URL supplied by an EIP-6963 provider. The result
 * is the original URL if it's safe to render, otherwise `null`.
 *
 *   - `data:image/...;base64,...`   → returned as-is.
 *   - `https://<canonical-host>/...` → returned as-is.
 *   - anything else (http, javascript:, blob:, unknown host, etc) →
 *     `null`.
 *
 * This is deliberately strict: a malicious wallet could otherwise
 * supply a remote SVG containing a `<script>` tag or an
 * `onload=alert(1)` handler. We treat provider-supplied icon URLs
 * as untrusted by default.
 */
export function sanitizeProviderIcon(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (!url) return null

  // data: URLs — only safe image MIME types.
  if (url.startsWith("data:")) {
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(url)) {
      // Note: data:image/svg+xml can still carry inline script. The
      // modal renders icons as <img>, which sandboxes SVG scripts,
      // so even unsafe SVG is rendered as inert pixels. We accept it
      // here; <img> isolation is the second line of defence.
      return url
    }
    return null
  }

  // Absolute URLs — only https, only on the canonical vendor list.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:") return null
  if (!CANONICAL_ICON_HOSTS.has(parsed.hostname.toLowerCase())) return null
  return parsed.toString()
}

/* ----------------------------------------------------------------- */
/* Wallet classification                                               */
/* ----------------------------------------------------------------- */

/* Map of known rdns → wallet kind. */
function classifyRdns(rdns: string): WalletKind | null {
  switch (rdns) {
    case "io.metamask":
      return "metamask"
    case "io.rabby":
      return "rabby"
    case "com.coinbase.wallet":
      return "coinbase"
    case "com.robinhood.wallet":
      return "robinhood"
    case "app.walletconnect":
      return "walletconnect"
    default:
      return null
  }
}

/**
 * Static metadata for a wallet kind. Critically, `icon` is `null` for
 * every branded wallet — we do NOT host homemade brand assets in
 * `/public/wallets`. The icon comes from the running provider
 * (EIP-6963), and the modal falls back to the neutral Browser Wallet
 * icon whenever it isn't available.
 *
 * `walletInstallUrl` is the **official** vendor page the row opens in
 * a new tab when the wallet is `not-installed`. These are the
 * canonical vendor pages — never a third-party download mirror.
 */
function walletMetaFor(kind: WalletKind): {
  name: string
  icon: string | null
  rdns: WalletRdns | string
  walletInstallUrl: string | null
} {
  switch (kind) {
    case "metamask":
      return {
        name: "MetaMask",
        icon: null,
        rdns: "io.metamask",
        walletInstallUrl: "https://metamask.io/download/",
      }
    case "rabby":
      return {
        name: "Rabby",
        icon: null,
        rdns: "io.rabby",
        walletInstallUrl: "https://rabby.io/",
      }
    case "coinbase":
      return {
        name: "Coinbase Wallet",
        icon: null,
        rdns: "com.coinbase.wallet",
        walletInstallUrl: "https://www.coinbase.com/wallet/downloads",
      }
    case "robinhood":
      return {
        name: "Robinhood Wallet",
        icon: null,
        rdns: "com.robinhood.wallet",
        walletInstallUrl: "https://robinhood.com/us/en/crypto/wallet/",
      }
    case "walletconnect":
      return {
        name: "WalletConnect",
        icon: null,
        rdns: "app.walletconnect",
        // WalletConnect is a connector SDK, not a browser extension.
        // No install page; the dev action is to set
        // NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID + install the SDK.
        walletInstallUrl: null,
      }
    case "browser":
      return {
        name: "Browser Wallet",
        icon: "/wallets/browser.svg",
        rdns: "browser",
        walletInstallUrl: null,
      }
  }
}

/* ----------------------------------------------------------------- */
/* Legacy heuristics — used when no wallet supports EIP-6963.         */
/* ----------------------------------------------------------------- */

interface LegacyWindowEthereum extends EIP1193Provider {
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
  isBraveWallet?: boolean
  providers?: Array<EIP1193Provider & Partial<LegacyWindowEthereum>>
}

function classifyLegacyProvider(
  p: LegacyWindowEthereum | undefined,
): WalletKind | null {
  if (!p) return null
  // Order matters: Rabby also sets isMetaMask = true to keep legacy
  // dapps working, so check Rabby / Coinbase first.
  if (p.isRabby) return "rabby"
  if (p.isCoinbaseWallet) return "coinbase"
  if (p.isMetaMask) return "metamask"
  return null
}

function dedupeKey(d: Pick<WalletDescriptor, "rdns" | "uuid">): string {
  return `${d.rdns}::${d.uuid}`
}

/* ----------------------------------------------------------------- */
/* Public API                                                          */
/* ----------------------------------------------------------------- */

let listeners: Array<(wallets: WalletDescriptor[]) => void> = []
let lastAnnounced: Map<string, WalletDescriptor> = new Map()

/** Subscribe to wallet announcements (EIP-6963 + legacy). */
export function subscribeToWalletAnnouncements(
  cb: (wallets: WalletDescriptor[]) => void,
): () => void {
  listeners.push(cb)
  cb(currentWallets())
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function emit(): void {
  const wallets = currentWallets()
  for (const l of listeners) l(wallets)
}

function currentWallets(): WalletDescriptor[] {
  return Array.from(lastAnnounced.values())
}

/**
 * Synchronous snapshot of currently-discovered wallets. After
 * `startWalletDiscovery()` has been called, this returns the most
 * recent announcement list. Use this on page load to find the
 * provider the user previously connected to (by rdns) BEFORE
 * calling `eth_accounts` on it.
 */
export function getDiscoveredWallets(): WalletDescriptor[] {
  return currentWallets()
}

/**
 * Find a discovered wallet by its EIP-6963 rdns. Returns undefined
 * if no wallet with that rdns is currently announced. Used during
 * silent restore to re-select the same provider the user originally
 * connected through — critical for multi-injected environments
 * where `window.ethereum` may not be the wallet the user authorized.
 */
export function findWalletByRdns(
  rdns: string,
): WalletDescriptor | undefined {
  return currentWallets().find((w) => w.rdns === rdns)
}

/** Start discovery. Idempotent. Call from the wallet provider mount. */
export function startWalletDiscovery(): void {
  if (typeof window === "undefined") return
  if ((startWalletDiscovery as unknown as { _started?: boolean })._started)
    return
  ;(startWalletDiscovery as unknown as { _started: boolean })._started = true

  // 1. EIP-6963
  window.addEventListener(EIP6963_ANNOUNCE_EVENT, ((ev: Event) => {
    const detail = (ev as CustomEvent<EIP6963AnnounceDetail>).detail
    if (!detail?.info || !detail?.provider) return
    const kind = classifyRdns(detail.info.rdns)
    if (!kind) return
    const meta = walletMetaFor(kind)
    const safeIcon = sanitizeProviderIcon(detail.info.icon)
    const d: WalletDescriptor = {
      rdns: detail.info.rdns,
      kind,
      name: detail.info.name || meta.name,
      // Provider-supplied icon wins when safe; otherwise we leave
      // the row without an icon and the modal falls back to the
      // neutral Browser Wallet icon.
      icon: safeIcon ?? null,
      walletInstallUrl: meta.walletInstallUrl,
      provider: detail.provider,
      uuid: detail.info.uuid,
      availability: "installed",
      iconSource: safeIcon ? "provider" : null,
    }
    const key = dedupeKey(d)
    if (!lastAnnounced.has(key)) {
      lastAnnounced.set(key, d)
      emit()
    }
  }) as EventListener)

  // 2. Request announcements — wallets will respond if EIP-6963 capable.
  window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT))

  // 3. Legacy: window.ethereum (single-provider environment).
  const legacy = (window as unknown as { ethereum?: LegacyWindowEthereum })
    .ethereum
  const kind = classifyLegacyProvider(legacy)
  if (kind) {
    const meta = walletMetaFor(kind)
    const d: WalletDescriptor = {
      rdns: meta.rdns,
      kind,
      name: meta.name,
      icon: null,
      walletInstallUrl: meta.walletInstallUrl,
      provider: legacy ?? null,
      uuid: `legacy-${meta.rdns}`,
      availability: "installed",
      iconSource: null,
    }
    const key = dedupeKey(d)
    if (!lastAnnounced.has(key)) {
      lastAnnounced.set(key, d)
      emit()
    }
  }

  // 4. window.ethereum.providers (multi-injected, pre-EIP-6963).
  const providers = legacy?.providers
  if (Array.isArray(providers)) {
    for (const p of providers) {
      const k = classifyLegacyProvider(p)
      if (!k) continue
      const meta = walletMetaFor(k)
      const d: WalletDescriptor = {
        rdns: meta.rdns,
        kind: k,
        name: meta.name,
        icon: null,
        walletInstallUrl: meta.walletInstallUrl,
        provider: p,
        uuid: `legacy-providers-${meta.rdns}-${providers.indexOf(p)}`,
        availability: "installed",
        iconSource: null,
      }
      const key = dedupeKey(d)
      if (!lastAnnounced.has(key)) {
        lastAnnounced.set(key, d)
        emit()
      }
    }
  }
}

/**
 * Build the canonical wallet list shown in the modal.
 *
 * Per the wallet-modal-assets task §01 the user must always see the full
 * canonical roster — MetaMask, Rabby, Coinbase Wallet, Robinhood Wallet,
 * WalletConnect, Browser Wallet — so the modal communicates which wallets
 * ZEKS supports and which are present in the current browser.
 *
 * Brand-asset policy:
 *   - Branded wallets default to `icon: null`. The modal renders the
 *     neutral Browser Wallet fallback (`/wallets/browser.svg`) when icon
 *     is null.
 *   - Installed providers override the null with their own profile
 *     `icon`, ONLY after `sanitizeProviderIcon()` accepts it.
 *   - We never substitute a hand-drawn or approximated brand SVG.
 *
 * Availability rules (per the wallet-modal-final task):
 *   - Installed (EIP-6963 / legacy detection)             → "installed"
 *   - Canonical branded wallet that is not detected       → "not-installed"
 *   - WalletConnect with NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID → "available"
 *   - WalletConnect without the env var                   → "not-configured"
 *   - Browser Wallet + an injected window.ethereum exists → "available"
 *   - Browser Wallet with no injected provider at all     → "unavailable"
 */
export function buildCanonicalWalletList(opts: {
  walletConnectProjectId: string | null
}): WalletDescriptor[] {
  // Snapshot what's currently installed.
  const installed: Map<WalletKind, WalletDescriptor> = new Map()
  for (const w of currentWallets()) {
    if (!installed.has(w.kind)) installed.set(w.kind, w)
  }

  const meta = walletMetaFor

  // Canonical ordering — injected wallets first, WalletConnect,
  // Browser Wallet fallback last.
  const canonical: WalletKind[] = [
    "metamask",
    "rabby",
    "coinbase",
    "robinhood",
    "walletconnect",
    "browser",
  ]

  return canonical.map((kind): WalletDescriptor => {
    if (kind === "walletconnect") {
      const m = meta("walletconnect")
      const configured = Boolean(opts.walletConnectProjectId)
      return {
        rdns: m.rdns,
        kind,
        name: m.name,
        // WalletConnect: no static brand asset in this repo. If the
        // SDK / Reown AppKit ever gets installed, it will register
        // itself as `app.walletconnect` via EIP-6963 and supply its
        // own icon; until then the modal shows the neutral fallback.
        icon: m.icon,
        walletInstallUrl: m.walletInstallUrl,
        provider: null,
        uuid: "walletconnect-static",
        availability: configured ? "available" : "not-configured",
        iconSource: null,
      }
    }
    if (kind === "browser") {
      const m = meta("browser")
      const injected =
        installed.size > 0 ||
        (typeof window !== "undefined" &&
          Boolean((window as unknown as { ethereum?: unknown }).ethereum))
      return {
        rdns: m.rdns,
        kind,
        name: m.name,
        icon: m.icon, // local neutral /wallets/browser.svg
        walletInstallUrl: m.walletInstallUrl,
        provider: null,
        uuid: "browser-fallback",
        availability: injected ? "available" : "unavailable",
        iconSource: "static-browser",
      }
    }
    const detected = installed.get(kind)
    if (detected) {
      // Detected (EIP-6963 / legacy) — keep whatever icon the
      // provider supplied (already passed sanitizeProviderIcon).
      return detected
    }
    const m = meta(kind)
    return {
      rdns: m.rdns,
      kind,
      name: m.name,
      icon: null, // no provider → no canonical asset → fallback
      walletInstallUrl: m.walletInstallUrl,
      provider: null,
      uuid: `not-installed-${m.rdns}`,
      availability: "not-installed",
      iconSource: null,
    }
  })
}

/**
 * WalletConnect project id resolution.
 *
 * WalletConnect Cloud requires a project id to use its relay. ZEKS does
 * NOT hard-code this — the developer must set the env var
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. If unset, WalletConnect is
 * surfaced as "not-configured" with a clear next-step message.
 */
export function resolveWalletConnectProjectId(): string | null {
  // process.env.NEXT_PUBLIC_* is inlined at build time by Next.js.
  // We do not hard-code any fallback value here.
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  if (typeof id !== "string") return null
  const trimmed = id.trim()
  if (!trimmed || trimmed.length < 8) return null
  return trimmed
}
