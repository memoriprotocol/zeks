/**
 * Dev-only diagnostics for the wallet connector.
 *
 * Collects a deterministic block of information on every page load
 * so a developer can confirm:
 *
 *   - whether window.ethereum exists
 *   - which EIP-6963 providers announced themselves
 *   - which provider object identity was selected for restore
 *   - the result of eth_accounts + eth_chainId  ← now actually called
 *
 * IMPORTANT privacy guarantees:
 *   - We never log full account addresses.
 *   - We never log signatures, keys, or secrets.
 *   - We never log request bodies that may carry PII.
 *   - Logs only fire in development. Production builds strip all
 *     calls via the `if (process.env.NODE_ENV === "production") return`
 *     short-circuit.
 *
 * Output is one `[zeks:wallet]` line per fact, prefixed so it can
 * be filtered from the browser console easily.
 */

declare const process: { env: { NODE_ENV?: string } }

interface LegacyWindowEthereum {
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
  isBraveWallet?: boolean
  providers?: unknown[]
}

interface DebugSnapshot {
  hasEthereum: boolean
  isMetaMask: boolean
  isRabby: boolean
  isCoinbaseWallet: boolean
  isBraveWallet: boolean
  multiInjectedProvidersCount: number
  announcedCount: number
  announcedRdns: string[]
  selectedRdns: string | null
  selectedProviderIsFunction: boolean
  ethAccountsResult: "non-empty" | "empty" | "threw" | "no-provider"
  ethAccountsCount: number
  chainId: string | null
}

function safeLog(line: string): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production")
    return
  // eslint-disable-next-line no-console
  console.log(`[zeks:wallet] ${line}`)
}

/**
 * Collect all STATIC info about the wallet environment.
 * No eth_accounts call here — that happens after provider is bound.
 */
function collectStaticInfo(selectedRdns: string | null, selectedProvider: unknown): DebugSnapshot {
  const eth = (window as unknown as { ethereum?: LegacyWindowEthereum }).ethereum
  const hasEthereum = Boolean(eth)
  return {
    hasEthereum,
    isMetaMask: Boolean(eth?.isMetaMask),
    isRabby: Boolean(eth?.isRabby),
    isCoinbaseWallet: Boolean(eth?.isCoinbaseWallet),
    isBraveWallet: Boolean(eth?.isBraveWallet),
    multiInjectedProvidersCount: Array.isArray(eth?.providers) ? eth!.providers!.length : 0,
    announcedCount: 0,
    announcedRdns: [],
    selectedRdns,
    selectedProviderIsFunction: typeof (selectedProvider as { request?: unknown })?.request === "function",
    ethAccountsResult: "no-provider",
    ethAccountsCount: 0,
    chainId: null,
  }
}

/**
 * Fill in the EIP-6963 announcement portion of the snapshot.
 */
export function recordAnnouncements(snap: DebugSnapshot, rdns: string[]): DebugSnapshot {
  snap.announcedCount = rdns.length
  snap.announcedRdns = rdns
  return snap
}

/**
 * Log a single-line restore summary to the browser console.
 * Call AFTER eth_accounts has resolved with the real result.
 *
 * Output:  [zeks:wallet] restore rdns=io.metamask ethAccounts=non-empty(1) chainId=0x1229
 *
 * Dev-only — stripped in production.
 */
export function logSnapshot(tag: string, snap: DebugSnapshot): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return
  safeLog(
    `restore rdns=${snap.selectedRdns ?? "none"} ethAccounts=${snap.ethAccountsResult}(${snap.ethAccountsCount}) chainId=${snap.chainId ?? "?"} status=${tag}`,
  )
}

export function collectStaticInfoExport(
  selectedRdns: string | null,
  selectedProvider: unknown,
): DebugSnapshot {
  return collectStaticInfo(selectedRdns, selectedProvider)
}
