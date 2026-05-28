---
name: Plugin catalog seeding path
description: Which function actually seeds plugin_catalog and the Drizzle silent-drop trap that hid a duplicate
---

There are (were) two functions that looked like they seeded `plugin_catalog`:

1. `server/storage.ts → seedPluginCatalog()` — the one called from `server/init-admin.ts` (line ~502) and therefore the one that actually runs at boot. Uses the real table columns: `name, slug, type, category, vendor, version, description, parameters (jsonb), presets (jsonb), isBuiltIn, isActive`.
2. `server/services/pluginHostService.ts → ensurePluginCatalogSeeded()` — only reachable from `createInstance()` when a slug is missing from the catalog, which in practice never fires in production because (1) is already complete.

**Why this matters:** Drizzle silently drops fields written to columns the schema doesn't define. The pluginHostService variant wrote `{kind, manifest}` — neither column exists in `plugin_catalog` — so it succeeded with no error and persisted nothing. Typecheck did not catch it. Always confirm the column names against `shared/schema.ts:pluginCatalog` (around line 2001) before assuming a write landed.

**How to apply:**
- All plugin-catalog seeding lives in `storage.ts:seedPluginCatalog`. Add new logic there, not in pluginHostService.
- `pluginHostService.ensurePluginCatalogSeeded` is now a thin delegate to `storage.seedPluginCatalog()` — keep it that way to avoid the duplicate-path trap.
- The boot log line `✅ Plugin catalog seeded` comes from `init-admin.ts`, **not** from storage; the real diagnostic is `✓ Plugin catalog: N inserted, M updated (rev …)` and `✓ Factory genre presets: …`.
- `plugin_presets.plugin_id` stores the catalog **slug** (text), not the UUID — chosen for portability across environments where UUIDs differ.
