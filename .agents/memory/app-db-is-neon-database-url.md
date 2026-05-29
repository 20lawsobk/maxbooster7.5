---
name: App connects to NEON_DATABASE_URL, not Replit's managed DATABASE_URL
description: This repo's runtime DB is a self-managed Neon DB in NEON_DATABASE_URL (shared dev+prod); Replit's managed DATABASE_URL, executeSql, and the Publish schema diff target a DIFFERENT database
---

# The app's real database is NEON_DATABASE_URL

The runtime connection pool resolves `config.database.url = env.NEON_DATABASE_URL || env.DATABASE_URL`
(`server/config/defaults.ts`, consumed by `server/db.ts`). `NEON_DATABASE_URL` is set as a
**shared** secret — the SAME value for development and production — pointing at a
**self-managed Neon database** (host `ep-nameless-mouse-…/neondb`).

Replit's **managed** `DATABASE_URL` is a **different, separate** database. Critically:
- `executeSql({ environment: "development" | "production" })` queries the **managed** DB.
- The Publish flow's dev→prod schema diff operates on the **managed** DB.
- So "does the table exist in prod?" checks via `executeSql` and "re-publish to create the
  table" are both pointed at the WRONG database — they will look correct while the live app
  still 500s with `relation "..." does not exist`.

**Why:** a table created via `psql $DATABASE_URL` or seen via `executeSql` lands in the managed
DB the app never reads. This exact mismatch caused the Beat Loop "Data Load Error":
`beat_money_loop_state` existed in the managed DB but was absent from the app's NEON_DATABASE_URL DB.

**How to apply — for ANY schema/data work or table-existence check in this repo:**
1. Target `NEON_DATABASE_URL`, not the managed `DATABASE_URL`.
2. To inspect/modify the real app DB from the code-execution sandbox: read the value with
   `viewEnvVars({ type: 'env', environment: 'shared', keys: ['NEON_DATABASE_URL'] })`
   (NEVER log the connection string), then connect with `@neondatabase/serverless` `Pool` + `ws`.
3. Because dev and prod share this one DB, additive DDL (`CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`) fixes both environments at once; no redeploy needed since the
   app re-checks relation existence per query.
4. Replit's "never script prod DDL" rule is about the managed read-only prod replica; this
   self-managed Neon DB is a normal read/write connection. Still prefer additive, non-destructive
   DDL and match `shared/schema.ts` exactly. Avoid full `drizzle-kit push` here (interactive,
   can surface destructive diffs across 250+ tables).
