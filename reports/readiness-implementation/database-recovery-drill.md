# Database recovery drill

**Result: PASS**

Run: 2026-09-23T09:03:25.575Z
Exact command: `env -i PATH="$PATH" HOME=/tmp NEON_DATABASE_URL="$NEON_DATABASE_URL" node --import tsx scripts/database-recovery-drill.mjs`

## Scope and safety

- The configured NEON_DATABASE_URL was accessed only by a read-only, repeatable-read transaction and pg_dump using its exported snapshot.
- No application startup, migration, source DDL/catalog write, storage-provider call, or other network call was performed.
- The target was a new disposable PostgreSQL cluster bound to loopback plus a private Unix socket on a unique port. Exact target identity and emptiness were checked before restore.
- Dump and cluster scratch stayed under a mode-0700 temporary directory; the dump file was mode 0600. Scratch was removed.
- The dump was ephemeral and uncommitted. This drill makes no durable-backup, retention, or RPO claim.
- Schema parity canonicalizes relations/views, columns and types/defaults, user-defined types, constraints, index definitions, function/procedure bodies, sequence definitions/ownership, triggers, and row-security policies.

## Sanitized evidence

- PASS: source transaction is read-only — transaction_read_only=on
- PASS: dump scratch file is private — mode=0600
- PASS: restore target identity is exact — database, role, data directory, listener, and unique port matched
- PASS: restore target is empty — zero user relations before restore
- PASS: restored schema fingerprint matches source snapshot — 6702 canonical schema-definition records matched
- PASS: restored table inventory matches source snapshot — 311 table row counts matched exactly
- PASS: restored row content hashes match source snapshot — 311 deterministic per-table content hashes matched
- PASS: restored database is nonempty — 6702 canonical schema-definition records restored
- Source PostgreSQL major: 17; tables: 311; canonical schema-definition records: 6702.
- Dump bytes: 27353570; SHA-256: fbd84602e7ff30828d3da9671d578206968622d6f2135374020e35b825f59df8; source version: 17.11.
- Restored aggregate row count: 44639; exact per-table count comparison: PASS.
- Deterministic per-table row-content hashes: PASS; no row values or per-table hashes are stored in this report.

No row values, connection values, host identity, database name, role name, or temporary port are included in this report.
