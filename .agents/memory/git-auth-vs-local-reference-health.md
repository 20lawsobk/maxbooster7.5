---
name: Git authentication versus local reference health
description: Distinguish working GitHub authorization from broken local Git metadata.
---

GitHub API authorization, Git transport authentication, and local reference
integrity are separate checks. A working connector does not prove the Git panel
can fetch, and a failed fetch does not necessarily require OAuth reauthorization.

**Why:** An authenticated repository lookup and remote branch advertisement both
succeeded while fetching failed because a remote-tracking reference pointed to a
missing object. The workspace also lacked a default origin and branch upstream.

**How to apply:** Classify authentication versus local-object/reference failures
before requesting reconnection. Preserve local commits and working changes;
repairing disposable remote-tracking metadata must not become a reset, merge,
push, or deletion of local history.