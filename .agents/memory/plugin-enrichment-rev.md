---
name: Plugin enrichment revision marker
description: How built-in plugin parameter and factory-preset updates are gated and propagated
---

Built-in DAW plugin parameter sets and factory genre presets are versioned by a single `MANIFEST_REV` string in `server/storage.ts:seedPluginCatalog`.

**Rule:** Bump `MANIFEST_REV` whenever the enrichment layer (`server/services/plugins/pluginEnrichment.ts`) ships new reference parameters or genre presets. The seeder compares each row's stored `presets._rev` (for `plugin_catalog`) and `metadata._rev` (for `plugin_presets`); any mismatch triggers an in-place update of that row. Rows whose rev already matches are skipped.

**Why:** Seeding runs on every boot. Without a revision gate it would either (a) always re-update 434 rows + 3000+ presets — wasteful — or (b) short-circuit on row count and never roll out edits to existing rows. The rev marker is the only signal that says "the canonical content changed; refresh."

**How to apply:**
- Edits to `pluginEnrichment.ts` (parameter tables, `fillForAll` matrix, genre list) require a `MANIFEST_REV` bump in `storage.ts` to take effect on existing deployments.
- Enrichment is **additive only** (`enrichPlugin` merges missing param IDs into the existing array, preserving order and saved sessions). Do not change the contract — saved user sessions reference param IDs by string and must remain stable.
- Factory presets are namespaced with `name = 'Genre: <genre-id>'` and `metadata.factory = true`, scoped by `userId IS NULL`. Never overload that name pattern for user presets.
- IP stance for any added parameters: control-surface names/ranges/units only — no trademarked product names, no signature DSP defaults copied from commercial plugins, no vendor preset names.
