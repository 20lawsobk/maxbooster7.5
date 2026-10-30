---
name: Path-scoped Git history scrubbing
description: Avoid path-blind scrub callbacks and account for prior filter metadata and untouched refs.
---

When rewriting content selected by both path and contents, use git-filter-repo's file-info callback; blob callbacks do not carry filenames. A prior-run marker can prompt for continuation even with `--force`; continue only when preserving prior rewrite mappings is intended. Scope `--refs` deliberately: rewriting one branch does not scrub other refs that still reach the original commits.

**Why:** A successful branch rewrite can leave old credentials reachable from local backup or agent-managed refs, and a path-blind callback can fail before the rewrite starts.

**How to apply:** Confirm the target refs first, use a filename-aware callback for selective edits, and verify both the target branch's rewritten content and any intentionally untouched refs before pushing.