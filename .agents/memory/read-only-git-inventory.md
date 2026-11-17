---
name: Read-only Git inventory
description: Avoid optional Git index writes when inventorying an isolated worktree.
---

For read-only inventory and source-analysis subprocesses, set `GIT_OPTIONAL_LOCKS=0` in the child process environment rather than changing global Git configuration. This avoids optional index refresh writes that can conflict with guarded isolated worktrees.

**Why:** In this workspace, a source-analysis command inside a detached worktree was stopped by the Git safety guard when Git attempted to create that worktree's `index.lock`. Disabling optional locks allowed the same read-only analysis path to complete.

**How to apply:** Set the variable only on Git subprocesses used for read-only audits. Do not bypass the Git safety guard or use the setting to justify intentional repository mutations.
