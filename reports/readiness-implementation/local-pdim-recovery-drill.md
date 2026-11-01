# Local PDIM recovery drill

**Result:** PASSED
**Exact command:** `node scripts/local-pdim-recovery-drill.mjs`

## Evidence

- Actual implementation: server/lib/localPdimServer.ts loaded in real disposable child processes.
- Disposable loopback port: 40563.
- Representative string, hash, set, list, sorted set, stream, and expiring string were verified before shutdown, after graceful shutdown/new process, and after backing-directory deletion/export restore.
- TTL observations (ms): before shutdown 119985; new process 119714; restored copy 119311.
- Export SHA-256: 0b49c17222002b49c92ad3cb89f56b343ec7d12b8e9e2abeea4b56fab69567b9. Export used a separately located temporary directory: true.
- Original disposable backing directory deleted before restore: true.
- Corrupt snapshots failed explicitly rather than starting empty: true. Rejected shapes: malformedJson, nonObjectRoot, unknownType, missingValue, unexpectedEntryField, invalidString, invalidHash, invalidSet, invalidList, invalidZsetMember, nullZsetScore, nonFiniteZsetScore, unexpectedZsetField, invalidStreamId, invalidStreamFields, unexpectedStreamField, invalidExpiry, nonFiniteExpiry.
- Failed final shutdown save surfaced as a nonzero exit: true (exit 1).
- Production data writes/deletes: none.
- Cleanup failures: none.

## Gaps

- The exported fixture was copied to a separate temporary path on the same machine; this is not off-instance backup retention or independent disaster recovery.
- Directory fsync is implemented and exercised on the normal filesystem path, but this drill does not simulate sudden power loss or prove storage hardware write-cache behavior.
- The drill did not start the main application workflow and did not read production PDIM data or credentials.
- PDIM ran exclusively as the local child implementation; MaxCore was not invoked, and no remote service was contacted.
