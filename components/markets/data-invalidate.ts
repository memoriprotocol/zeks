"use client"

/**
 * ZEKS Markets — Cross-hook data invalidation.
 *
 * Tiny module-level event bus. Hooks (`useLendingMarkets`,
 * `usePortfolio`) listen to `onDataInvalidate` and trigger their
 * `refresh()` whenever the bus fires.
 *
 * Why a separate module instead of a context:
 *   - The polling hooks are already module-level singletons with
 *     their own subscription lists. Adding React context just to
 *     push a refresh would force every component to wrap their
 *     tree in a provider.
 *   - This bus stays decoupled from rendering. Panels fire-and-
 *     forget after a successful onchain transaction.
 *
 * No fabrication: the bus only triggers the existing `refresh`
 * functions that already fetch from the canonical server routes.
 */

import * as React from "react"

type Reason =
  | "supply-success"
  | "borrow-success"
  | "withdraw-success"
  | "repay-success"
  | "withdraw-collateral-success"
  | "manual"

type Event = { reason: Reason; at: number }

const listeners = new Set<(e: Event) => void>()

export function emitDataInvalidate(reason: Reason): void {
  const evt: Event = { reason, at: Date.now() }
  for (const cb of listeners) {
    try {
      cb(evt)
    } catch {
      // ignore individual listener errors
    }
  }
}

export function onDataInvalidate(
  cb: (e: Event) => void,
): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * Subscribe the current React component to data-invalidate events.
 * Useful in panels that already have other state — the component
 * re-fetches its data on every emit.
 */
export function useDataInvalidateSubscription(
  cb: (e: Event) => void,
): void {
  const ref = React.useRef(cb)
  React.useEffect(() => {
    ref.current = cb
  }, [cb])
  React.useEffect(() => {
    return onDataInvalidate((e) => ref.current(e))
  }, [])
}
