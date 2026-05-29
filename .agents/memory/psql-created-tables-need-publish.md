---
name: psql-created tables need a Publish to reach prod
description: Tables created via direct psql on dev Neon are missing in production until a Publish runs the dev→prod schema diff
---

# Direct-psql tables only reach production via Publish

Several features in this repo had their tables created by running **direct psql/DDL
against the dev Neon database** instead of through the schema flow — e.g. Beat Money Loop
(`beat_money_loop_state`, `beat_money_loop_cycles`), plugin catalog
(`plugin_catalog`, `plugin_presets`), `generated_contracts`.

**Symptom:** the feature works in dev but the deployed app 500s with
`DrizzleQueryError: relation "<table>" does not exist`. The Beat Loop tab surfaced this
as a generic "Data Load Error" because `GET /api/admin/beat-money-loop/status` failed.

**Why it happens:** Replit applies the production schema ONLY through the Publish flow,
which diffs the dev database against prod and applies the diff. A code-only redeploy does
NOT create new tables. So a table that exists in dev (however it got there) stays absent
in prod until the user clicks Publish.

**How to fix (do NOT script prod DDL — prod is a read-only replica via executeSql, and
the database skill forbids prod migration scripts / deploy-time DDL / startup DDL):**
1. Ensure the table is in the schema source of truth (`shared/schema.ts`) AND present in
   the dev DB.
2. Tell the user to **re-publish**; the publish-time dev→prod diff creates the table.
3. Verify with `executeSql({ environment: "production" })` that the table + columns exist.

**Note:** the running deployment re-checks relation existence per query, so once the
tables exist in prod the live endpoint recovers without a redeploy.

**Why not `db:push` here:** `npm run db:push` runs a full-schema `drizzle-kit push` (interactive,
can surface unrelated destructive diffs on this large schema). When dev already has the
table, db:push is unnecessary; the missing piece is purely the prod Publish.
