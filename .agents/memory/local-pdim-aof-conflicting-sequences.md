---
name: Conflicting PDIM AOF sequences
description: Safe recovery rules when local PDIM journal frames assign different mutations to one sequence.
---

When valid, checksummed journal frames assign different mutations to the same sequence, the journal alone cannot identify which mutation is authoritative. Selecting one can lose a write or resurrect deleted state; replaying or renumbering both can invent an order.

For valid frames at or below the embedded snapshot watermark, verify their checksums and ignore them as already covered, even when they are interleaved after newer frames. Deduplicate identical post-watermark sequence records; fail closed on conflicting duplicates or gaps in the post-watermark sequence. One exclusive owner must hold a lease across snapshot loading, recovery, writes, compaction, and shutdown.

**Why:** A real restart found old checksum-valid records interleaved with newer AOF frames, and a failed workflow restart left an orphaned app process alongside the replacement. Filtering only after validation recovered the snapshot-covered frames; fencing the replacement writer and removing the orphan prevented overlapping local owners.

**How to apply:** Preserve the snapshot and journal unchanged until checksums, the snapshot watermark, duplicate content, and post-watermark continuity are validated. Seek an authoritative snapshot or independent acknowledgement/owner evidence for any unresolved post-watermark conflict, and obtain explicit approval before restoring or resetting state. Check process-group and lock ownership whenever Replit leaves a prior app process after restart.