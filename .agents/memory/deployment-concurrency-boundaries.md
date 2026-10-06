---
name: Deployment concurrency boundaries
description: Resource limits and failure draining for destructive build phases
---

The historical publishing scaffold should use bounded, fast compression,
not maximum compression with automatic host-wide threading. Preserve compressor
stderr and finish a staged archive before replacing its previous generation.

**Why:** A publish stopped at compression of a 640 MB dependency tree, with no
diagnostic because tar stderr was discarded. A subsequent bounded-xz build
passed that step but stopped packing the 1.8 GB Python runtime. Neither log
established OOM or a documented platform timeout. Full-size gzip-1 packing and
restoration succeeded in disposable storage, with identical restored content.
Favor publishing speed over minimum archive size; tiny fixtures alone do not
validate compression choices for these runtime trees.

**How to apply:** Keep this tradeoff when tuning publishing time; verify actual
pack/restore and codec gates together in disposable fixtures.

A last log saying “Packing” does not establish that compression itself failed:
the same step can still be hashing the archive or deleting its source tree.

**Why:** Published logs stopped at that label while the same full-size archive
packed successfully in isolation. Guessing the failing subphase led to repeated
compression tuning without identifying the remaining failure.

**How to apply:** Log phase boundaries and progress, preserve stderr and failure
statuses, and never claim an OOM or timeout without supporting evidence.

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