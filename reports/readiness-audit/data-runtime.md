# Data/runtime production-readiness audit

Date: 2026-09-19. Scope: database evolution, backup/recovery, PDIM storage durability and deletion, queue recovery, and session backing. Read-only source audit; no live database/provider calls, secret reads, application changes, workflow operations, or test executions.

## Blocker list

Priorities are release decisions, not claims that an incident has occurred. P0 = do not rely on the affected recovery/data-retention promise; P1 = resolve before launching the affected capability; P2 = follow-up. Confidence describes the source conclusion, not knowledge of deployed infrastructure.

| ID | Classification / priority | Blocker | Affected release scope | Confidence |
|---|---|---|---|---|
| D1 | CONFIRMED defect / P0 | Backup objects and their catalog are written under generated keys but subsequently read using different, fixed keys. | Application-managed database backups and backup automation | High |
| D2 | CONFIRMED defect / P1 | Backup scheduling is not wired in current server sources; backup target selection differs from application DB selection. | Scheduled backups, especially installations using NEON_DATABASE_URL | High for source wiring and selection; runtime schedule unverified |
| D3 | CAPABILITY GAP with confirmed helper defect / P1 | No demonstrated end-to-end safe restore workflow; existing helper can report success after SQL errors. | Disaster-recovery readiness claims | High for helper behavior; recovery operations unverified |
| D4 | CONFIRMED defect / P0 | External PDIM treats unreadable/corrupt recovery state as absent and proceeds; AOF replay can skip failed records; streams are excluded from persistence. | Deployments with external/pdim enabled as durable Redis-compatible state | High |
| D5 | CONFIRMED defect / P1 | External fabric deletion removes authoritative metadata before cleanup is recoverable and decrements capacity after failed physical deletion. | External fabric object deletion, deduplicated storage and capacity accounting | High |
| D6 | CONFIRMED defect / P1 | Session save/delete callbacks acknowledge before durable backing operations complete; PG errors are swallowed even in PG-only mode. | Session continuity across worker handoff/restart and backing-store outages | High |
| D7 | CONFIRMED defect / P1 | Retention-worker startup cleanup can drain valid queued work along with malformed jobs. | Retention queue startup/restarts and multi-worker operation | High |
| D8 | VERIFICATION GATE with confirmed tooling defect / P1 | Schema rollout provenance is incomplete; checked-in migration journal stops before later SQL, and the merge push pipeline masks command failure. | Releases needing schema changes; fresh installs and upgrades | High for repository facts; deployed schema unknown |

No source evidence here establishes current production data loss. D1/D4 are P0 specifically for trusting backup/recovery or durable-state guarantees, not an assertion that every platform route must be offline.

### Evidence, entrypoints and impact

**D1 — Backup addressing and catalog integrity.** Mounted entrypoint: `server/routes.ts:7209-7212`; creation/list consumers: `server/routes/backup.ts:11-25`; automation consumer: `server/automation-system.ts:572-575`. `server/services/backup/databaseBackupService.ts:23-38` reads `database-backups/index.json` but writes it through `uploadFile`. That API actually generates `category/UUID/filename` (`server/services/storageService.ts:197-205`); fixed-key writing is a separate API (`:208-214`). The dump writer likewise passes its intended key as category and MIME type as filename, ignores the returned actual key, and records the intended key (`server/services/backup/databaseBackupService.ts:185-193`). Thus both the dump reference and index address are wrong, independently of provider health. Also, all index-read failures become an empty index (`:23-29`), concurrent writers read/modify/overwrite (`:189-191`), and failed retention deletes still disappear from the catalog (`:203-214`). Successful creation does not establish a retrievable backup; listing, retention and restore can lose discoverability. These are one backup-object/catalog contract root cause, not separate artificial findings.

