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

GitHub REST access through a connector does not provide Git smart transport for
uploading local commit objects. If only REST writes are available, rebuilding the
current tree as an API-created commit collapses local history and requires
explicit user approval. Never accept an unverified SSH host key to bypass a
failed PAT-backed push.

**Why:** A connected GitHub API could read the target repo while the local
credential-backed transport was rejected or routed through an unverified SSH
host.

**How to apply:** Confirm the exact push transport before retrying. If it is
unavailable, report the authentication or host-trust block rather than
rewriting the branch through file APIs.