# Backup closure: PostgreSQL client compatibility

## Source correctness fix

The backup service no longer invokes whichever `pg_dump` or `psql` happens to
win the first PATH lookup.

- `server/services/backup/postgresTools.ts` enumerates executable PATH
  candidates without a shell, resolves duplicate symlinks, and applies bounded
  PATH, candidate, execution-time, and diagnostic-output limits.
- Every candidate is probed with `--version`. The source database major is
  queried with `SHOW server_version_num` before a dump.
- Dump selection requires `pg_dump` major to be at least the queried source
  server major and prefers an exact-major client. An incompatible or
  unprobeable tool set fails explicitly; it does not silently fall back.
- Restore reads the source major from the authenticated dump header, queries
  the isolated target's major, rejects downgrade restores, and requires a
  compatible `psql`.
- The selected absolute executable is used by the existing dump/restore spawn
  paths. Existing exclusive mode-0600 temporary files, cleanup, checksum
  read-back, upload, catalog state, lease, and retention semantics remain in
  place.
- Tool-query and dump/restore diagnostics are bounded and redact database URLs
  and password-shaped values. Database URLs remain in child-process
  environment variables rather than command arguments.
- No Nix store hash or installation path is hardcoded.

## Verification

Isolated Vitest coverage mocks process spawning and filesystem candidate
discovery. It verifies selection of PostgreSQL 17 instead of the first
PostgreSQL 16 PATH entry, explicit refusal when only an older dump client is
available, compatible restore selection, downgrade refusal, dump-header
parsing, version parsing, and credential redaction. Result: **6 tests passed**.

TypeScript checking of `postgresTools.ts` completed without errors.

Real local `--version` probes (no database connection) found:

- PATH-default `pg_dump`: **16.10**
- PATH candidates for `pg_dump`: **16.10** and **17.5**
- PATH candidates for `psql`: **16.10** and **17.5**

Given the independently established live source version **PostgreSQL 17.11**,
the implemented selector chooses the discovered 17.5 `pg_dump`; it will not
use the PATH-default 16.10 client.

No dump, restore, upload, live database query, package installation, secret
readout, or workflow operation was performed as part of this verification.

## Remaining blockers

The source-bootstrap/catalog blocker remains pending. The existing
`createBackup` interface is not a safe catalog-free off-source export path: it
commits pending/verified durability state through the source catalog and
uploads through the configured storage service. There is therefore no existing
interface that permits a truthful durable standalone export while bypassing
the catalog.

The configured remote recovery target also remains blocked: prior authenticated
PING checks of configured STORAGE and both PDIM URLs returned HTTP 403. Until a
durable off-source destination is reachable, no backup should be run or
represented as completed.