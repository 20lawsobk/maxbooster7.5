# Synthetic PDIM content recovery drill

**Result:** PASSED
**Exact command:** `node scripts/pdim-content-recovery-drill.mjs`

## Scope and evidence

- Actual content path: `HybridStorageService.upload/read` -> pocket `hybrid-cold-storage` -> entries `storage/<generated key>`.
- Ownership index path: `hybrid:storage:index`.
- Synthetic files independently restored and byte-checksummed: 2.
- Snapshot: 4413 bytes, SHA-256 `7e7867aae708bfba0cecb192bf685e02a6e91076a8ebb7571e67588724c6c461`.
- Source destroyed before restore: true.
- Ownership index and unauthorized-read behavior verified: true / true.
- Corrupt export rejected before restore; existing destination unchanged: true / true.
- Valid-checksum snapshots with corrupt ownership indexes failed before content reads and preserved restored bytes: malformedJson, invalidRoot, danglingOwnership / true.
- Production/AppStorage/user data touched: none.
- Production initialization gate: malformed/partial PocketDimension metadata and hybrid ownership indexes, plus PDIM read failures, now fail explicitly without writes; only authoritative null reads create an empty store.
- Focused test command: `NODE_OPTIONS=--max-old-space-size=256 npx vitest run server/pocket-dimension/__tests__/index.test.ts tests/unit/hybrid-storage-index-recovery.test.ts --pool=threads --maxWorkers=1` (18 passed).

## Honest limitations

- Off-instance transport was simulated with a separate local temporary export directory only; no remote backup service or independent machine was used.
- No AppStorage, shared database, production credentials, or actual user data was read, exported, restored, or deleted.
- This proves the real HybridStorageService -> PocketDimension -> PDIM key path for synthetic content, not recovery of retained production user PDIM content; that operational recovery remains a gap.
