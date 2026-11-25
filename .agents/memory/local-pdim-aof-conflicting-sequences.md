---
name: Conflicting PDIM AOF sequences
description: Safe recovery rules when local PDIM journal frames assign different mutations to one sequence.
---

When valid, checksummed journal frames assign different mutations to the same sequence, the journal alone cannot identify which mutation is authoritative. Selecting one can lose a write or resurrect deleted state; replaying or renumbering both can invent an order.

For valid frames at or below the embedded snapshot watermark, verify their checksums and ignore them as already covered, even when they are interleaved after newer frames. Deduplicate identical post-watermark sequence records; fail closed on conflicting duplicates or gaps in the post-watermark sequence. One exclusive owner must hold a lease across snapshot loading, recovery, writes, compaction, and shutdown.

**Why:** A real restart found old checksum-valid records interleaved with newer AOF frames, and a failed workflow restart left an orphaned app process alongside the replacement. Filtering only after validation recovered the snapshot-covered frames; fencing the replacement writer and removing the orphan prevented overlapping local owners.

**How to apply:** Preserve the snapshot and journal unchanged until checksums, the snapshot watermark, duplicate content, and post-watermark continuity are validated. Seek an authoritative snapshot or independent acknowledgement/owner evidence for any unresolved post-watermark conflict, and obtain explicit approval before restoring or resetting state. Check process-group and lock ownership whenever Replit leaves a prior app process after restart.

## Cold-start and dead-owner recovery

Create and durably sync the AOF parent directory before attempting the sibling lock. After a process is killed without cleanup, keep the existing stale/heartbeat interval and retry only through that full interval; never delete a lock or shorten its stale window just to accelerate startup.

**Why:** A clean local PDIM test first exposed a missing `data/` parent, then an `ELOCKED` lease left by SIGKILL. The safe recovery preserved all 256 acknowledged writes but waited about 60 seconds for the configured stale lease.

**How to apply:** Include fresh-directory startup and forced-kill/restart tests in AOF changes. Treat the stale-window delay as an availability tradeoff; any faster takeover requires a separately verified owner-liveness/fencing design.

## Workspace and deployment namespace isolation

The development preview and published runtime can address the same private App Storage bucket, so they must use distinct PDIM namespaces and distinct local journal paths. A new namespace is not created by normal startup: confirm its `HEAD` is absent, then initialize it through the explicit offline migration from a new empty development journal. Never migrate the existing shared journal into preview merely to acquire a lease, and never force-take an active owner's namespace.

**Why:** A preview start collided with a live namespace owner. The existing local journal was not a safe preview seed, and the journal protocol correctly refuses to acquire a missing namespace until an operator initializes it.

**How to apply:** Before starting a second PDIM runtime, separate bucket prefixes and local AOF files, preserve the existing namespace and journal, initialize only the isolated development prefix, and confirm the development workflow can hold its lease while all configured ports pass readiness.