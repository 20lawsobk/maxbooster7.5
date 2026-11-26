---
name: Rebase after merged origin history
description: Preserve the final local tree when rebasing a branch that already merged origin.
---

When local `main` already contains an origin merge, a flattened rebase can replay pre-merge commits that the merge later superseded. Those intermediate commits may temporarily remove or revert files that belong in the final merged tree.

**Why:** Replaying the local history without its merge commit exposed transient deletions and older build states during conflict resolution.

**How to apply:** Compare `ORIG_HEAD`, `origin/main`, and the rebased tree; use range-diff to identify patch-equivalent or superseded commits, and resolve files against the final merged state rather than an intermediate snapshot.
