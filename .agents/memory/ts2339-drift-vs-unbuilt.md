---
name: TS2339 drizzle-row errors — true drift vs unbuilt feature
description: "Property X does not exist on {row shape}" is ambiguous; one fix is safe, the other crashes at runtime — always check the real NEON DB first
---

## Rule

A TS2339 of the form `Property 'X' does not exist on type '{ ...drizzle row literal... }'` is **ambiguous** and splits into two cases that need OPPOSITE handling. Before editing `shared/schema.ts`, query the real app DB (`NEON_DATABASE_URL`, NOT the managed `DATABASE_URL`) for that table's columns:

1. **True schema drift** — the DB column EXISTS but the Drizzle table def is missing it. Fix = add the column to the schema table. Safe + behavior-preserving (types catch up to reality).
2. **Unbuilt feature** — the DB column does NOT exist; the code reads a richer model that was never built (the read returns `undefined` at runtime today). Fix is NOT a type change:
   - Adding the column to the schema anyway makes Drizzle `.select()` emit SQL for a non-existent column → **runtime crash**. Actively harmful.
   - Removing the code reads guts the feature output.
   - Both are behavior-CHANGING product decisions — do NOT silently "fix the type."

**Confirmed example:** `royalty_statements` persists only the base column set in NEON (id, user_id, label, period_start, period_end, total_earnings, status, download_url, created_at). `server/services/royaltyExports.ts` reads many more (grossRevenue, netRevenue, statementPeriod, auditTrail, dspBreakdown, territoryBreakdown, lineItems, payableAmount, …) → unbuilt feature. Fixed behavior-preservingly with a local `ExportableStatement = RoyaltyStatement & {...intended fields...}` type (scalars precise; breakdown arrays `unknown[]` to match cast-at-use; boundary casts at the engine + `db.select()` sources) — NOT by editing the schema.

**Related sibling pattern:** TS2339 `Property 'X' does not exist on type 'DatabaseStorage'` (e.g. `createRelease`, `getUserReleases`) = code calls storage methods absent from the class/interface — same true-drift (add to interface if impl exists) vs unbuilt (method genuinely missing) split. Check the storage impl before adding to the interface.

**Why:** the user's standing constraints are behavior-preserving + prioritize stability. Mass "drive TS2339 to 0" is unsafe because a large fraction of server TS2339 are drizzle-row-shape misses, many of which are unbuilt features whose naive type-fix breaks runtime. **How to apply:** per table/cluster, check NEON columns (or storage impl) → add to schema/interface ONLY when the underlying thing already exists; otherwise escalate as a product decision (build+migrate vs trim), never a silent type patch.
