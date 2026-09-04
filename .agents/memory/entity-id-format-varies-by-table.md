---
name: Entity ID format is not uniformly UUID across tables
description: don't assume a path param is a UUID (or add UUID-format validation middleware) without checking that specific table's actual ID-generation code first
---
This codebase does not use one ID format everywhere. Some tables default `id` to `gen_random_uuid()` (real UUIDs). Others generate application-side IDs in non-UUID shapes — e.g. `projects.id` is `randomBytes(8).toString("hex")` (16-char hex) in some insert paths, and live data also shows nanoid-style IDs for the same table.

**Why:** adding UUID-format-validation middleware (e.g. a generic `requireUUIDParam`) to a route's `:id`-like param without checking the source table's real ID generation will 400 every request whose ID happens to not be a UUID — potentially most real rows, not just malformed input. This exact regression was introduced and then caught/fixed on the royalty-splits routes.

**How to apply:** before adding ID-format validation to any route, check the specific entity's insert/schema code (default `gen_random_uuid()` vs app-generated string) and, ideally, a sample of live IDs in NEON_DATABASE_URL. Tables with an unconditional `gen_random_uuid()` default that app code never overrides (e.g. `project_royalty_splits.id`) are safe to validate as UUIDs; `projects.id` is NOT.
