# Controlled current-format joint recovery acceptance

The completed combined run on 2026-10-27 at 22:26:22 UTC passed **9 leaf assertions, with no failures, errors or skips**, in 6.209 seconds. Five assertions exercise the new current SQL + canonical PDIM recovery rehearsal; four exercise the existing real PostgreSQL backup/restore regression. Node's aggregate TAP comment includes two parent tests; it is not an additional two leaf assertions.

Run from the repository root using Node 22 and matching PostgreSQL tools on PATH:

```sh
node --import tsx --test --test-concurrency=1 --test-reporter=junit \
  tests/current-storage-joint-recovery.test.mjs \
  tests/database-backup-restore-postgres.test.mjs
```

No application, provider or production database credentials are required. The suites use private disposable PostgreSQL clusters and owned canonical PDIM child processes. See [the instructions and scope](../../../docs/testing/current-storage-joint-recovery.md) for prerequisites and the five recovery steps.

Evidence:

- [command-receipt-222622.json](command-receipt-222622.json) records the exact command, exit status, duration, JUnit hash and test/helper hashes.
- [acceptance-222622.xml](acceptance-222622.xml) contains the nine actual leaf outcomes.
- [receipt-1793139987290.json](receipt-1793139987290.json) records the final actual recovery, source hashes, retained-pair digests and acceptance assertions. The original source process, directory and database were unavailable before recovery into fresh targets. Four corrupted or mismatched pair admissions left protected targets unchanged.
- [receipt-1793139820056.json](receipt-1793139820056.json) retains the initial fixture validation failure: the post-restore invariant needed a schema-qualified SQL marker after `pg_dump` resets `search_path`. [receipt-1793139865650.json](receipt-1793139865650.json) retains the first passing rerun. Only the final receipt matches the final test file hash.
- [manifest.json](manifest.json) binds the evidence files and records the subsequent verification of all 16 source-hash references, the JUnit hash, leaf count and status. No tests or helpers changed during that verification.

This proves a **controlled, writer-drained current-format recovery rehearsal**, using actual production storage/dump/restore helpers with a minimal relevant schema and synthetic records. It does not prove recovery of every application table, concurrent production-writer consistency, a production backup orchestrator, retained offsite backups, deployed Neon/Replit recovery, live migration, RPO/RTO or global capacity. No SQL dump, PDIM checkpoint, account content or private connection material is retained in this directory.
