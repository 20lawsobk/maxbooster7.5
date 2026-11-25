---
name: Drizzle public schema
description: How this Drizzle ORM version represents the PostgreSQL public schema.
---

Do not define the PostgreSQL `public` namespace with `pgSchema("public")`; this Drizzle version throws at module load because public is implicit. Keep `public` tables declared with `pgTable()`. When a query must be schema-stable, qualify raw SQL with `public.` and initialize the app database session before issuing ORM queries.

**Why:** An attempted `pgSchema("public").table(...)` failed while importing the shared schema, preventing production startup. The error explicitly requires `pgTable()` for public relations.

**How to apply:** Use `pgTable()` for application tables in `public`; use `pgSchema()` only for non-public schemas such as MaxCore's isolated schema. Add tests that import the real schema and run `LIMIT 0` query probes before changing table declarations.
