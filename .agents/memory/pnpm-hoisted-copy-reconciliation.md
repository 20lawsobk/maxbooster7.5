---
name: Pnpm hoisted copy reconciliation
description: Preventing stale generated package copies from masking freshly updated pnpm locks.
---

When a pnpm workspace uses hoisted dependencies, do not treat a successful frozen install or a correct lockfile as proof that the runtime resolves the patched release. Resolve the package from the consuming workspace and read its package manifest.

**Why:** An existing top-level generated copy can remain at an older version while pnpm's virtual store and lockfile already contain the newer release. Runtime resolution then continues to load the stale copy.

**How to apply:** After a security upgrade, verify both the lockfile and the installed package resolved from each affected consumer. If a stale hoisted copy persists, remove only that generated package directory and rerun the frozen pnpm install; do not alter source manifests or introduce a different linker mode.