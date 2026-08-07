---
name: EC shard ids must not be pure content hashes
description: Why erasure-coded shard chunk ids in the storage fabric are suffixed with their shard index
---

# Erasure-coded shard identity in the Pocket Dimension fabric

**Rule:** An erasure-coded shard's chunk id must be unique per shard *index*
(e.g. `sha256(shard).<i>`), never the bare content hash. The on-node store key,
the chunk-index row id, `object.chunkIds`, and `manifest.erasure.shards[].chunkId`
must all use this same per-index id so retrieval, deletion, and accounting agree.

**Why:** With a low data-shard count (especially `k=1`, which the fabric's
`recommendedPolicy`/`effectivePolicy` produces for a 3-node cluster as RS 1+2),
Reed–Solomon parity shards can be byte-identical to the data shard. Distinct
shards are deliberately placed on *distinct* nodes. If the chunk id is the pure
content hash, two shards collide on one id: the global chunk-index location row
(keyed by id) gets clobbered by the second write — losing the first node's
location — and the per-node `usedBytes` increment on that lost node is never
matched by a decrement on delete. Result: a one-shard-per-write usage **leak**
that grows unbounded while the chunk index (the source of truth) stays correct.

**How to apply:** Any time shards/replicas of the same logical object can share
content but must live on separate nodes, give each placement its own index-keyed
id. The replicated path is fine as-is because it stores ONE location row with a
multi-node `nodeIds` array; only EC (one row per shard) needs the suffix.

**Defensive companion:** per-node `usedBytes` is a cache. Treat the chunk index
as authoritative and reconcile node counters from it (sum `sizeBytes` per node in
`nodeIds`) on boot. Verify accounting with: `sum(node.usedBytes) == /capacity
storedBytes`.