**D2 — Backup orchestration and target identity.** `server/services/backup/databaseBackupService.ts:44-60,72-85` requires `initialize()` to register the schedule. The module only exports a constructed instance (`:291`); current source search found create/list/metrics consumers, but no call to that initializer. The route comment claiming initialization in index (`server/routes/backup.ts:8`) is not executable evidence. Metrics return constants, not last-success observations (`server/services/backup/databaseBackupService.ts:273-280`). Separately, the running application's config chooses `NEON_DATABASE_URL || DATABASE_URL` (`server/config/defaults.ts:173-174`), while backup enablement/dump/restore use only `env.DATABASE_URL` (`server/services/backup/databaseBackupService.ts:45,88-100,228`). When these differ, backup may target another database; when only the preferred variable exists, backup is refused. Provider-managed backup may exist outside this repository; that is unverified and does not repair the application claim.

**D3 — Restore workflow.** `server/services/backup/databaseBackupService.ts:221-251` downloads SQL and invokes `psql ... -f ...`, without `ON_ERROR_STOP`, a clean-target provision step, or database validation before resolving success on exit zero (`:228-240`). Standard psql scripting can continue after SQL statement errors unless configured to stop, so process success is insufficient evidence of a complete restore. Search found the method definition but no current caller. The mounted backup router offers creation/list/metrics only (`server/routes/backup.ts:10-40`); therefore this is not presented as an exposed restore endpoint bug. It is a recovery capability gap plus an unsafe helper that must not be adopted unchanged. The 24-hour RPO / 30-minute RTO are declared targets (`server/services/backup/databaseBackupService.ts:13-14,273-280`), not measured recovery results. Dump creation also has an explicit 1-GiB ceiling (`:155-171`), which constrains recoverable scale unless another complete backup route exists.

**D4 — Fail-open recovery.** External API command consumer: `external/pdim/artifacts/api-server/src/routes/redis.ts:252`; existing instance initialization calls `store.load()` (`external/pdim/artifacts/api-server/src/redis/manager.ts:87-88,166-167`). `external/pdim/artifacts/api-server/src/redis/store.ts:272-308` catches any snapshot read/parse error as a fresh store; `:333-345` treats unreadable AOF as nothing to replay; `:349-361` continues after a replay command fails. A missing snapshot, storage outage, corrupt snapshot and incomplete replay are not distinguished. A snapshot parse/load failure can leave empty or partially populated state eligible for service. Subsequent mutations can persist incomplete state; no safe-recovery barrier is shown on this path. Existing AOF and snapshots are real, not absent: snapshot scheduling is five seconds and AOF flush scheduling one second (`:315-329`), and AOF writes go through fabric (`:406-427`). Those timers are not a hard RPO bound under storage latency/failure. Crash durability, consistent recovery and acceptable acknowledged-write loss remain verification gates even after correcting the fail-open path.

**D4 stream contract qualification.** Stream mutations are intentionally excluded from the AOF (`external/pdim/artifacts/api-server/src/redis/store.ts:62-68`); stream entries are skipped on snapshot load (`:285-287`) and snapshot creation (`:569-572`). Thus repairing recovery error handling alone cannot provide durability for every supported Redis command/type. Each remediation below must either persist stream entries and all supported stream metadata/mutations, or migrate durability-requiring stream consumers to a durable authority while explicitly retaining an ephemeral contract only for consumers that require no persistence. Existing stream state must be exported before restart/cutover where recoverable; already lost state cannot be reconstructed without another authoritative source. This finding applies only when the external PDIM backend is enabled. Stream exclusion alone is not evidence of BullMQ job loss; D7 rests on its separate, directly observed queue-drain path.

**D5 — Delete/usage accounting.** Consumer: external fabric delete route `external/pdim/artifacts/api-server/src/routes/fabric.ts:389`. `external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts:1109-1139` claims the object by deleting its index row first, then releases chunk references. A crash or exception between those actions leaves work without its original object row; a retry returns early because the object is absent (`:1114-1115`). Physical deletion errors are swallowed and node usage is reduced anyway (`:1124-1129`). This can strand bytes/references and under-report usage. The atomic single-winner object deletion is a genuine existing improvement; the remaining defect is absence of durable cleanup progress across metadata and physical storage, not double-deletion of the same object row. No claim is made that every app-side storage route reaches this external fabric; scope is explicitly that backend.

