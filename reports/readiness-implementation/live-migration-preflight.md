# Live migration preflight — no migrations applied

## Superseding commerce rollout

The historical no-migration status below is superseded for exactly commerce
migrations 0022/0023. An independent private Replit App Storage dump was retained,
downloaded by generation, and restored with complete schema/content comparisons.
The restored-database rehearsal passed seven checks. The two approved migrations
then committed atomically against the real application database; exact live
catalog postconditions passed and an external generation-pinned receipt was
retained. No other pending migration was applied and no historical receipt was
invented. See `commerce-migration-live-receipt.json` and
`database-recovery-drill.json` for the operative evidence.

The user authorized reviewed additive migrations **only after backup and rollback checks pass**. That condition has not yet been met.

## Read-only observations

- Confirmed the application resolves its database from `NEON_DATABASE_URL` before the managed database variable.
- Connected using that application configuration, without printing credentials, and ran a read-only transaction with a statement timeout.
- Live PostgreSQL version: **17.11**. Database size at inspection: **78,405,632 bytes**.
- A Drizzle migration receipt table exists, but a subsequent read-only query found **zero receipt rows**. Historical provenance cannot be established from that table.
- Existing `pg_sessions` columns match the migration's text/text/bigint shape.
- No backup catalog or backup-run table appeared in the inspected schemas. This does **not** prove that provider-managed backups are absent.
- The available `pg_dump`/`pg_restore` binaries are PostgreSQL **16.10**, older than the live server. They cannot be assumed capable of backing up PostgreSQL 17.
- The filesystem migration journal includes only the earlier six entries. The twelve new SQL files are not registered there. The fresh-schema rehearsal is not evidence that historical live migration receipts match.

## Gate status

| Gate | Status |
|---|---|
| Application database target identified | Passed |
| Fresh isolated migration/schema rehearsal | Previously passed |
| Live historical receipt reconciliation | Pending |
| Verified current backup/recovery point | Not established |
| Restore/rollback rehearsal using live-compatible schema/data | Not established |
| Live additive migrations | Not attempted |

The existing backup implementation depends on catalog tables that are themselves pending migration. Creating those tables first would violate the user's backup-first condition.

Neon account management access is available as a connectable integration but is not connected. It can enable inspection of the existing project's recovery configuration and isolated branch-based upgrade/rollback verification. No branch, backup, schema, user data, deployment, or storage state was changed during this preflight.

## Existing-credential follow-up

The user confirmed that required APIs are already configured. Presence-only checks
found existing database URLs and PDIM/storage endpoint and bearer-token settings;
no values were displayed. The database credentials were successfully used for
read-only inspection. No further connection was installed or requested.

The live schema currently contains only `pg_sessions` among the 29 tables named
by the twelve readiness migrations. No readiness migration was applied.

Source inspection confirmed that the existing backup upload path initializes
the local PocketDimension provider and requires the new backup catalog. It is
not a standalone upload API at `STORAGE_HTTP_URL`. Reusing configured credentials
does not by itself remove that bootstrap dependency or prove durable backup and
successful restore. Provider recovery access and a verified independent backup
path remain unestablished; do not bypass the user's backup-first condition.