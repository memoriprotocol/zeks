/**
 * ZEKS Persistent Storage — Drizzle + Neon HTTP client (Phase 4B)
 *
 * This module exposes a single `getDb()` function that returns a
 * Drizzle ORM client bound to a Neon serverless HTTP driver. The
 * client is created lazily on first use so that:
 *
 *   - importing this module is FREE (no connection setup at import
 *     time);
 *   - tests / scripts that never call `getDb()` don't trigger a
 *     connection validation;
 *   - build environments without `DATABASE_URL` (e.g. static analysis,
 *     CI lint, type-check) can still type-import this module.
 *
 * IMPORTANT:
 *
 *   - The client throws if `DATABASE_URL` is missing. This is the
 *     intended behavior for any code path that actually queries the
 *     database.
 *   - Phase 4B does NOT add any caller of `getDb()` in app/api/* or in
 *     the chart layer. The chart still shows the empty-state copy.
 *     This module is a leaf dependency until Phase C wires it up.
 */

import { neon, neonConfig } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import ws from "ws"

import * as schema from "./schema"

// Neon's HTTP driver uses native `WebSocket` in Node 22+; on older
// Node we polyfill with `ws`. Node 24 ships a global WebSocket, but
// assigning the polyfill is harmless and keeps this working on CI
// runners that pin Node 18 / 20.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket
}

let cached: NeonHttpDatabase<typeof schema> | null = null

/**
 * Return the singleton Drizzle client. Throws if `DATABASE_URL` is
 * not configured. Server-side only — do NOT import from a client
 * component.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    throw new Error(
      "DATABASE_URL is not configured. Set DATABASE_URL in your " +
        "environment (Neon Postgres connection string) before " +
        "calling getDb().",
    )
  }

  const sql = neon(url)
  cached = drizzle(sql, { schema })
  return cached
}

/**
 * Test-only helper to forget the cached client. Not used by app
 * code; kept exported so future test harnesses can reset state
 * between cases.
 */
export function __resetDbForTests(): void {
  cached = null
}

export { schema }