**D6 — Durable session acknowledgments.** Store selection/fallback is in `server/middleware/sessionConfig.ts:764-790`. PDIM-backed `set` populates process L1, starts best-effort PG work, calls success, and then invokes the PDIM write (`:588-608`). PG helpers catch database failures (`:59-81`); PDIM destroy also starts a best-effort PG delete (`:611-614`). PG-only `set`, `destroy` and `touch` acknowledge immediately (`:732-755`), even though PG is their sole durable backing. PG reads also flatten errors into absence (`:43-56`). A just-acknowledged session can disappear after process failure or worker handoff; backing-store outages are hidden from callers. This is a persistence/consistency finding, not an audit of login authorization, cookie policy or session revocation policy.

**D7 — Queue recovery deleting legitimate work.** Actual startup consumer: `server/index.ts:1167-1171`. Broker selection supports native Redis and PDIM (`server/lib/redisClient.ts:86-107`). `server/lib/scaleJobQueue.ts:106-120` identifies malformed waiting jobs, but if more than ten are found calls `queue.drain()`, removing *all* waiting jobs, including named legitimate jobs. The worker is started immediately and cleanup scheduled five seconds later (`:161-175`), contradicting comments that cleanup precedes processing. Another replica can also have newly enqueued work at that time. The same cleanup requests zero-grace active cleanup (`:93-100`); actual removal of locked active jobs depends on broker/BullMQ semantics and is not asserted here. The proven waiting-job drain alone is sufficient. Recurring schedules do not reconstruct arbitrary queued payloads or the exact lost run.

**D8 — Schema provenance.** Supported `db:push` script delegates to schema push (`package.json:37`; `scripts/db-push.js:1-13`); `drizzle.config.ts:18-21` identifies shared schema and migrations output. `migrations/meta/_journal.json:40-48` ends at 0005, while later checked-in changes include `migrations/0010_add_soft_delete_to_user_storage_files.sql`, `0013_payment_intent_unique_constraint.sql`, `0017_marketplace_money_loop.sql`, and `0018_social_reply_templates.sql:8-31`. This does not prove those changes are missing from a live database: push and manual SQL can apply them. It does mean journal-based rollout cannot be assumed to cover them. `scripts/post-merge.sh:4,9-12` pipes push to `tail` without `pipefail`; upstream push failure can appear successful, and its fallback only warns. Deployed schema, custom SQL/data changes, constraints and index parity need independent release evidence. No live schema was queried.

## Repair playbooks

Each lettered alternative is a complete implementation route, not a step in a single four-part plan. Choose one route per finding, addressing listed acceptance conditions. Tests below are future isolated-environment work, not tests executed during this audit. None guarantees a first-attempt repair.

### D1 — Reliable backup objects and catalog

**A. Repair fixed-key objects plus transactional catalog — recommended.** Lowest disruption; requires a catalog migration.
1. Inventory backup object naming and capture a read-only catalog snapshot; identify actual generated objects without printing contents.
2. Use `uploadFileAtKey` for fixed names, or consistently persist the returned generated key; introduce a SQL backup catalog with unique IDs and pending/verified/deleting states.
3. Reconcile orphan objects into the catalog using checksums and readable SQL metadata; retain ambiguous objects for review; remove the mutable JSON index from authority.
4. Test concurrent creation, index unavailability, upload success/catalog failure and retention delete failure using an isolated real backing service.
5. Accept only when each successful creation downloads by its recorded key, listing survives restarts, and failed deletions retain retriable catalog entries.

**B. Immutable object manifests.** Avoids a DB dependency for disaster discovery; needs provider conditional writes/listing.
1. Define immutable dump/manifest IDs, checksum format and minimum provider consistency guarantees.
2. Write dump then immutable per-backup manifest; build listings from manifests rather than read/modify/write index JSON.
3. Import recoverable legacy objects as manifests; implement retention tombstones and retryable delete records.
4. Exercise concurrent writers, interrupted manifest creation, listing pagination and storage outages.
5. Accept when manifests independently locate and verify every retained dump and never hide unsuccessful deletion.

