---
name: Learning-state durability
description: Development checkpoint retention and versioned learning-history compatibility.
---

Keep development private learning state inside the workspace, excluded from Git and deployment.

**Why:** Home-directory checkpoints disappeared between sessions while workspace verification evidence survived, causing the learner to start again at generation zero.

**How to apply:** Verify retained checkpoint hashes and actual parent-linked learning after restarts. Workspace retention is not evidence of published-storage durability.

Curriculum evolution must preserve exact historical transformations.

**Why:** Candidate admission recomputes training text from sources. Applying a new curriculum retroactively would invalidate legitimate parents and break cumulative learning.

**How to apply:** Validate historical reports using their recorded policy, retain old policy implementations, and reject unknown policies. Partial source-stage supervision must never invent a missing CTA or relax serving-quality checks.
