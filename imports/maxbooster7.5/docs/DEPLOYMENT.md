# Deployment and operations

Current entrypoints are defined by `package.json`, `.replit`, `build.sh`,
`start.sh` and `script/deployment/`. Documentation describes their contracts;
it does not establish the state of a running deployment.

## Development and ordinary production compilation

Use Node 22 (at least 22.12) and the pinned npm 10.9.4 for the root checkout:

```sh
npm ci
npm run dev
```

The development command invokes `scripts/start-dev.sh`, which validates the
port contract and owns its local service lifecycle. Do not start an unrelated
Redis daemon on port 6379 as a substitute for the application's PDIM state.

The ordinary production commands are:

```sh
npm run build
npm run start
```

The build compiles the frontend and runtime entries and records source/artifact
hashes. Start validates that record before handing off to `start.sh`. Runtime
resources and services must also be provisioned; `dist` alone is not a complete
installation. Read [npm-build-start.md](npm-build-start.md) for exact boundaries.

The default model mode is `live-awareness`. Its model registry, candidate bundles
and training audit are private runtime state under `MAXCORE_MODEL_STATE_DIR`,
which the supervisor defaults to `models` beneath `MAXCORE_PRIVATE_STATE_DIR`
(or `~/.local/state/maxcore`). These files are separate from replaceable PDIM
application capsules and require durable attachment/recovery. Missing qualified
state remains a generation-readiness failure; rebuilding source cannot create it.

Git LFS is required only by explicit `MAXCORE_SERVING_RELEASE=legacy` checkpoint
preparation. The default release packager requires no legacy checkpoint and
excludes `model.corrupt`. An LFS budget error therefore does not block default
live-awareness packaging. See the imported [live-learning runtime contract](../external/maxcore/artifacts/ai-training-server/ai_model/training/LIVE_LEARNING.md).

Chunk uploads use a private shared staging directory and PostgreSQL advisory
locks so requests can alternate between workers on the Reserved VM. The default
is `~/.local/state/maxbooster/chunk-uploads`; `STORAGE_CHUNK_STAGING_DIR` can select
another absolute path. Every worker must use the same directory and database.
Directories must belong to the service with mode 0700, files use 0600, and
symlinked paths are refused. Keep this state outside public media and release
capsules. Different hosts require an explicitly shared filesystem; the local
implementation does not provide distributed storage by itself.

Staging reserves at most 1 GiB globally and 500 MiB per user, with 128 active
sessions globally and four per user. Normal staging expires after 24 hours;
completed receipts retain at most the latest 128 responses for that interval.
An interrupted completion with an unknown storage outcome remains reserved.
A retry reconciles a matching committed owner/hash/session tracking record;
otherwise inspect the recorded object and tracking outcome before releasing the
claim. Cancellation cannot discard an in-flight completion or prove an unknown
write failed. This favors explicit reconciliation over duplicate object writes.

Root npm installation does not install the independent imported MaxCore/PDIM
pnpm workspaces. Explicitly provision their locked packages using pinned pnpm
10.26.1 and disabled lifecycle scripts. With packages already cached, synchronize
using `SUBSYSTEM_INSTALL=1 bash script/sync-subsystem-dependencies.sh`. Ordinary
builds verify those trees and fail rather than silently downloading tools.
Keep all dependency locks; there is no supported tar stub or lock-deletion repair.

## Configured publishing

The tracked `.replit` deployment invokes `bash build.sh`, then `bash start.sh`.
The build delegates to the guarded deployment bootstrap/executive; its cleanup,
packing and restoration are separate from an ordinary npm build. Do not execute
destructive packing in the development checkout or infer successful publication
from a GitHub push. The owner-defined target is a Replit Reserved VM; historical
scaled tests do not measure that production VM's capacity.

`.prepared-release` is optional tooling, not a dependency of this configured
Publish path. See [prepared-production-releases.md](prepared-production-releases.md).
The legacy `npm run deploy` points to an absent `scripts/deploy.ts`; use the
configured host workflow rather than treating that script as operational.

Desktop/mobile packages, store uploads and multi-application workflows are
excluded from this web/API readiness scope. Their statuses are not substitutes
for verification of the actual web runtime.

## Configuration and service authority

- Public application: local port 5000, externally mapped according to the host
  port contract. Keep sidecars private.
- Canonical PDIM: local loopback port 5556, used for Redis-compatible state and
  storage through the application's real clients. Remote `STORAGE_*` credentials
  are not an automatic requirement for this local topology.
- MaxCore: the local supervisor owns its imported API and Python processes.
  Running/model-loaded health is different from qualified generation capability.
- Database: inspect the configured target before any operation. The application
  prefers `NEON_DATABASE_URL` and supports its documented `DATABASE_URL` fallback.
  Never assume a development label means a disposable database.
- Session/provider configuration: use environment secret bindings and `.env.example`.
  Do not copy credentials into source, logs or release notes.

Schema changes, migrations, restores and acceptance writes must target explicit
isolated fixtures or separately authorized environments. Keep retained backups
and rehearse restoration before a shared-data migration. Do not run blanket SQL
updates to clear worker state or remove live PDIM ownership locks.

## Verification and recovery

Use `npm run check`, `npm run lint`, `npm run test:ci`, production dependency
audits and the relevant isolated integration/consumer tests. Keep build/compiler
jobs separate from resource-sensitive queue timing tests on small hosts.

`/api/health` establishes HTTP liveness. `/api/ready` must pass the real subsystem
and unified-awareness checks; a homepage or health 200 is not readiness. An AI
503 may represent boot/crash, connectivity, stale awareness, or an unavailable
qualified generation candidate. Diagnose the actual reported reason.

Exercise authentication/session/CSRF, owner isolation, payment replay and
idempotency, worker recovery, retained storage/database restore, graceful shutdown,
and cold restored-payload startup. Record revision, runtime, fixture boundaries,
exit codes and latency measurements. Test fixtures do not prove real delivery,
settlement or provider-side credential changes. See the current continuation
report and [LIVE_VERIFICATION_RUNBOOK.md](LIVE_VERIFICATION_RUNBOOK.md).
