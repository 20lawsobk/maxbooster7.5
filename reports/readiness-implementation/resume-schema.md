# Isolated PostgreSQL migration rehearsal

Run: 2026-09-22T00:25:44.054Z
Safety: every subprocess receives an allowlisted environment (PATH, temporary HOME, LANG, TZ). No workspace database environment or credentials are read. PostgreSQL listens ONLY on a private temporary Unix socket; port 55439; trust auth for synthetic local role rehearsal. No TCP listener.
Baseline: fresh SQL generated from a TEMP copy of shared/schema.ts excluding only the readiness re-export. Full schema independently generated/applied in a second isolated database for structural catalog parity. Historical migrations were NOT replayed: their provenance is incomplete. This is not proof of upgrade compatibility with the shared database.
Scope: real PostgreSQL SQL/invariant checks plus real injected session/factor repositories. No provider calls, app startup, full build, installation, or shared database access.
Rerun: `env -i PATH="$PATH" HOME=/tmp node scripts/readiness-isolated-rehearsal.mjs`

Schema SHA256: 50864e829a1ed30889968be18e00dd8f0e3f810825b104d2d4afd019ff2aef24
Readiness schema SHA256: 382fb35b4f4814425fdfb3bddb663627b8d2ee28538a2f9d772d1010d2b8d199
Server identity:
```json
{
  "version": "PostgreSQL 16.10 on x86_64-pc-linux-gnu, compiled by clang version 19.1.7, 64-bit",
  "current_database": "postgres",
  "current_user": "rehearsal",
  "data_directory": "/tmp/readiness-pg-q3SO0f/data",
  "socket": "/tmp/readiness-pg-q3SO0f",
  "port": "55439",
  "listen_addresses": "",
  "pg_postmaster_start_time": "2026-09-22T00:25:48.615Z"
}
```
Baseline applied: 0000_white_jackal.sql, SHA256 fa6a10f7b40ebb54b49016aa138c1bcd1560734259fcfa300a4b9b4030f65fa0
Finance-named migration in snapshot: none; finance-specific migration coverage pending if another worker adds one.

## Migration results
- PASS: 0020_security_authority.sql SHA256 e468beb1c0bb0510cd94af54857e291476dc6a652a2052df236eacb36f0be833
- PASS: 0021_integrations_catalog_jobs.sql SHA256 cf5b14c1d725049048da1b518154a87ca558a98348991629fecba889b82146c8
- PASS: 0022_commerce_webhook_receipts.sql SHA256 b9fe9c9b890a350e12b6482b8f32ad0c409050a150794c5f0cc8b5cdc525405f
- PASS: 0022_integrations_distribution_submissions.sql SHA256 40a9cc7acffbf41be8caca537e32c21cac70da51fc8e9d21f5d186c228bb36fc
- PASS: 0023_commerce_settlement.sql SHA256 3f1ca96deba38c5f1584cd4eaef72727005d50ddf5ce48879c5002f26d52f58c
- PASS: 0023_generic_export_jobs.sql SHA256 9c71fd780507bb2e967e07d574319b6d1c734672ffef81b778e4c01c8c51a785
- PASS: 0023_integrations_sms_attempts.sql SHA256 2e325f200ea91348a7788825365ddd0104f0515f3f60d2afbd7f636a9f01bdf9
- PASS: 0090_data_runtime.sql SHA256 6b0ec5f9aa0695efa31fc9c9ba39ac19922c4287f38ffc4d107e5484191dae04
- PASS: 0091_growth_split_revisions.sql SHA256 f228a71122c40aa2d92eeff5d1e45c77f6947ac39882a6d118e71e8846b801fd
- PASS: 0092_growth_fan_delivery.sql SHA256 fa619283ac16ac150097388c3aac61ff9ac22c49f1d61b9ed50e4cf9f363e546
- PASS: 0093_growth_merch_checkout.sql SHA256 0af5b16edff50e8215e1c0182251c3a5832f268d69d5805bb849f243eb929472
- PASS: 0094_client_sync_receipts.sql SHA256 ff6495b4ecf7723097f07812e65eb5069ca34c812c5cc2d0f1dde1c1754dede7

## Database checks
Public tables: 302.
Readiness table inventory (29): account_erasure_requests, auth_session_epochs, client_sync_receipts, commerce_allocations, commerce_draws, commerce_entries, commerce_journals, commerce_operations, commerce_schedules, commerce_sources, commerce_statements, commerce_webhook_inbox, commerce_webhook_receipts, generic_export_jobs, growth_fan_commands, growth_fan_permissions, growth_fan_provider_events, growth_fan_recipients, growth_merch_payment_events, growth_merch_payments, growth_split_assents, growth_split_revisions, integration_catalog_jobs, integration_catalog_transfers, integration_distribution_submissions, integration_sms_attempts, pg_sessions, runtime_backup_catalog, runtime_backup_runs.
Missing new migration tables: none.
- PASS: All readiness migration tables present, including 0094
Full Drizzle SQL SHA256: 8a87af1c9d0db03c88dfb9db4f8baccf2e1f47b39bdf54b28a4d2f88e600610f
Parity columns: 205 catalog records matched across 29 tables (including constraint/index names and definitions).
Parity constraints: 77 catalog records matched across 29 tables (including constraint/index names and definitions).
Parity indexes: 50 catalog records matched across 29 tables (including constraint/index names and definitions).
- PASS: Drizzle structural parity: columns/defaults/nullability, constraints, indexes for every readiness table
Migration-only trigger definitions excluded from structural Drizzle parity; validated separately and exercised by ledger checks.
- PASS: Migration-only commerce triggers installed and enabled
Real pg-backed security factory assertions passed (8 concurrent revocations, CAS rejection, atomic rollback).
- PASS: Session epoch issue/revoke/concurrency, factor CAS, transaction rollback (real repositories / real PostgreSQL)
- PASS: Webhook receipts survive reconnect and deduplicate
- PASS: Commerce balanced commit and unbalanced deferred-constraint rollback
- PASS: Backup catalog state constraint and lease-owner fencing (SQL checks, not backup/provider execution)
- PASS: Commerce ledger rejects DELETE and preserves all rows
- PASS: Commerce ledger rejects UPDATE journal identity and preserves both journals and entries

## Release gates
Local beta gate: all checks must pass. Shared/prod migration remains BLOCKED pending operator approval, a verified backup and legacy-data/upgrade rehearsal. Schema push alone cannot install migration-only commerce triggers/functions. No provider delivery or full application readiness claim.

Limits: fresh empty-schema rehearsal only; no legacy-data conversion, full repository commerce flows, remote backup contents/checksums/restore, provider delivery, HTTP authorization, load, or live migrations tested. SQL deduplication is not provider exactly-once proof. Files added after the recorded migration snapshot require rerun.

Cleanup: local PostgreSQL stopped successfully.
Cleanup: temporary data/config/socket/log directory removed.

Failures: 0
Isolated beta gate: PASS. Production/live-DB gate: NOT AUTHORIZED by this rehearsal.
