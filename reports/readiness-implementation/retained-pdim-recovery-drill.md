# Development PDIM preflight and production operator workflow

**Result: BLOCKED**
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

## Blocker

- The development fallback snapshot has no HybridStorage index. This does not establish production PDIM content state.

## Production operator workflow

- Implemented but not executed against production. No claim of a completed production backup is made.
- `POST /api/backup/pdim/create` starts a bounded asynchronous retained-backup and isolated restore-verification job. `GET /api/backup/pdim/jobs/:jobId` returns only a sanitized receipt.
- Both routes require authenticated admin and verified 2FA assurance; creation also has explicit CSRF enforcement. Snapshot bytes are never exposed by HTTP.
- Source attestation binds the configured runtime backend, owned listening server, loopback port, canonical store path, and pinned committed inode. Unknown, remote, or separate-process authority fails closed.
- The online recovery point is serialized and durably committed in the same sequential JavaScript event-loop turn, then its read-only inode is pinned before yielding.
- The private App Storage upload and manifest are create-only. Readback is immutable-generation scoped and checked by CRC32C, SHA-256, and size before actual-class verification in isolated private scratch.
- Production executes the required standalone `dist/retained-pdim-recovery-worker.mjs`; TypeScript and the `tsx` loader are development-only. Both production build paths fail if this artifact is absent, and the deployment capsule explicitly requires it.
- The deployment input explicitly allowlists both worker/helper sources so either build path can regenerate artifacts. The private-storage helper is statically included in the server bundle, so runtime does not depend on loading its loose source file.
