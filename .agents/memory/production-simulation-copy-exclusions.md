---
name: Production simulation copy exclusions
description: Anchor workspace-only exclusions when copying dependencies into isolated build tests.
---

Anchor tar exclusions for workspace data directories to the copy root, for example `./logs` rather than `logs`.

**Why:** An unanchored exclusion also removed a dependency's nested implementation directory. The isolated Vite build then failed on a missing Sentry module even though the original installation was intact.

**How to apply:** Preserve dependency internals while excluding real workspace credentials and user data. Check copied-package integrity before treating a simulation failure as an application or deployment defect.