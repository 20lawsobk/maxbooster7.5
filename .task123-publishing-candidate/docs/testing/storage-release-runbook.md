# Storage and job migration release sequence

This is a prepared operator procedure, not a record of a production migration.
The October26 read-only Neon check found no fabric deletion journals or
`fabric_chunks.ref_count`. Current-source fixtures test generated schemas; they
do not prove the existing Neon database has been migrated.

## Before the maintenance window

1. Identify the deployed release and the intended replacement's source-input
   digest, prepared-release identity and migration file hashes. Retain the
   previous payload for recovery; an old payload may become write-incompatible.
2. Verify the actual ReservedVM/Neon/PDIM identities without printing secrets.
   Use the existing authenticated PostgreSQL connection environment; do not put
   connection URLs or passwords in committed command files or reports.
3. Rehearse all four ordered migrations against an isolated copy with synthetic
   shared chunks, repeated chunks, pending deletion receipts, delta versions,
   legacy aliases, pending uploads, processing media jobs and interrupted
   replica migrations. Assert retained
   bytes, reference counts, owner separation and interrupted-worker behavior.
4. Arrange a recoverable PostgreSQL backup or Neon recovery point and a matching
   PDIM export. Retain manifests, hashes and their common consistency boundary
   outside the affected instance. A PostgreSQL dump stored only inside the same
   PDIM instance is not an independent disaster-recovery copy.
5. Restore both into a disposable target and verify readable file bytes plus
   owner metadata. PDIM-only legacy recovery tests explicitly do not recover
   newSQL ownership metadata; see [legacy recovery](legacy-pdim-recovery.md).
   Record measured recovery time; do not infer it from a configuredRTO.

## Writer drain and consistency boundary

Stop new upload/delete/tiering/job admission. Stop background workers and old
Node/MaxCore processes that can mutate the affected storage. Wait for admitted
work to finish or record its durable interruption; confirm the old writers are
gone. Maintain the outage or read-only boundary throughout backup, migration
and validation. An advisory lock used by new code cannot stop old code that
never takes that lock.

Take the final coordinated database/blob recovery point after the drain. Record
only non-sensitive identifiers, hashes, counts and timestamps in the release
receipt; retain actual backup payloads in the configured private backup store.

## Apply the ordered reviewed DDL

The following commands assume the operator's approved PostgreSQL environment
already selects the correct database. They are not commands for use against an
arbitrary database from this checkout.
`psql` uses `PGHOST`, `PGDATABASE`, `PGUSER` and the approved authentication
binding, or a configured `PGSERVICE`; it does not automatically consume the
application's `DATABASE_URL` or `NEON_DATABASE_URL`. Confirm the target first.

```sh
psql -X --set=ON_ERROR_STOP=1 --file=migrations/0096_fabric_deletion_journals.sql
psql -X --single-transaction --set=ON_ERROR_STOP=1 --file=migrations/0097_hybrid_storage_metadata.sql
psql -X --set=ON_ERROR_STOP=1 --file=migrations/0098_social_media_jobs.sql
psql -X --set=ON_ERROR_STOP=1 --file=migrations/0099_fabric_migration_journal.sql
```

`0096`, `0098` and `0099` contain their own transactions; `0097` is wrapped by the client.
Stop on any error. Do not substitute `db:push:force`, suppressSQL failures or
claim success because a schema-generation process returned zero.

- `0096` adds deletion journals, physical replica keys, dependency records,
  the committed catalog-generation fence and reference counts. The backfill
  counts object references plus pending deletion claims. Existing objects remain
  conservatively `dependencies_indexed=false` until verified header indexing.
- `0097` adds independent hybrid file rows and the one-time import marker. The
  compatible application imports the complete validated legacy index in one
  transaction; it retains that original source. Never run old whole-index writers
  concurrently with this import or restore its source as a replacement for new
  per-fileSQL rows.
- `0098` adds durable social video-job records. Existing process-local jobs do
  not magically acquire rows: drain/interrupt them before replacing workers.
  New job completion is fenced by owner/family/token and an unexpired lease.
- `0099` adds durable replica-migration intents. The target's capacity is
  reserved before physical copying; both keys remain recoverable until verified
  publication and acknowledged source cleanup. The source's capacity debit and
  cleanup receipt commit together. A failed copy or deletion must retain its
  journal and conservative accounting for restart/retry.
  Immutable replica deletion also retains a permanent per-key PDIM tombstone,
  preventing a delayed stale write from recreating a retired key. These markers
  have no TTL; clearing them reopens the stale-writer race. Include their
  metadata and actual disk cost in coordinated recovery and capacity checks.

## Validate before reopening traffic

Check actual table/column/index existence and types, the catalog fence row,
reference-count agreement and missing chunk references. Verify that delta
dependencies cannot lose a referenced base. Unknown legacy dependencies must
retain their conservative409 behavior; do not change the indexing flag merely
to make deletion succeed.

Start only the compatible release, initially without external side effects.
Verify legacy import succeeds once, reports its expected count, and never
resurrects a deleted row on restart. Use owned canaries to upload, read/decode,
list from another worker, delete, retry interrupted deletion and verify another
owner cannot read private bytes. Do not use a real customer's files as canaries.

Create and poll both media job families across different workers. Verify durable
success and an interrupted lease, including rejection of a late terminal write.
Confirm real rendered asset delivery; a persisted URL alone is insufficient.

Exercise a controlled replica move and interrupt its target write, publication
and source deletion in the rehearsal. Restart the compatible controller and
verify the same durable intent resumes, bytes remain readable and capacity
changes occur exactly once. Check that unavailable journal schema fails the
read-only prelaunch schema gate before admission is restored.

Then check aggregate readiness and the separate public-awareness readiness
endpoint. Record expected unavailable generation modes explicitly. Restore
background work and admission gradually only after the required gates pass.
Observe errors, queue depth, database connections, storage receipts and latency.

## Recovery and rollback restrictions

Before new writes, a failed rehearsal can be abandoned and the drained system
restored from its verified consistency point. After new writes, do not launch
old binaries that ignore the new journals, epochs, per-fileSQL metadata or job
leases. Prefer a compatible forward fix. If a full rollback is necessary, stop
writers again and restore the coordinated database **and** blob recovery point,
accounting explicitly for all writes after that point. Do not drop journals or
dependency evidence as a rollback shortcut.

The final release receipt must contain: approved target identity, source/release
digests, migration hashes and exits, backup/restore evidence, drain/start times,
canary outcomes, actual health/readiness, rollback compatibility and the person
or automation responsible for restoring admission. No review signature is
required for public-awareness content by this procedure.
