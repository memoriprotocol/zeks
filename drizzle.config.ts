/**
 * ZEKS Drizzle Kit configuration.
 *
 * Used by the `drizzle-kit` CLI to generate and apply SQL migrations.
 * Schema source-of-truth is `db/schema.ts`; generated SQL files live
 * under `db/migrations/`.
 *
 * To generate a new migration after editing `db/schema.ts`:
 *
 *     npm run db:generate
 *
 * To apply pending migrations against the configured DATABASE_URL:
 *
 *     npm run db:migrate
 *
 * DATABASE_URL must be set in the environment (typically via
 * `.env.local` or `.env`) for both commands. The migration runner
 * uses `dotenv` to load `.env*` before reading the variable.
 *
 * Driver note: the application runtime (`db/client.ts`) uses the
 * Neon serverless HTTP driver. For migration execution, drizzle-kit
 * uses the standard `pg` driver via `driver: "pg-extra"` so the CLI
 * can speak the native PostgreSQL wire protocol against the Neon
 * direct endpoint (not the pooler). The DATABASE_URL used here
 * should be the Neon "direct" connection string, not the pooled one.
 */

import { defineConfig } from "drizzle-kit"
import { config as loadEnv } from "dotenv"

// Load .env* files so drizzle-kit can read DATABASE_URL without
// requiring the developer to `export DATABASE_URL=...` first.
loadEnv({ path: ".env.local" })
loadEnv({ path: ".env" })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set in .env.local. " +
      "Add your Neon direct connection string to .env.local before " +
      "running migrations.",
  )
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
})
