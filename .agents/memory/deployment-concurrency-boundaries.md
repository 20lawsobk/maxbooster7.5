---
name: Deployment concurrency boundaries
description: Resource limits and failure draining for destructive build phases
---

The historical publishing scaffold should use bounded compression evaluated
against total shipped image size, build time, and restore time together,
not maximum compression with automatic host-wide threading. Preserve compressor
stderr and finish a staged archive before replacing its previous generation.

**Why:** A publish stopped at compression of a 640 MB dependency tree, with no
diagnostic because tar stderr was discarded. A subsequent bounded-xz build
passed that step but stopped packing the 1.8 GB Python runtime. Neither log
established OOM or a documented platform timeout. Full-size gzip-1 packing and
restoration succeeded in disposable storage, with identical restored content.
The user subsequently corrected the speed-first tradeoff: increases accumulate
across capsules, especially the MaxCore server exceeding a GB before compression.
Do not treat faster packing alone as success or justify a blanket low-compression
default from one smaller capsule. Tiny fixtures alone do not validate compression
choices for these runtime trees.

**How to apply:** Compare aggregate payload sizes and full-size pack/restore
timings before choosing compression settings. Preserve pack → remove from image
→ restore and verify codec gates together in disposable fixtures.

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

An `[executive] FAILED: Executive interrupted` log means the coordinator
received an interrupt; it does not identify the initiator or prove that an
individual task deadline expired. A closed pipe while Replit copies a generated
media file is likewise an image-layer upload failure, not evidence that capsule
compression failed.

**Why:** Historical publish records ended with these messages at different
stages, without a code-level cause. Misclassifying either as a compressor bug
leads to changes that cannot prevent the observed failure.

**How to apply:** Compare task progress and signal records with the platform's
build record. Treat Replit image-layer and container interruptions as external
until project-side evidence proves otherwise; preserve generated media while
investigating which snapshot path includes it.

A completed capsule verification can still leave its CLI hung on idle worker
threads. Distinguish the eventual interrupt from the project-side hang that
preceded it.

**Why:** A later publish verified every file and printed its final capsule ID,
but never returned to the shell. A standalone reproduction printed success and
remained alive on compression workers. Tiny-file benchmarks did not start that
pool, and ordinary test-runner completion did not prove natural process exit.

**How to apply:** Test compression and verification in a separate process that
must exit naturally, including the worker-backed path. Idle workers must not
retain the process; dispatched work must retain it until completion. Do not
force a successful process exit or weaken capsule integrity checks.

For deployment optimization, the user explicitly means “through both builds and
start scripts essentially from the publish button press to it going live.”

**Why:** The user corrected a pass that addressed only a narrow set of build
operations rather than the full publishing-to-readiness path.

**How to apply:** Cover publishing and legacy build entrypoints, payload
preparation, restoration, startup and actual application readiness. Keep
platform-controlled stage timings separate from repository-controlled work,
and do not treat liveness or a local fixture as proof that publishing succeeded.

The user authorized parallel cache cleanup and consideration of broader
publishing parallelism after the initial silent purge appeared stuck.

**Why:** Large agent/cache trees can consume minutes before compression starts.
Removing the purge would increase image size rather than resolve that work.

**How to apply:** Keep cleanup bounded and observable; overlap disjoint targets,
surface failures, stop queued work on failure and drain active deletions before
returning. Never benchmark destructive cleanup in the working checkout.

The user explicitly requested a proactive adapting task executive instead of
the sequence-based model, to transition smoothly without indefinite waits.

**Why:** Quiet, unbounded individual stages made publishing appear permanently
stuck. This authorization supersedes keeping the fixed historical step order,
but not the requirement to retain pack/remove/restore.

**How to apply:** Preserve dependency barriers and dynamic resource admission,
report waits, enforce task/overall deadlines, and never advance past a failed
prerequisite. Local safety budgets must not be represented as platform limits.