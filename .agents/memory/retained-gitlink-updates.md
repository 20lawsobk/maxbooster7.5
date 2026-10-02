---
name: Retained gitlink updates
description: Preserve legacy dependency updates when the legacy directory is tracked only as a gitlink.
---

**Rule:** Successful filesystem edits and clean scans do not prove that retained legacy changes will survive a task merge. Check how the containing repository tracks the directory.

**Why:** A retained legacy copy, including another copy inside it, had no submodule Git metadata. Its dependency edits were invisible to the parent diff despite its original commit objects being locally available.

**How to apply:** Preserve the legacy source. Record reproducible updates in the tracked parent and verify replay against the original bytes. Reject unexpected custom edits and symlink paths instead of overwriting them; test idempotence and configure replay during merge setup.