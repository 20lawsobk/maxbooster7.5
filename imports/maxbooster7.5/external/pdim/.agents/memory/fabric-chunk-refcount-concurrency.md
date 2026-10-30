---
name: Fabric chunk refcount & concurrency model
description: How the PocketDimension fabric safely dedupes + GCs content-addressed chunks under concurrency
---

# Fabric chunk reference counting & concurrency

Chunks are content-addressed and deduped **globally** (one chunk row may be shared by many
objects across different volumes/owners). Safe lifecycle requires three layers working together —
removing any one reintroduces data loss or accounting skew.

## The rules

1. **Global refcount, not per-volume.** `fabric_chunks.ref_count` tracks live object references.
   `putChunkLocation` increments on conflict (dedup hit); a chunk's physical bytes are freed
   (and node usedBytes decremented) **only** when refCount hits 0.
   **Why:** a per-volume "stillReferenced" scan deletes a chunk another volume still shares →
   cross-volume dedup delete = data loss.

2. **Object delete must be claim-first.** `ObjectIndex.deleteObject` does `DELETE ... RETURNING`;
   only the caller that gets the row back releases its chunk refs.
   **Why:** read-then-delete lets two concurrent deletes of the same object both release the same
   chunk refs → double-decrement → premature chunk deletion.

3. **releaseChunk decrement + removal must be one transaction with a conditional delete.**
   `UPDATE ref_count-1 RETURNING` then `DELETE WHERE id=? AND ref_count<=0` inside `db.transaction`.
   **Why:** between a bare decrement and an unconditional delete, a concurrent `putChunkLocation`
   (refCount+1, reviving the chunk) can sneak in; the unconditional delete then drops a live row.
   The row lock from the UPDATE (held to commit) + the `ref_count<=0` guard close this.

4. **Physical delete vs dedup store must be serialized per chunkId.** The fabric is a **single
   process** (singleton `fabricStorage`; Lua worker threads don't touch the chunk store), so a
   per-chunkId in-process async mutex (`withChunkLock`) wraps both the store path
   `(hasChunk→putChunk→addUsedBytes→putChunkLocation)` and the delete path
   `(releaseChunk→store.deleteChunk→addUsedBytes-)`.
   **Why:** `store.deleteChunk` runs outside the DB tx. Without the lock, a deleter can physically
   delete a shard right after a concurrent store skipped the write (hasChunk=true) and inserted a
   fresh index row → live row pointing at missing bytes. The lock is only correct under the
   single-process model — centralize fabric writes before enabling multi-process/cluster writes.

## Boot healing order
`reconcileRefCounts()` (rebuild counts from live objects, GC orphan rows + physical bytes, migrate
pre-refCount rows) **before** `reconcileNodeUsage()` (derive per-node usedBytes from surviving
chunk rows). Runs before `app.listen`, so no concurrency there.

**How to apply:** any change to chunk store/delete/dedup paths must preserve all four layers and the
boot order. Verify with the concurrent delete-vs-reput regression (last-ref delete racing a dedup
re-put of identical content): GET must stay byte-identical and `sum(node.usedBytes)==storedBytes`.
