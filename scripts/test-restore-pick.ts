/**
 * Smoke test for the silent-restore provider resolution.
 *
 * Confirms:
 *   - When we persist rdns "io.metamask", restore picks the
 *     MetaMask provider object (NOT window.ethereum when multiple
 *     providers are installed).
 *   - When we DO NOT have a stored rdns, restore falls back to
 *     window.ethereum (legacy single-injected).
 *   - When the previously-connected wallet is no longer installed,
 *     restore gracefully falls back.
 *
 * We do NOT exercise the React provider itself; we test the
 * pure helpers that drive it.
 */

/**
 * Minimal CustomEvent polyfill for the Node.js test environment.
 * Node's built-in EventTarget does not include CustomEvent.
 */
class TestCustomEvent extends Event {
  readonly detail: unknown
  constructor(type: string, init?: Record<string, unknown>) {
    super(type)
    this.detail = init?.detail
  }
}

// Stub browser globals so providers.ts can run in Node. We give
// the stub a real addEventListener/dispatchEvent pair so EIP-6963
// announce events actually reach the listener registered by
// startWalletDiscovery().
const _listeners = new Map<string, Set<(ev: Event) => void>>()
const _win = {
  ethereum: undefined as unknown,
  addEventListener(type: string, cb: (ev: Event) => void) {
    if (!_listeners.has(type)) _listeners.set(type, new Set())
    _listeners.get(type)!.add(cb)
  },
  removeEventListener(type: string, cb: (ev: Event) => void) {
    _listeners.get(type)?.delete(cb)
  },
  dispatchEvent(ev: Event): boolean {
    const set = _listeners.get(ev.type)
    if (set) for (const cb of set) cb(ev)
    return true
  },
}
;(globalThis as unknown as { window: typeof _win }).window = _win

import {
  findWalletByRdns,
  getDiscoveredWallets,
  startWalletDiscovery,
  type WalletDescriptor,
} from "../lib/wallet/providers"

interface Picked {
  provider: unknown | null
  rdns: string | null
  kind: string | null
}

function pickFromAnnounced(
  storedRdns: string | null,
  storedKind: string | null,
  windowEthereum: unknown,
): Picked {
  if (storedRdns) {
    const found = findWalletByRdns(storedRdns)
    if (found?.provider) {
      return { provider: found.provider, rdns: found.rdns, kind: found.kind }
    }
  }
  if (storedKind) {
    const list = getDiscoveredWallets()
    const match = list.find((w) => w.kind === storedKind)
    if (match?.provider) {
      return { provider: match.provider, rdns: match.rdns, kind: match.kind }
    }
  }
  if (windowEthereum) {
    return { provider: windowEthereum, rdns: null, kind: null }
  }
  return { provider: null, rdns: null, kind: null }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    // eslint-disable-next-line no-console
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

// --- Test 1: rdns round-trip via the descriptor registry
// startWalletDiscovery() registers an internal EIP-6963 listener.
// We dispatch synthetic announce events to exercise it.
startWalletDiscovery()

const metamaskProvider = { _tag: "mm" }
const rabbyProvider = { _tag: "rabby" }

const dispatch = (detail: { info: { rdns: string; name: string; icon: string; uuid: string }; provider: unknown }) => {
  const ev = new TestCustomEvent("eip6963:announceProvider", { detail })
  _win.dispatchEvent(ev as unknown as Event)
}

dispatch({
  info: { rdns: "io.metamask", name: "MetaMask", icon: "", uuid: "mm-uuid-1" },
  provider: metamaskProvider,
})
dispatch({
  info: { rdns: "io.rabby", name: "Rabby", icon: "", uuid: "rabby-uuid-1" },
  provider: rabbyProvider,
})

// window.ethereum is Rabby (multi-injected — last one to inject wins)
_win.ethereum = rabbyProvider

// Test 1a: rdns "io.metamask" → must return MetaMask, NOT window.ethereum
const picked1 = pickFromAnnounced("io.metamask", null, _win.ethereum)
assert(picked1.provider === metamaskProvider, `1a expected MetaMask, got ${(picked1.provider as { _tag: string })._tag}`)
assert(picked1.rdns === "io.metamask", "1a rdns")

// Test 1b: rdns "io.rabby" → must return Rabby (which is window.ethereum here)
const picked2 = pickFromAnnounced("io.rabby", null, _win.ethereum)
assert(picked2.provider === rabbyProvider, "1b provider")
assert(picked2.rdns === "io.rabby", "1b rdns")

// Test 1c: no stored rdns → falls back to window.ethereum (Rabby in this env)
const picked3 = pickFromAnnounced(null, null, _win.ethereum)
assert(picked3.provider === rabbyProvider, "1c fallback")

// Test 1d: stored rdns that no longer exists → falls back to window.ethereum
const picked4 = pickFromAnnounced("io.brave", null, _win.ethereum)
assert(picked4.provider === rabbyProvider, "1d missing rdns fallback")

// Test 1e: stored kind "metamask" → finds the MetaMask announced wallet
const picked5 = pickFromAnnounced(null, "metamask", _win.ethereum)
assert(picked5.provider === metamaskProvider, "1e kind fallback")

// Test 1f: list of announced wallets contains both rdns
const all: WalletDescriptor[] = getDiscoveredWallets()
const rdnsList = all.map((w) => w.rdns)
assert(rdnsList.includes("io.metamask"), `1f io.metamask in [${rdnsList.join(",")}]`)
assert(rdnsList.includes("io.rabby"), `1f io.rabby in [${rdnsList.join(",")}]`)

// eslint-disable-next-line no-console
console.log("PASS: wallet provider resolution (6 assertions)")