**C. Dedicated backup repository service.** Stronger separation; adds a service and operational cost.
1. Specify an idempotent create/list/verify/delete contract and migration mapping for existing dump objects.
2. Implement a dedicated repository owning immutable object keys and transactional metadata; adapt backup and automation callers.
3. Import existing recoverable backups and dual-read catalogs during a bounded cutover; preserve old objects until verified.
4. Fault-test client retries, repository restarts, duplicate submissions and partial retention work.
5. Cut over only after object counts, checksums and recorded addresses reconcile and service recovery is demonstrated.

**D. Managed database backup/PITR with application control adapter.** Less custom backup storage; provider coupling and retention cost.
1. Determine required retention/RPO and validate managed backup coverage for the authoritative database.
2. Implement application create/list/metrics adapters against actual managed backup identifiers and operation states.
3. Import/export legacy dumps into a supported recovery repository and map historical records; preserve any non-DB objects separately.
4. Test completed, pending and failed provider operations plus recovery from one managed backup.
5. Accept when application success means a verified managed recovery point, not merely a request acceptance, with auditable retention.

### D2 — Scheduled, correctly targeted backup

**A. Shared DB resolver and leased scheduler — recommended.** Keeps existing service; requires lease/observability work.
1. Establish a credential-free database identity check and the intended schedule/timezone.
2. Reuse the application's URL resolution for dump/restore; wire initialization into lifecycle and schedule through a durable single-owner lease.
3. Record scheduled runs, target identity, completion time and failure; migrate historical metrics to explicit unknown where no evidence exists.
4. Test preferred-variable-only, two distinct configured targets, restart and two-replica schedule contention in isolated databases.
5. Accept after one scheduled run targets the same database as the app, can be recovered, and stale-success alerts fire.

**B. Dedicated backup worker.** Separates process lifetime; introduces another worker.
1. Define authoritative DB identity and durable run ledger shared with the application.
2. Implement a worker using the same target resolver, durable schedule and retry/idempotency keys.
3. Route manual and automatic requests to that worker and migrate run history; remove duplicate in-process scheduling only after cutover.
4. Test worker termination, delayed schedules, repeated delivery and wrong-target configuration.
5. Accept after missed runs are recovered without duplicate retention effects and metrics reflect observed run history.

**C. Provider-native schedule with reconciliation.** Reduced scheduler code; provider dependence.
1. Select backup cadence and verify the provider resource corresponds to the running application's database.
2. Configure managed scheduled backups and implement a reconciler exposing real recovery points and failures.
3. Map manual backup requests and existing history to provider identifiers, maintaining recoverability of legacy dumps.
4. Exercise missed backup alerts, configuration drift and restore from a scheduled recovery point.
5. Accept when resource identity, last-success age and retained recovery points independently meet policy.

**D. External scheduler invoking an idempotent backup job.** Clear ownership; scheduler availability becomes a dependency.
1. Define a schedule owner, job identity and authoritative DB identity contract.
2. Implement idempotent job submission/run recording and target validation in the backup service.
3. Install a durable external schedule and backfill missed-run metadata, with exclusive ownership at cutover.
4. Test duplicate triggers, application downtime during trigger delivery and mismatched DB identities.
5. Accept when delayed triggers retry safely and monitoring proves scheduled recoverable output on the correct database.

### D3 — Safe, demonstrated restore

**A. Isolated logical restore with validation — recommended for current dump format.** Minimal format change; restore speed limits remain.
1. Define RPO/RTO acceptance, required tables/invariants and a disposable recovery database target.
2. Implement a controlled restore command using `psql -v ON_ERROR_STOP=1` and a clean target; use a transaction where the dump permits it.
3. Add checksum/version verification and a tested promotion/rollback procedure; never restore directly over the only authoritative database.
4. Test malformed SQL, constraint conflicts, truncated dumps and full recovery, measuring elapsed time and data invariants.
5. Accept only after a complete drill meets targets and any SQL failure prevents success/promotion.

