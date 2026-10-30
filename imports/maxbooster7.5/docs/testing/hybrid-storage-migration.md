# Hybrid file metadata and byte storage

Hybrid file ownership is stored per file in PostgreSQL. Each request reads the
current SQL rows; no worker overwrites a process-cached ownership index. New byte
objects use immutable `hybrid:v2:<uuid>` manifests and file-private chunk keys in
PDIM. They retain the existing adaptive lossless codec mesh and PDCF container,
with 32 MiB input chunks. A manifest is published after its chunks, and committed
bytes are decoded and checked before a successful upload receipt.

Identical completed new-format files can share an immutable blob. SQL admission
and deletion take the same content lock, preserving references during concurrent
uploads and final deletion. Every logical file keeps its own owner and access
controls. New-format sharing never relies on an unverified legacy byte receipt.
Analytics describe the selected SQL catalog and its referenced compressed blobs;
they do not measure the provider's total physical allocation or all codec-level
deduplication outside this service.

## Deployment order

1. Back up the PostgreSQL database and the PDIM byte authority. A PDIM-only
   snapshot does not contain the new SQL ownership catalog.
2. Drain all older application writers. Mixed deployment with the old whole-index
   writer is unsupported; a one-time import cannot capture later old writes.
3. Apply `migrations/0097_hybrid_storage_metadata.sql` with the reviewed migration
   process, after any earlier required migrations. The migration adds tables and
   indexes without deleting or modifying existing PDIM objects.
4. Start the updated application against the intended shared database and PDIM
   authority. First initialization serializes the legacy import using a SQL
   advisory lock. It validates all ownership entries and references in
   `hybrid:storage:index`, inserts them in one transaction, and writes a persistent
   import marker. An unavailable or malformed source aborts initialization.
5. Check owned upload, list, download, delete and restart readback against the
   actual deployment. Repeat through two application instances using the same
   authorities. The tests below do not establish that Replit instances currently
   share the same PDIM data.

The legacy index and bytes remain intact. Legacy deduplication aliases retain
their original physical key when the primary logical record is deleted. Restart
does not re-import a deleted legacy record once the SQL marker exists. Do not
delete the marker or truncate the new catalog as a rollback procedure: that could
resurrect old records or make new objects inaccessible. Roll back code and data
only through a coordinated restore of both authorities.

## Interrupted operations

Uploads first retain an invisible SQL `uploading` intent, then commit and verify
bytes, then publish an `active` row. Errors propagate to the caller. An ambiguous
publication error does not trigger speculative byte deletion. An operator can
inspect pending rows using the database's approved access tooling. With the
matching owner and key, `HybridStorageService.recoverPendingUpload(owner, key)`
reads and checks existing bytes before obtaining a storage receipt and activating
the row. Missing or corrupt bytes keep recovery unsuccessful; nothing is inferred
from the intent alone. There is no public recovery endpoint.

Incomplete writes that never published a manifest retain the intent and may
retain file-private chunks. They require an explicit reconciliation using that
intent and namespace; automatic orphan sweeping is deliberately absent because
it cannot prove that an ambiguous writer has stopped. Drain writers before
performing this operation. Neither this change nor the test suite deletes unknown
or unpublished production objects.

Deletion persists a `deleting` intent before removing the final blob. Failed byte
deletion propagates and retains the manifest/intent so the same owned DELETE can
retry, including from another worker. Shared references retain the bytes.

## Reproducible checks

Run with Node 22, installed repository dependencies and PostgreSQL tools on PATH:

```sh
env -i PATH="$PATH" HOME=/tmp LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" node --test tests/hybrid-storage-postgres.test.mjs
npx vitest run tests/unit/hybrid-storage-index-recovery.test.ts
node --test tests/fabric-schema-generation.test.mjs
```

`hybrid-storage-postgres.test.mjs` starts a private disposable PostgreSQL server
using only a Unix socket and applies the real additive migration twice. Eight
leaf cases exercise independent service/immutable-adapter instances, real
compression and decoding, concurrent same-name uploads, fresh listings, atomic
access increments, tenant denial, public access, shared blob deletion races,
corruption rejection, failed SQL publication and explicit recovery, retryable
physical deletion, retained legacy aliases, and import rejection. Its PDIM command
boundary is controlled in-memory storage; it does not contact a configured
database or a remote storage provider.

`hybrid-storage-index-recovery.test.ts` isolates seven legacy parsing and retry
contracts with a controlled repository boundary. It is not SQL concurrency proof.
`fabric-schema-generation.test.mjs` checks that actual Drizzle generation emits
nonempty SQL rather than merely exiting zero; the new catalog declarations are
included in that generation.

Launch still requires actual coordinated migration, recovery of both stores, and
verified shared PDIM authority across deployment instances. Passing these checks
does not establish those operational facts.
