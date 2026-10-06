---
name: Deployment concurrency boundaries
description: Resource limits and failure draining for destructive build phases
---

The historical publishing scaffold should use bounded, moderate compression,
not maximum compression with automatic host-wide threading. Preserve compressor
stderr and finish a staged archive before replacing its previous generation.

**Why:** A publish stopped at compression of a 640 MB dependency tree, with no
diagnostic because tar stderr was discarded. The logs did not establish OOM;
bounded resource use and visible errors address the risks without claiming it.

**How to apply:** Keep this tradeoff when tuning publishing time; verify actual
pack/restore and codec gates together in disposable fixtures.

Size build compression from shared effective container capacity, and drain active
destructive jobs before returning a failure to recovery or process exit.

**Why:** Host CPU counts can exceed container quotas. Fail-fast promise rejection
can return while sibling packers still remove source directories; recovery must
not race them.

**How to apply:** Bound job concurrency and per-job compression threads together,
stop admitting queued jobs after failure, and retain independent per-capsule
integrity checks. Do not infer whole-publish speedup from bundling-only timings.

For deployment optimization, the user explicitly means “through both builds and
start scripts essentially from the publish button press to it going live.”

**Why:** The user corrected a pass that addressed only a narrow set of build
operations rather than the full publishing-to-readiness path.

**How to apply:** Cover publishing and legacy build entrypoints, payload
preparation, restoration, startup and actual application readiness. Keep
platform-controlled stage timings separate from repository-controlled work,
and do not treat liveness or a local fixture as proof that publishing succeeded.