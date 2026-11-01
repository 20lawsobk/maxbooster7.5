# Storage deletion, local PDF rendering and archived diagnostics

Run these checks from the repository root with Node 22+, installed workspace
dependencies and the disposable PostgreSQL server tools on `PATH`:

```sh
node --import tsx scripts/test-fabric-deletion.mjs
node --import tsx --test tests/fabric-deletion-postgres.test.mjs tests/replit-chunk-delete.test.mjs
node --import tsx --test tests/fabric-root-storage-postgres.test.mjs tests/pocket-durable-delete.test.mjs
node --import tsx --test tests/fabric-imported-reconcile-postgres.test.mjs tests/fabric-replica-generation.test.mjs tests/fabric-object-lineage.test.mjs
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx --test tests/patent-pdf-runtime.test.mjs
```

The master discovers these Node scripts. For the same clean environment and
retained per-file evidence, use `scripts/testing/run-node-suites.py --file PATH`
with a separate `--output` directory.

## Durable fabric deletion

The active root application uses `server/pocket-dimension/fabric` through
`server/index.ts` and the fabric routes. The imported PDIM service has its own
composition. Both now use the same database-independent outbox implementation;
each supplies its actual database and SQL tag, avoiding cross-version Drizzle
objects. The root migration `0096_fabric_deletion_journals.sql` adds reference
counts and reconstructs them from live objects plus unreleased deletion work.
Apply this additive migration as part of the normal database release process;
`db:push` alone does not reconstruct existing shared-reference counts. The SQL
fixture applies it twice to verify safe replay.

Drain every old writer/controller before applying migration `0096` and starting
the new version. Old binaries do not participate in generation checks or replica
keys. The migration also adds the catalog-generation record, dependency index
and physical-replica metadata. A missing migration blocks serving storage.
No production DDL was executed during verification.

Root object/chunk publication is transactional. New physical writes have pending
receipts before I/O, with per-node accounting markers. Publishing the object and
its references removes those receipts in the same commit. Failed publication
or partial node writes wait for in-flight operations, reclaim confirmed writes,
and retain failed cleanup for later retry. Root mutations and reads share one
catalog fence; this prioritizes correctness for the current shared local-pocket
composition. Throughput at broader concurrency remains a separate capacity test.

Root publication, journal and accounting transactions verify their committed
generation while row-locking it through commit. A successor allocates its
generation before cleanup; an old owner cannot commit afterward, including when
PostgreSQL terminates its advisory-lock backend. Physical replica keys are unique
per placement. New replicas use immutable canonical PDIM keys; old unsuffixed
replicas retain their legacy pocket read path. Late physical work cannot modify
a successor's replica or overwrite its whole legacy pocket index.

Delta dependencies publish atomically with their child. Deleting a base with
live dependents returns `409`; delete dependents first. Existing objects stay
`dependencies_indexed=false` until actual container headers are verified.
Deletion conservatively refuses potential bases while unknown legacy dependents
exist. Changing that flag without header verification is not a valid backfill.
This remains an explicit legacy migration boundary.

Imported PDIM holds the same catalog fence through complete object publication
and startup reconciliation. Reconciliation retains unknown chunks and never
lowers counts just because an object snapshot lacks them. Explicit deletion
receipts still release known references. Retained unknown references require
proved ownership before reclamation. Imported multi-owner failover and global
capacity remain separate deployment gates.

`DeletionOutbox` atomically removes a live object and records each chunk release
in PostgreSQL. Reference release and its retained physical location commit
together. Each successful node removal commits its accounting update and receipt
in the same transaction. An offline node leaves its receipt and byte usage
uncredited; retries do not release the reference or debit successful nodes again.
Physical store deletion must be idempotent. Replit storage explicitly requests
`ignoreNotFound` and rejects SDK error results before crediting deletion.

The additive journal tables are declared in the imported Drizzle schema and
bootstrapped with serialized `CREATE TABLE/INDEX IF NOT EXISTS`. The configured
database role must permit these additive objects on an existing installation.
Never drop the journals to clear an error: restore the affected node/database
access and let startup, a repeated delete, or the 30-second drain retry finish it.
Reference/usage reconciliation waits for pending deletion work at startup.

Chunk writes, repairs and deletion use the same PostgreSQL transaction advisory fence in
addition to the existing in-process lock. A separate two-connection lock pool
avoids consuming the query pool while protected operations use it. Lock waits
have a 30-second deadline. Explicit transactions keep Neon/PgBouncer connections
pinned; session advisory locks would not provide that guarantee. Provision database connections for both pools when
scaling workers; the bounded fixture is not a remote-storage outage/soak claim.

The original D5 test checks journal transitions against controlled SQL responses.
The new PostgreSQL test exercises actual transactions, concurrent claims/drains,
shared references, an offline node, resumed deletion, a failed claim insert, a
failed accounting commit after physical I/O, and exclusion behind a concurrent
chunk fence. Replit adapter tests verify the SDK boundary without remote writes.
The original 54-scenario PDIM HTTP/load suite additionally checks the integrated
service on its own temporary database and fabric.

The root SQL fixture executes the real compression, object index, chunk index,
registry and storage service against disposable PostgreSQL and controlled node
transports. It verifies cross-volume deduplication, surviving-owner readback,
offline-node recovery, metadata rollback, partial-write compensation, a terminated
catalog backend followed by successor publication, readable retry acknowledgements
and delta-base retention. The imported fixture pauses a writer before publication,
proves another worker waits, and verifies that unknown chunks survive reconciliation.
The underlying pocket deletion tests separately verify persisted index updates,
shared backing chunks and retry receipts after a failed physical reclamation.
Fabric node adapters refresh their cached pocket state while holding the shared
catalog fence. Versioned pockets retain their historical bytes; unversioned
fabric pockets reclaim only chunks unreferenced by surviving entries.

## Local patent PDF

The production generator serves the selected HTML directory on an owned,
randomly named loopback HTTP path while Chromium renders it. It closes the
listener and browser on success or failure. Asset paths stay inside that
directory, including resolved symlinks; unrelated paths are unavailable.
No browser-policy override is used. The regression verifies PDF bytes, Letter
dimensions, special characters in the HTML filename and missing-source failure.

## Historical measurement verifiers

```sh
python3 evaluations/maxcore-quality/verify_evidence.py
python3 evaluations/maxcore-quality/verify_types.py
python3 -m pytest -q tests/testing/test_archived_quality_verifiers.py
```

These commands validate retained diagnostic integrity, including the historical
assessment of **0/20 passing samples**. Passing integrity does not mean those
outputs were good or that current inference is ready. The text verifier owns
the five frozen-text/GPU/awareness archive formats; later media and local-stack
report directories are separate schemas rather than missing `results.json`.

The type verifier validates its original two completed measurement runs and all
referenced media hashes. Two additional comparisons are explicit:

```sh
python3 evaluations/maxcore-quality/verify_types.py --include-later-archives
python3 evaluations/maxcore-quality/verify_types.py --check-current-checkpoint
```

The first correctly fails on the interrupted retained
`2026-09-24-post-fix/campaign/result.json`, which remains `running` without final
checkpoint identity. The second requires the actual old checkpoint bytes and
fails if they are absent or differ. Neither missing evidence can be reconstructed
by changing a status or inventing hashes. Current serving quality needs fresh
current-system acceptance evidence, independently of these archived utilities.