**B. Custom-format dump and pg_restore pipeline.** Better selective/parallel recovery; changes backup format.
1. Benchmark representative database size and compatibility requirements.
2. Produce custom-format dumps and restore into a newly provisioned DB with `pg_restore --exit-on-error`, explicit dependency handling and validation.
3. Retain old SQL restores via a hardened compatibility path and catalog the format per backup.
4. Test parallel restore, corrupted archives, extension/version mismatches and rollback.
5. Accept after both retained old-format and new-format backups restore correctly within measured objectives.

**C. Managed PITR restoration.** Handles larger databases well; needs provider recovery operations.
1. Establish timestamp recovery goals and managed WAL/backup coverage.
2. Implement restore-to-new-instance orchestration, operation polling and target validation.
3. Add a reversible application DB cutover procedure and independent recovery for PDIM/file state.
4. Drill recovery before and after a known transaction boundary, then validate application invariants.
5. Accept on measured RPO/RTO and successful rollback, not provider status alone.

**D. Physical backup/WAL recovery service.** Strong control and scale; highest database-operations burden.
1. Verify PostgreSQL hosting permits physical backups/WAL access and select compatible tooling.
2. Implement encrypted base backups, continuous WAL archiving, checksums and isolated standby recovery.
3. Bootstrap recovery from a verified base backup and retain logical archives during transition.
4. Drill missing WAL segments, corrupt base backups and point-in-time promotion.
5. Accept after documented recovery can rebuild all required database state and meet measured objectives without original-host access.

### D4 — PDIM recovery integrity and durability

**A. Typed recovery errors plus durable recovery manifest — recommended.** Preserves PDIM API; changes recovery protocol.
1. Define new-instance versus existing-instance states and acknowledged-write-loss budget; inventory stream consumers and decide their durable versus explicitly ephemeral contract.
2. Persist checksummed snapshot/AOF generation manifests; distinguish absence from I/O, parse and replay errors; block failed recovery. Implement stream snapshot/load and mutation journaling for the durable contract, or route durable stream consumers to a separate durable authority.
3. Validate sequence continuity before publishing recovered state; quarantine corrupt generations. Export existing live stream entries and supported group/pending metadata into the selected authority before cutover, reconciling IDs and references.
4. Crash-test snapshot/AOF writes, corrupt artifacts, inject read/replay errors and verify stream entry/metadata recovery across the migration; measure acknowledged-write loss.
5. Accept only validated recovery or explicit blocked recovery, with measured RPO per supported type and stream consumer; never claim all-command durability while any durable stream dependency remains ephemeral.

**B. Transactional database-backed Redis state.** Removes custom snapshot authority; can increase command latency.
1. Inventory supported commands, atomicity and recovery generations; explicitly specify stream entries, IDs, trimming, and supported consumer-group/pending-state durability.
2. Implement command/state persistence transactionally in SQL with sequence IDs and snapshot caching, including the selected durable stream semantics rather than inheriting the AOF exclusion.
3. Import verified recovered non-stream state and export/import live stream state with metadata; dual-compare reads and switch authority only after reconciliation.
4. Test transactions across worker failure, concurrent stream/non-stream mutations, consumer acknowledgment recovery and interrupted imports.
5. Accept when acknowledged durable commands and required stream state survive crashes, unsupported semantics are explicit, and no corrupt import can become authoritative.

**C. Native durable Redis-compatible service behind the adapter.** Mature persistence; new operational dependency and compatibility testing.
1. Inventory actual command/Lua/stream consumers and choose a service whose persistence/replication guarantees cover their required stream entry and metadata semantics.
2. Implement routing, durable acknowledgment policy and health checks against that service while retaining the application-facing contract; explicitly distinguish any intentionally ephemeral consumers.
3. Export verified PDIM state and separately capture live streams excluded from snapshots; import entries/IDs and supported group/pending state with TTL fidelity, reconcile, and perform a bounded write handoff.
4. Test failover, persistence restart, stream replay/acknowledgment, queue scripts and session operations using the real service; verify interrupted migration recovery.
5. Accept after per-type command parity and measured durability/failover targets, including required stream state, preserving rollback data without claiming untested all-command durability.

