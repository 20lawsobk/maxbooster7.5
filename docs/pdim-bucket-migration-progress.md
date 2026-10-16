# PDIM bucket migration — preview cutover verified; broader acceptance open

## Current evidence — 2026-10-16

- Archived and generation-pinned/checksum-verified **26** retained staging
  snapshots (**17,610,628,936 bytes**), then removed only the matched local
  staging copies with user approval. Original active snapshot/journals remain.
- Imported **63,927 entries**, Redis sequence **47414**, capsule sequence
  **41859**, into the existing private bucket. Full entry-by-entry readback
  matched before publishing the initial HEAD. The first importer exhausted a
  4 GB heap; lazy serialization and chunk-at-a-time verification fixed that
  demonstrated allocation problem. The second importer exited **0**.
- Development configuration explicitly selects App Storage and a separate
  preview namespace. No production namespace or deployment was changed.
- Preview startup recovered the bucket data. Observed **450 committed
  transactions**, checkpoint **279**, and unchanged original local snapshot/AOF
  files. After the scanner-associated process loss, startup recovered again and
  `/api/ready` returned **200**, status **ok**, awareness **ready**.
- Short workflow-start deadlines caused retries while the previous startup
  lease was still valid. A longer startup allowance succeeded. Chunk reads are
  bounded-parallel. Startup now waits once for an expiring lease; a renewed
  lease still prevents takeover. Ownership fencing is never bypassed.
- Recovery exports use a consistent captured view and unlinked temporary
  scratch, not a stale local snapshot. Shutdown no longer initiates another
  whole-store checkpoint; acknowledged journal commits are already durable.
- Actual isolated bucket HTTP smoke: write, export, shutdown, restart, read:
  **passed**, no local durable files used. Only its random fixture objects were
  removed. This is separate from the full preview readiness evidence.
- Latest focused migration/operator run: **27 tests passed**. Subsequent
  shutdown/lease-focused tests: **11 passed**. Build/start contract tests:
  **7 passed**. Deployment/runtime artifact gate tests: **18 passed**.
- Current server and client typechecks both exited **0** after the shutdown,
  lease and selective-icon changes. Targeted server/storage lint exited **0**.
  The actual production build passed with a 2 GB Node heap; both earlier
  attempts at a 1 GB heap failed in Vite. The build contract validator exited
  **0**. See `production-readiness-session-2026-10-16.md` for commands.
- Full security batch: dependency scan **0 critical, 0 high, 72 moderate**;
  static scan **incomplete**; privacy scanner **timed out**. An additional
  cgroup OOM kill and preview termination occurred during the batch. Do not
  repeat heavyweight parallel scans alongside the live model runtime.
- The server typecheck coincided with another kernel OOM kill, despite the
  soft Go memory limit. Preview was restarted after that check and again
  returned HTTP **200**, status **ok**, awareness **ready**. This is recovery
  evidence, not a claim that concurrent validation is safe.

## Remaining acceptance

- Verify the newest shutdown changes on the full app, not only isolated HTTP.
- Finish production-only dependency closure,
  disposable publishing/restore/start rehearsal and production readiness.
- Production storage cutover requires its own authoritative state and namespace;
  do not silently point a second live owner at the preview namespace.
- Broader platform blockers remain, including active LabelGrid references,
  checkpoint unknown-token generation failures, incomplete security coverage
  and unverified cross-system business flows. No whole-platform certification
  follows from the preview's health response.

The following sections preserve **earlier implementation evidence**, not the
current activation status. The current evidence above supersedes their pending
work and operational-state statements.

## Verified work

- Added `server/lib/pdimBucketJournal.ts`: immutable SHA-256-addressed objects,
  generation-conditional HEAD publication, ownership leases, exact-readback
  reconciliation of ambiguous writes, journal recovery, checkpoint ancestry.
- Added `server/lib/pdimBucketObjects.ts`: authenticated configured-bucket
  adapter with generation-pinned CRC-verified reads and conditional uploads.
- Added `server/lib/pdimBucketSnapshot.ts`: chunked snapshot serialization and
  recovery without a whole-store JSON string or local staging file.
- Added `scripts/recovery-private-store.d.mts`: declarations for the existing
  recovery helper; resolved the new adapter's TS7016 error without suppression.
- Added `tests/unit/pdim-bucket-journal.test.ts`.

Commands observed:

1. `node_modules/.bin/vitest run --config vitest.config.ts tests/unit/pdim-bucket-journal.test.ts`
   — initial run: 7 passed, 1 failed. The failed-renewal test found that an
   identical earlier HEAD could be mistaken for a successful retry. Each HEAD
   publication now carries a unique commit nonce.
   Final run: **10 passed**, exit 0.
