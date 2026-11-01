# Legacy PDIM snapshot recovery

The retained PDIM snapshot tools verify the historical `hybrid:storage:index`
format. Current uploads store ownership and per-file state in PostgreSQL
(`hybrid_storage_files`, `hybrid_storage_imports`) and bytes in immutable PDIM
namespaces. A PDIM-only snapshot cannot recover that new metadata. Coordinated
Neon and PDIM backup/restore remains a separate required deployment gate.

`legacy-hybrid-recovery.ts` supplies a read-only metadata adapter to the real
`HybridStorageService` reader. It uses the production strict legacy parser and
real PocketDimension content reads, ownership and SHA256 checks. Its metadata
writes and SQL connections are unavailable; reading a backup does not rewrite
its access counters. It is used only for historical snapshot verification.
Production uploads never write a compatibility whole-index snapshot.

Run the isolated regression and synthetic legacy drill from the repository root:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  tests/unit/retained-pdim-recovery-simulation.test.ts \
  tests/unit/pdim-recovery-operator.test.ts \
  tests/unit/pdim-recovery-cluster-integration.test.ts
node scripts/pdim-content-recovery-drill.mjs
```

The simulation builds independent real consumers, creates explicitly synthetic
historical-format bytes/index, retains an exact simulated private generation,
restores it into another temporary directory and verifies every file/owner/hash.
It rejects altered generation readback. The operator tests cover authorization,
backend authority, evidence mismatch and bundled production imports. The cluster
fixture verifies one primary-owned job across workers and a replacement worker.
The content drill rejects byte corruption and three valid-checksum but invalid
ownership indexes, retaining the original export and protected destination.

These tests need Node22+, installed dependencies, disposable loopback ports and
a writable temporary directory. They inherit no application database URL or
provider credentials. The synthetic fixture writes the obsolete index only to
its own temporary PDIM instance. The production operator receipt declares
`metadataScope: legacy-pdim-index-only` and `currentSqlMetadataRecovered: false`.

`scripts/retained-pdim-recovery-drill.mjs` is a distinct operational command:
it captures a stable stopped local persistence file read-only, verifies its
historical contents and can retain an exact private AppStorage generation when
configured. It must not be aimed at arbitrary running application state or
reported as current PostgreSQL recovery. The isolated simulation does not call
that provider or prove actual off-instance retention.
