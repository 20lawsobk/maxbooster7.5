---
name: Deterministic completion patches
description: Rules for automated evidence-based code patches produced by the Max Booster completion loop.
---

The completion loop uses local deterministic rules; it does not use a third-party model or translate free-form prose into source code. A rule may emit a patch only when it proves an exact mismatch from current source-bound evidence and a targeted failing test. The resulting schemaVersion 1 plan must pass through the existing completion executor.

**Why:** the owner selected local deterministic rules for generating patches from completion findings and evidence.

**How to apply:** Keep rules narrowly registered and source-exact. Bind each patch to current report/learning hashes, source identity, exact before/after hashes, and allowlisted passing checks. Apply only inside the marked isolated worktree; preserve the executor's clean-worktree, backup, readback, verification, rollback, and idempotency gates. Leave unmatched or ambiguous findings as proposals.