**D. Replicated append-before-ack command journal.** Strong custom durability; highest complexity.
1. Specify commit quorum, replay determinism, fencing and snapshot rules; enumerate durable stream mutations and metadata, making any ephemeral contract explicit per consumer.
2. Journal each durable mutation, including the selected stream command set, before acknowledgment with checksums/sequence continuity; include stream state in recoverable snapshots and derive state from committed records.
3. Seed verified non-stream state plus a reconciled export of live streams and supported metadata at a fenced journal boundary; migrate instances to explicit recovery generations.
4. Test leader failure, torn writes, partitions, corrupted artifacts and stream replay/consumer acknowledgment across snapshot boundaries and migration.
5. Accept only committed-state recovery with measured per-type loss, required stream recovery and no writable instance after incomplete replay; document unsupported commands rather than promising universal durability.

### D5 — Recoverable deletion and honest storage accounting

**A. Transactional deletion outbox — recommended.** Fits current metadata model; adds a cleanup worker.
1. Inventory object/chunk references and define deletion idempotency and usage-accounting invariants.
2. Atomically tombstone objects and enqueue cleanup with chunk/node identities; retain records until physical deletion is confirmed.
3. Implement retriable reference release and per-node deletion progress; decrement usage only after confirmed physical outcomes.
4. Inject crashes between each metadata/physical step and test shared chunks and unavailable nodes.
5. Accept when retries converge, shared objects remain readable, and reported usage matches remaining bytes.

**B. Mark-and-sweep garbage collection.** Simpler foreground delete; delayed reclamation and scan cost.
1. Define object liveness, conservative grace period and a consistent metadata scan boundary.
2. Make foreground delete a durable tombstone; build a collector that derives unreferenced chunks from live manifests.
3. Rebuild reference/usage accounting from observed inventory and preserve suspect chunks until reconciled.
4. Test concurrent object creation, repeated collection, node outage and collector crash.
5. Accept when no live reference is swept and failed deletions remain visible in physical usage until reclaimed.

**C. Storage-node durable deletion jobs.** Distributes cleanup; requires node protocol changes.
1. Define per-node durable delete receipts and an idempotent operation identifier.
2. Have metadata service commit deletion intents and nodes persist/execute them before acknowledging deletion.
3. Track receipts centrally, finalize reference release and update capacity from confirmed node results.
4. Test duplicate jobs, lost acknowledgments, permanently unavailable nodes and node restart.
5. Accept when outstanding work survives all restarts and capacity never assumes unconfirmed deletion.

**D. Managed immutable blob lifecycle with manifest accounting.** Less bespoke chunk cleanup; changes storage architecture.
1. Evaluate object-store durability, versioning and lifecycle guarantees against fabric/dedup requirements.
2. Replace physical shard cleanup with immutable managed blob references and durable manifest tombstones.
3. Migrate objects and verify checksums before retiring old chunks; reconcile billing/physical usage separately from logical quota.
4. Test lifecycle delays, delete failures, shared references and interrupted migration.
5. Accept when deletion state is truthful, retained objects remain readable, and old storage is reclaimed through verified reconciliation.

### D6 — Durable session storage contract

**A. Await authoritative PG writes — recommended.** Straightforward consistency; adds DB latency/load.
1. Declare PG authoritative and define callback durability/error semantics.
2. Make PG helpers propagate errors; await commit for set/destroy/touch before success; update L1 only consistently with commit.
3. Treat PDIM as a versioned cache and migrate existing sessions with bounded compatibility reads.
4. Test process termination immediately after callback, PG outage, cross-worker reads and cache-write failure.
5. Accept when acknowledged changes are present on another worker and backing failure produces an explicit error.

