---
name: Production simulation copy exclusions
description: Anchor workspace-only exclusions when copying dependencies into isolated build tests.
---

Anchor tar exclusions for workspace data directories to the copy root, for example `./logs` rather than `logs`.

**Why:** An unanchored exclusion also removed a dependency's nested implementation directory. The isolated Vite build then failed on a missing Sentry module even though the original installation was intact.

**How to apply:** Preserve dependency internals while excluding real workspace credentials and user data. Check copied-package integrity before treating a simulation failure as an application or deployment defect.

Do not classify all PEM files as credentials. Preserve public dependency trust
bundles while excluding private keys.

**Why:** A rehearsal dropped certifi's public CA bundles, invalidated a prepared
Python capsule fingerprint, and caused unnecessary cold compression to exceed
its task deadline. That rehearsal failure was not proof that the original
Python tree had changed.

**How to apply:** Compare copied dependency inventories before interpreting
cache misses or TLS failures as defects in the deployment itself.