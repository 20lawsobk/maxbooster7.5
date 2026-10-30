---
name: Database selection
description: User's database choice for running the imported application.
---

Use the existing Neon database for this development app, not the separate template development database.

The user confirmed that another running app also uses this database.

**Why:** The user explicitly selected "Existing Neon database" when asked which database this development app should use.

**How to apply:** Preserve the application's Neon configuration. Treat schema changes against the existing database separately from permission to connect; check compatibility read-only before startup and obtain authorization for migrations affecting existing data or other running applications. For shared storage upgrades, coordinate all writers and verify recovery prerequisites rather than treating this as an isolated development database.
