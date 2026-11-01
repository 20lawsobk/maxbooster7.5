# Development PDIM preflight and production operator workflow

**Result: PREDEPLOYMENT ACCEPTANCE PASS**
**Capture complete: YES**

Exact command: `env -i PATH="$PATH" HOME=/tmp DATABASE_RECOVERY_BUCKET_ID="$DATABASE_RECOVERY_BUCKET_ID" node --max-old-space-size=192 scripts/retained-pdim-recovery-drill.mjs`

## Safety

- The inspected source is only this development workspace's stopped local fallback `data/local-pdim-store.json`; it was opened read-only and copied in 64 KiB chunks after stable inode, size, and modification-time checks.
- The application was not started. No database, Neon, shared provider, production restore, deletion, or live PDIM write was performed.
- Scratch was mode 0700, files were mode 0600, and scratch was removed. Retained recovery objects, if any, are intentionally not deleted.
- App Storage retention is private and retained until explicit deletion; no WORM or fixed-duration lock is claimed.

## Sanitized evidence

- PASS: stopped source captured without mutation — 2 bytes captured with stable file identity.
- Exact stopped snapshot: 2 bytes; SHA-256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
- Development fallback persisted hybrid content present: no.
- Production PDIM content presence: unknown; production files are not accessible from development.

## Non-blocking environment observation

- The development fallback snapshot has no HybridStorage index. This does not establish production PDIM content state.
- This empty development fallback is not a deployment gate. Production content remains unknown because predeployment acceptance intentionally does not access live user data.

## Predeployment recovery simulation

Exact command: `NODE_OPTIONS=--max-old-space-size=256 npx vitest run tests/unit/retained-pdim-recovery-simulation.test.ts --pool=threads --maxWorkers=1`

**Result: PASS (1/1).**

- Real `HybridStorageService`, `PocketDimension`, and local PDIM consumers created three isolated files for two owners, including cross-owner deduplication (two physical files).
- The owned local authority committed and pinned the source snapshot. A separately launched bundled worker read every real file and verified content hashes, ownership counts, physical entries, and chunks.
- The external storage boundary was an explicitly simulated, generation-enforcing in-memory SDK. It required create-only writes and exact-generation reads; no live App Storage or production data was contacted.
- The retained generation was read back through the production helper with CRC32C, SHA-256, and size checks, restored under a new private root and port, and verified by a second independent worker. Source and restored evidence matched exactly.
- A second run returned corrupted bytes for the exact retained generation. The production helper rejected them on SHA-256 mismatch before restore.

This proves the recovery behavior of the real PDIM/HybridStorage consumers and independent restore verifier at the simulated provider boundary. It does not claim that production user content exists, that a production backup has run, or that deployed App Storage credentials/bucket policy have been exercised.

## Clustered operator simulation

Exact command: `NODE_OPTIONS=--max-old-space-size=256 npx vitest run tests/unit/pdim-recovery-cluster-integration.test.ts --pool=threads --maxWorkers=1`

**Result: PASS (1/1).**

- A real cluster primary exclusively owned the loopback PDIM listener and recovery authority. Two HTTP worker processes were IPC clients and did not create competing local stores.
- Concurrent create requests sent to different workers produced exactly one accepted job and one conflict. The opposite worker polled the accepted job through primary IPC.
- The primary wrote real `HybridStorageService` content through its owned PDIM and opened the authoritative committed snapshot during the job.
- Job transitions and the sanitized receipt were atomically persisted to a private durable JSON store, not worker memory.
- The polling worker was terminated and replaced. Its replacement retrieved the same completed receipt, while the on-disk store retained the same job and generation.
- The provider portion of this cluster test was simulated and performed no provider write. Exact-generation retrieval, independent actual-consumer restore, and corruption rejection remain proven by the separate recovery simulation above.

## Remaining facts, not circular deployment blockers

- No recovery implementation defect was exposed by this simulation.
- Live bucket authentication, provider-enforced privacy, and the contents of production PDIM can only be observed in the deployed environment. They remain operator/runtime evidence, not prerequisites for proving the predeployment recovery algorithm.
- The simulation does not replace the protected operator receipt from a later real run; it establishes that the retained bytes are independently restorable before publication is possible.

## Production operator workflow

- Implemented but not executed against production. No claim of a completed production backup is made.
- A production execution is an operational follow-up, not a circular predeployment acceptance requirement.
- `POST /api/backup/pdim/create` starts a bounded asynchronous retained-backup and isolated restore-verification job. `GET /api/backup/pdim/jobs/:jobId` returns only a sanitized receipt.
- Both routes require authenticated admin and verified 2FA assurance; creation also has explicit CSRF enforcement. Snapshot bytes are never exposed by HTTP.
- Both create and status entry paths explicitly run CSRF middleware in addition to admin and verified-2FA gates.
- In cluster mode workers forward only sanitized start/status messages to the cluster primary. The primary owns the singleton lock, durable receipt store, local PDIM listener, and snapshot execution; worker replacement cannot lose or fork the job.
- Source attestation binds the configured runtime backend, owned listening server, loopback port, canonical store path, and pinned committed inode. Unknown, remote, or separate-process authority fails closed.
- The online recovery point is serialized and durably committed in the same sequential JavaScript event-loop turn, then its read-only inode is pinned before yielding.
- The private App Storage upload and manifest are create-only. Readback is immutable-generation scoped and checked by CRC32C, SHA-256, and size before actual-class verification in isolated private scratch.
- Production executes the required standalone `dist/retained-pdim-recovery-worker.mjs`; TypeScript and the `tsx` loader are development-only. Both production build paths fail if this artifact is absent, and the deployment capsule explicitly requires it.
- The deployment input explicitly allowlists both worker/helper sources so either build path can regenerate artifacts. The private-storage helper is statically included in the server bundle, so runtime does not depend on loading its loose source file.
