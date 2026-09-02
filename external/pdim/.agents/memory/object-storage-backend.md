---
name: Replit Object Storage chunk backend (fabric)
description: Gotchas wiring the PDIM storage fabric onto @replit/object-storage, and migrating a live cluster off local-disk pocket-dimension backends.
---

# @replit/object-storage downloadAsBytes returns an ARRAY

`client.downloadAsBytes(key)` resolves to `Result<[Buffer]>` — `value` is a
**single-element array** `[Buffer]`, NOT a bare `Uint8Array`. Always unwrap
`value[0]`.

**Why:** `Buffer.from(result.value)` on the array coerces the inner Buffer to
`NaN`→`0` and silently returns a **1-byte** buffer. With erasure coding this
makes every object read back as exactly `k` bytes (one per data shard) — a
silent, total read corruption that typechecks fine and only shows up in a
byte-exact round-trip. `uploadFromBytes(key, buf)` takes a raw Buffer and is
fine, so writes look healthy while all reads are garbage.
**How to apply:** any new code path calling `downloadAsBytes` must destructure
`const [bytes] = result.value`. Verify storage changes with a byte-exact
write→read `cmp`, never just an HTTP 200.

# Backend-type filters break after a cluster migration

Control-plane code that filters nodes by `backendType === "pocket-dimension"`
(e.g. the autoscaler's health/utilization/spawn math) silently breaks once the
cluster is migrated to `replit-object-storage`: it sees 0 healthy nodes and
loops on `below_min_nodes`, spawning spurious replacements forever.
**Why:** the migration flips every node's `backendType`, so a single-backend
filter matches nothing.
**How to apply:** treat all active storage backends together
(`pocket-dimension` OR `replit-object-storage`) anywhere the fabric reasons
about "how many nodes do I have". Grep for `backendType ===` before/after any
backend migration.

# No-data-loss migration pattern (flip-first + reconcile)

The cluster→Object-Storage migration is a **reconcile over ALL nodes**, not a
one-shot over not-yet-migrated nodes:
- Flip routing FIRST (cache + nodeBackendMap + DB) so writes mid-copy land in
  the new store, THEN copy chunks.
- Source is rebuilt as `new PocketDimensionChunkStore(namespace)` where the OS
  `namespace` is set equal to the old pocketName — the on-disk pocket is **never
  deleted**, so a resumed run can always re-read it.
- Idempotent via `osStore.hasChunk`; iterating already-flipped nodes too is what
  recovers an interrupted run that flipped a node but never finished uploading
  its chunks (otherwise those chunks are stranded on disk while the node claims
  to be OS-backed).
- Run it as a background job (`startClusterMigration` + a status endpoint), not a
  blocking HTTP request — the copy far exceeds the ~60s request timeout; a
  blocking call gets severed while the work continues unobserved, and naive
  retries double-run.

**Orphan chunks are not data loss:** migration "Entry not found in pocket
dimension" errors mean the chunk was already absent from local disk (dangling
index ref). The fabric's own startup GC ("GC'd N orphan chunks") and scrubber
("UNRECOVERABLE: 0/N shards") surface these pre-existing dangling refs; they are
not caused by the migration. Verify by checking the file is absent under
`artifacts/api-server/pocket-dimensions/`.
