# Database recovery drill

**Result: PASS**

Run: 2026-09-23T10:23:46.618Z
Exact command: `env -i PATH="$PATH" HOME=/tmp NEON_DATABASE_URL="$NEON_DATABASE_URL" DATABASE_RECOVERY_BUCKET_ID="$DATABASE_RECOVERY_BUCKET_ID" node --import tsx scripts/database-recovery-drill.mjs --retained-app-storage`

## Scope and safety

- The configured NEON_DATABASE_URL was accessed only by a read-only, repeatable-read transaction and pg_dump using its exported snapshot.
- No application startup, migration, or source DDL/catalog write was performed. Provider calls were limited to the verified private retained bucket.
- The target was a new disposable PostgreSQL cluster bound to loopback plus a private Unix socket on a unique port. Exact target identity and emptiness were checked before restore.
- Dump and cluster scratch stayed under a mode-0700 temporary directory; the dump file was mode 0600. Scratch was removed.
- Restore input was the downloaded, immutable-generation retained copy; retained objects are never automatically deleted, including after a blocked restore.
- Schema parity canonicalizes relations/views, columns and types/defaults, user-defined types, constraints, index definitions, function/procedure bodies, sequence definitions/ownership, triggers, and row-security policies.

## Sanitized evidence

- PASS: source transaction is read-only — transaction_read_only=on
- PASS: dump scratch file is private — mode=0600
- PASS: managed storage privacy is empirically verified — authenticated canary read matched; anonymous exact-object fetch denied (403); canary removed
- PASS: managed backup retention contract is recorded — retained until explicit deletion; no fixed-duration or locked-retention claim
- PASS: retained generation readback matches dump — 27370757 bytes matched CRC32C and SHA-256
- PASS: restore target identity is exact — database, role, data directory, listener, and unique port matched
- PASS: restore target is empty — zero user relations before restore
- PASS: restored schema fingerprint matches source snapshot — 6702 canonical schema-definition records matched
- PASS: restored table inventory matches source snapshot — 311 table row counts matched exactly
- PASS: restored row content hashes match source snapshot — 311 deterministic per-table content hashes matched
- PASS: restored database is nonempty — 6702 canonical schema-definition records restored
- Source PostgreSQL major: 17; tables: 311; canonical schema-definition records: 6702.
- Dump bytes: 27370757; SHA-256: 9c2853a60b10f5fe92fa86efd3195f1c7254717a49a526d55b7864ba6e5b0c6b; source version: 17.11.
- Restored aggregate row count: 44677; exact per-table count comparison: PASS.
- Deterministic per-table row-content hashes: PASS; no row values or per-table hashes are stored in this report.
- Private retained prefix: private-database-recovery/2026-09-23T10-24-30-022Z-a98e2377-5121-4c67-bace-58f145bdea3d; dump generation: 1790159070415781; manifest generation: 1790159070554329.
- Sanitized manifest object path: private-database-recovery/2026-09-23T10-24-30-022Z-a98e2377-5121-4c67-bace-58f145bdea3d/manifest.json; manifest SHA-256: 378b4ae67b8e112c6cba254bdf1ff76b071e97ca37980fb7ae5e80c83a64ba29; retained dump CRC32C: 2JG3qQ==.
- Managed-storage contract: private by default and retained until explicit deletion; no fixed-duration or locked-retention claim.
- Anonymous exact-canary-object privacy probe: 403 (denied); canary removed: PASS.
- Retained dump generation-bound CRC32C and streamed SHA-256 readback: PASS.

No row values, connection values, host identity, database name, role name, or temporary port are included in this report.
