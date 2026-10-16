# PDIM bucket migration — partial implementation, not activated

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
