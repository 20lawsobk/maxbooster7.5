---
name: Retained gitlink updates
description: Preserve legacy dependency updates when the legacy directory is tracked only as a gitlink.
---

**Rule:** Successful filesystem edits and clean scans do not prove that retained legacy changes will survive a task merge. Check how the containing repository tracks the directory.

**Why:** A retained legacy copy, including another copy inside it, had no submodule Git metadata. Its dependency edits were invisible to the parent diff despite its original commit objects being locally available.

**How to apply:** Preserve the legacy source. Record reproducible updates in the tracked parent and verify replay against the original bytes. Reject unexpected custom edits and symlink paths instead of overwriting them; test idempotence and configure replay during merge setup.

Successive replay bundles must retain verified predecessor hashes, not just the original and newest hashes.

**Why:** A later cumulative security update kept the original baseline but replaced the final content, causing a previously patched main workspace to be misclassified as custom changes.

**How to apply:** Carry forward exact, path-specific hashes from prior reviewed bundle contents. Never accept an observed live hash merely to unblock setup. Test original, intermediate, newest, and genuinely customized files.

Keep whole-workspace audits separate from deployment-payload gates.

**Why:** The publishing build sees retained legacy copies before final image filtering. Requiring their installed dependencies blocked publishing even though those trees were excluded from the shipped image and app-remainder capsule.

**How to apply:** Preserve exhaustive legacy findings in workspace audits. A release gate may omit legacy scopes only with verified whole-tree image exclusions; fail closed if exclusions disappear, and continue checking every shipped workspace and nested installed dependency.