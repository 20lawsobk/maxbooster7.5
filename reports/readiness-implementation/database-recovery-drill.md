# Database recovery drill

**Result: PASS**

Run: 2026-10-19T20:44:56.258Z
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
- PASS: restored schema fingerprint matches source snapshot — 7280 canonical schema-definition records compared
- PASS: restored table inventory matches source snapshot — 341 table row counts matched exactly
- PASS: restored row content hashes match source snapshot — 341 deterministic per-table content hashes matched
- PASS: restored database is nonempty — 7280 canonical schema-definition records restored
- Source PostgreSQL major: 17; tables: 341; canonical schema-definition records: 7280.
- Dump bytes: 24037616; SHA-256: e6cb48a9aa772a3f88625b2aa47d91e25e014e22671561123d29a57b11c55a46; source version: 17.11.
- Restored aggregate row count: 35792; exact per-table count comparison: PASS.
- Deterministic per-table row-content hashes: PASS; no row values or per-table hashes are stored in this report.

No row values, connection values, host identity, database name, role name, or temporary port are included in this report.
