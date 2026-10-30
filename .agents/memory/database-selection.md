---
name: Database selection
description: User's database choice for running the imported application.
---

Use the existing Neon database for this development app, not the separate template development database.

The user corrected their earlier answer: no other running app uses this database.

**Why:** The user explicitly selected "Existing Neon database" when asked which database this development app should use.

**How to apply:** Preserve the application's Neon configuration. Treat schema changes against the existing database separately from permission to connect; check compatibility read-only before startup and obtain authorization for migrations affecting existing data. Do not keep requesting coordination with a second app based on the corrected answer. Stop this application's writers during storage migrations and verify recovery prerequisites.