2. `node_modules/.bin/eslint server/lib/pdimBucketJournal.ts server/lib/pdimBucketObjects.ts server/lib/pdimBucketSnapshot.ts tests/unit/pdim-bucket-journal.test.ts`
   — exit 0.
3. `timeout 150s env NODE_OPTIONS=--max-old-space-size=2048 node_modules/.bin/tsgo --noEmit --project tsconfig.server.json --incremental false`
   — initial TS7016 failure; after declarations, **exit 0**.
4. `node --test tests/recovery-private-store.test.mjs`
   — **6 passed**, no failures/skips. These are isolated fake-SDK tests, not
   evidence of live provider availability.
5. Real configured-bucket probe using the new adapter/journal and an isolated
   random `pdim-migration-tests/` namespace: initialize, acquire, three appends,
   release, acquire with a new instance, recover all three values. **Passed**.
   Commit times: 151, 160, 149 ms. Only that probe's objects were deleted afterward.
   No application records were uploaded, modified, or removed by this probe.

## Not completed

## Additional verified work

- Added the opt-in `scripts/archive-pdim-staging.mjs` archive/removal command.
  The user authorized local staging removal only after verified bucket readback.
  It never matches active snapshot/AOF names, refuses an extant writer PID,
  streams both upload and verification, checks local inode/size/timestamps, and
  persists/read-verifies the receipt before removing the local staging copy.
- `node --test tests/pdim-staging-archive.test.mjs`: **3 passed**. Includes
  archive-only, verified removal, corrupted-readback retention, and protection
  of the active snapshot. ESLint ignores these `.mjs` paths; its warnings are
  not a lint pass for those files.
- Added `pdimBucketCommandBatcher.ts` to amortize remote commits using the
  existing canonical transaction engine without acknowledging early or blocking
  producers behind blocking consumers.
- Added `pdimBucketRecovery.ts`: preserves interleaved capsule and Redis
  ordering through canonical recovery primitives, validating both original
  sequences before constructing transient replay records.
- Latest focused Vitest run: `tests/unit/pdim-bucket-recovery.test.ts`,
  `tests/unit/pdim-bucket-command-batcher.test.ts`, and
  `tests/unit/pdim-bucket-journal.test.ts`: **16 passed**. Targeted lint on the
  added batcher/recovery modules and tests passed.
- `timeout 90s node --import tsx tests/pdim-bucket-cloud-smoke.ts --confirm-isolated-bucket-writes`:
  **passed** against the actual configured bucket, including chunked snapshot
  recovery and capsule/Redis ordering through the real canonical RedisStore.
  No local data files were used. Only random isolated fixture objects were
  deleted afterward.
- After archive verification reclaimed over 4 GB, the preview was restarted.
  `/api/ready` subsequently returned **200**, `status: ok`, awareness ready.
  This is service recovery under the existing local backend, NOT live migration.

## Still not completed

The active `localPdimServer.ts` has NOT been connected to these modules.
No configuration has enabled bucket-backed live persistence. No account data
has been migrated. Passing module tests does not establish a completed migration.

Before cutover:

- Integrate durable Redis AOF and capsule commits, consistent snapshot capture,
  lease renewal, recovery, readiness and shutdown. Preserve global mutation
  ordering and do not acknowledge a write before bucket commitment.
- Address the measured per-commit latency through the existing canonical
  transaction-batching mechanism; do not introduce unsafe early acknowledgments.
- Verify actual canonical RedisStore/capsule recovery, TTLs, Lua/queues,
  concurrent operations and shutdown using isolated bucket namespaces.
- Import the quiesced current authoritative state, verify recovery, then
  explicitly switch the owner. Never initialize an empty store on a missing
  bucket HEAD. Preserve local originals until verified cutover.
- Distinguish namespaces/ownership across preview and production; do not silently
  let independent owners share one mutable bucket namespace.
- Keep backups/recovery APIs truthful: their current local-file snapshot API
  also needs adapting rather than continuing to claim a current disk snapshot.

## Current operational issue

The existing disk-backed path hit EDQUOT again after its earlier recovery.
The workflow subsequently reported FAILED. Logs establish quota-related PDIM
unavailability; they do not establish what terminated the whole workflow.
No tool call in this migration turn deliberately stopped it.

A metadata-only inventory found **26 retained `local-pdim-store.json.async-*`
files, totaling 17,610,628,936 bytes**. None was removed. Their differing sizes
do not establish that any can safely be discarded. Archiving must stream to the
private bucket and verify generation-pinned readback before any authorized local
removal. Do not classify an archive of these files as the live-store migration.
