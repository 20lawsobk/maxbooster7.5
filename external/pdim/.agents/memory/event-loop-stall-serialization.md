---
name: Event-loop stall prevention in PDIM persistence
description: Why big JSON.stringify / erasure coding must yield, and the torn-snapshot rule
---

# Big serialization must yield — and snapshots must detect tearing

The PDIM server froze for seconds (external Max Booster clients logged
`[PDIM] exec error [GET]: The operation was aborted due to timeout` — note this
string exists only in the *client* app, not this repo). Root causes were
synchronous heavy work on the main thread: whole-dataset `JSON.stringify` on
the 5 s snapshot timer, pretty-printed full chunk-index writes after every
chunk put, and Reed–Solomon GF(256) math over 4 MB shards.

**Why:** Node has no fork-based BGSAVE; a single stringify/encode of large data
blocks every in-flight HTTP request past its client timeout.

**How to apply:**
- Any persistence/encoding of unbounded data must serialize incrementally,
  yielding via `setImmediate` every few hundred items (or per parity row for RS).
- Incremental snapshots can tear: a write between yields makes the snapshot
  inconsistent with its AOF `baselineSeq`, and boot replay would double-apply
  non-idempotent ops (INCR/APPEND). Rule: every mutation path (AOF-tracked
  writes AND non-AOF ones like LRU eviction) must flag `snapshotTorn` when a
  snapshot is in flight; the persister then falls back to one atomic
  synchronous serialization.
- Lazy TTL-expiry deletes are safe to tear (an expired entry re-expires on load).
- Pocket index tearing is self-healing only because mutators call `flush()`,
  which sets `flushDirty` and triggers a coalesced trailing persist.
