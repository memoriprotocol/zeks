/**
 * Dev-only lifecycle logger for supply / borrow transactions.
 *
 * Activates ONLY when `process.env.NODE_ENV !== "production"`. In
 * production the helper degrades to a no-op so nothing leaks into
 * deployed browsers.
 *
 * Never logs:
 *   - raw signed payloads (signed once the wallet has applied
 *     them, but we still avoid logging)
 *   - signatures / recovery ids
 *   - hex calldata blobs longer than 64 chars
 *
 * The lifecycle log is for manual smoke tests. Format:
 *
 *   [zeks] EVENT  { key=value ... }
 *
 * with timestamps in ms since session start.
 */

const ENABLED =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NODE_ENV !== "production"

const sessionStart =
  typeof performance !== "undefined" ? performance.now() : Date.now()

export type LifecycleEvent =
  | "SIMULATION_OK"
  | "SIMULATION_FAILED"
  | "APPROVAL_SENT"
  | "APPROAL_REJECTED"
  | "APPROVAL_CONFIRMED"
  | "SUPPLY_SENT"
  | "SUPPLY_REJECTED"
  | "SUPPLY_CONFIRMED"
  | "DATA_REFRESHED"
  | "GUARD_BLOCKED"
  | "STAGE_CHANGED"

export function devLifecycle(
  event: LifecycleEvent,
  detail?: Record<string, unknown>,
): void {
  if (!ENABLED) return
  const ts =
    Math.round(
      (typeof performance !== "undefined"
        ? performance.now()
        : Date.now() - sessionStart) * 10,
    ) / 10
  // truncate large strings
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detail ?? {})) {
    if (v == null) {
      safe[k] = v
      continue
    }
    if (typeof v === "bigint") {
      safe[k] = v.toString()
      continue
    }
    if (typeof v === "string") {
      safe[k] = v.length > 64 ? `${v.slice(0, 64)}…(+${v.length - 64})` : v
      continue
    }
    safe[k] = v
  }
  const parts = Object.entries(safe)
    .map(([k, v]) => `${k}=${formatVal(v)}`)
    .join(" ")
  // eslint-disable-next-line no-console
  console.info(`[zeks] ${event} t=${ts}ms ${parts}`)
}

function formatVal(v: unknown): string {
  if (v == null) return String(v)
  if (typeof v === "string") return `"${v}"`
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return String(v)
  if (typeof v === "bigint") return v.toString()
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
