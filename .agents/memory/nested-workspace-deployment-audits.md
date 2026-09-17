---
name: Nested workspace deployment audits
description: Deployment security checks include bundled subsystem code-generation dependencies.
---

Audit nested MaxCore and PDIM workspace manifests and lockfiles when deployment reports a dependency absent from the root package manifest.

**Why:** The publishing security gate blocked the whole application on a vulnerable code generator in a bundled subsystem. Updating only the main application's dependencies would not remove that blocker.

**How to apply:** Locate all tracked occurrences, update each affected workspace with its package manager, then verify both lockfile resolution and the package resolved from the consuming workspace. Do not run the destructive capsule-packing build merely to check dependency resolution.