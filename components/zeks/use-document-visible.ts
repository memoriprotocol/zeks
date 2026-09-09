"use client"

/**
 * useDocumentVisible — listens to document.visibilitychange.
 *
 * Returns `true` when the page is visible. Used to pause / throttle
 * background polling.
 */
import * as React from "react"

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState<boolean>(() => {
    if (typeof document === "undefined") return true
    return !document.hidden
  })

  React.useEffect(() => {
    if (typeof document === "undefined") return
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", onChange)
    // Sync once on mount in case state changed between SSR and hydration.
    onChange()
    return () => {
      document.removeEventListener("visibilitychange", onChange)
    }
  }, [])

  return visible
}