**B. Durable PDIM authority with ordered fallback replication.** Preserves PDIM-first architecture; depends on D4.
1. Resolve D4 and specify required PDIM durability acknowledgments and fallback ordering.
2. Await durable PDIM session mutation and maintain an ordered durable replication log for PG fallback.
3. Add per-session versions/tombstones so fallback cannot serve older mutations during promotion.
4. Test PDIM outage between commit/replication, worker restart and out-of-order replication.
5. Accept only when acknowledged state survives failure and fallback promotion respects committed versions.

**C. Transactional dual-store session coordinator.** Stronger multi-store recovery; higher coordination cost.
1. Define a single ordered session ledger and desired commit/quorum policy.
2. Persist mutation intents, versions and tombstones transactionally, then apply idempotently to both stores.
3. Make callbacks and reads depend on committed ledger state; reconcile preexisting unversioned sessions.
4. Test one-store failure, replayed intents, concurrent touches and interrupted deletion.
5. Accept when no successful callback represents an uncommitted mutation and recovery converges deterministically.

**D. Established durable session backend/store implementation.** Less custom code; migration and dependency cost.
1. Choose a maintained PostgreSQL or durable Redis session store with documented callback semantics.
2. Integrate it as the authority and replace custom fire-and-forget writes with awaited store operations.
3. Migrate session serialization/TTL and perform a bounded dual-read cutover without claiming a cache is durable.
4. Test restart continuity, multi-worker reads, expiration, deletion and backend outages against the real backend.
5. Accept when its measured durability matches the contract and fallback cannot hide write failures.

### D7 — Lossless queue startup recovery

**A. Targeted quarantine, normal stalled recovery — recommended.** Minimal architecture change; requires bounded scanning.
1. Define valid job schemas and archive representative malformed metadata safely.
2. Replace bulk waiting drain with ID-specific quarantine/removal after revalidation; let normal stalled-job handling recover valid work.
3. Run recovery before worker activation or coordinate scans with active workers; preserve payload and reason for every quarantined job.
4. Test eleven malformed jobs mixed with valid jobs, concurrent enqueue, rolling worker restarts and lock renewal.
5. Accept when every valid submitted job remains queued/completed/retriable and no fresh work is lost to startup cleanup.

**B. Versioned queues and controlled migration.** Separates incompatible legacy jobs; temporary operational complexity.
1. Inventory job schemas and define old/new queue ownership.
2. Create a versioned queue with validated submissions and an explicit legacy migration worker.
3. Move valid jobs idempotently, quarantine invalid records, and retire the old queue only after reconciliation.
4. Test restart during migration, duplicate moves and simultaneous producers.
5. Accept when source/target ledgers account for every job and legacy cleanup cannot touch new work.

**C. SQL job ledger/outbox as authority.** Strong reconciliation; database cost and added dispatcher.
1. Assign stable job IDs and define durable submission/completion states.
2. Commit jobs to SQL before dispatch; use BullMQ as transport with idempotent execution and acknowledgment.
3. Import pending jobs and implement re-dispatch for missing transport entries; replace destructive startup cleanup.
4. Test broker loss, queue reset, duplicate delivery and worker death after side effects.
5. Accept when all incomplete ledger jobs recover without duplicate committed effects or silent loss.

**D. Durable workflow engine migration.** Rich recovery semantics; broadest implementation effort.
1. Map retention workflows, timers, retries and side effects into stable workflow identities.
2. Implement durable workflows with idempotent activities and explicit retry/dead-letter policies.
3. Transfer pending job payloads using a cutover ledger and reconcile every old queue item.
4. Test worker restart, activity timeout, malformed inputs and migration interruption.
5. Accept when valid workflow instances resume across failure and all old queue work is accounted for.

### D8 — Reproducible schema evolution

