---
name: Deployment concurrency boundaries
description: Resource limits and failure draining for destructive build phases
---

Size build compression from shared effective container capacity, and drain active
destructive jobs before returning a failure to recovery or process exit.

**Why:** Host CPU counts can exceed container quotas. Fail-fast promise rejection
can return while sibling packers still remove source directories; recovery must
not race them.

**How to apply:** Bound job concurrency and per-job compression threads together,
stop admitting queued jobs after failure, and retain independent per-capsule
integrity checks. Do not infer whole-publish speedup from bundling-only timings.