**A. Repair an ordered migration chain — recommended.** Strong auditability; requires careful historical reconciliation.
1. Compare shared schema, every SQL migration and sanitized schema-only snapshots from each environment under an approved separate process.
2. Build a validated migration ledger including post-0005 changes; preserve custom SQL/data migrations and use transactional application where supported.
3. Baseline existing databases explicitly; replace masked push execution with fail-propagating migration application and pre/post checks.
4. Test fresh install, each supported upgrade baseline, partial failure and rollback/forward repair on isolated PostgreSQL.
5. Accept only a complete ordered history and matching constraints/indexes/data invariants, with nonzero exit on failed migration.

**B. Flyway/Liquibase-style versioned SQL authority.** Mature ledger/checksums; tooling migration overhead.
1. Inventory SQL/schema differences and select a single migration authority.
2. Convert checked-in evolution into immutable checksummed migrations with explicit preconditions.
3. Baseline each existing database after parity review; wire rollout to fail on checksum or SQL errors.
4. Test clean creation, repeat runs, divergent history and interrupted execution.
5. Accept when drift is detected before rollout and all supported baselines reach the intended schema reproducibly.

**C. Reviewed desired-state SQL plans with independent ledger.** Retains schema-as-code; custom release process.
1. Capture versioned desired schema and enumerate custom SQL/data changes that schema diff cannot infer.
2. Generate environment-specific SQL plans offline, review destructive changes and bind plans to precondition fingerprints.
3. Apply approved plans with strict error propagation, record checksums/results and validate postconditions.
4. Test drift, partially applied plans, large-table indexes and expand/contract compatibility.
5. Accept only when plan fingerprints match, data invariants pass and the recorded result is independently reproducible.

**D. New baseline database with logical migration/cutover.** Useful for badly divergent histories; highest migration burden.
1. Define authoritative schema and data-mapping rules from all existing SQL changes.
2. Build a new database from a validated complete baseline and implement change capture/backfill.
3. Reconcile row counts, relationships, constraints and indexes; rehearse reversible application cutover.
4. Test concurrent writes during backfill, replication lag, rejected rows and rollback.
5. Accept only after complete reconciliation and a demonstrated cutover, retaining an auditable migration ledger for future changes.

## Examined-surface inventory and unexamined boundaries

Examined current sources: application storage provider and fixed/generated key contracts; storage upload tracking/compensation and soft-delete routes; backup service/routes/automation consumer; DB configuration and schema tooling; migration journal and later SQL inventory; PDIM client/broker selection; local PDIM persistence routines; external PDIM Redis manager/store recovery and AOF scheduling; external fabric deletion and metadata indexes; retention queue startup; distributed-lock helper and its actual consumer search; PG/PDIM session store implementations. Searches also identified `tests/unit/pdim-command-contract.test.ts`; no test result is inferred from its existence.

Historical checking: inspected `reports/production-readiness-current.md` as a navigation aid only, then checked current code. Task proposals/cancellations were not treated as evidence. Current upload routes already compensate for tracking failures (`server/routes/storage.ts:263-274,469-477`), current storage deletion propagates provider failure (`server/services/storageService.ts:139-156`), and external PDIM has AOF persistence (`external/pdim/artifacts/api-server/src/redis/store.ts:325-329`). This report does not re-list historical “no tracking,” “delete always succeeds,” or “no persistence” claims as current blockers. The standalone `withSchedLock` get/delete implementation has no discovered current external consumer; it was not promoted to an active production finding solely from its comment.

Unexamined/verification boundaries: no live DB schema, migration history, stored backup objects, configured provider identity, secrets, managed PITR settings, external deployment version, actual scheduler execution, storage inventory, Redis/PDIM crash results, or RPO/RTO measurements were accessed. The complete 2,000-line PDIM client command surface, every fabric erasure/compression/replication algorithm, all queue families, and every application storage consumer were not exhaustively verified. Local PDIM's best-effort file persistence was inspected but its active production selection was not established, so no extra production defect is inferred from that implementation alone. Authentication policy, media semantics and deployment packaging are outside this assigned audit. All implementation/testing steps above require subsequent authorized work; this audit changed only this report.