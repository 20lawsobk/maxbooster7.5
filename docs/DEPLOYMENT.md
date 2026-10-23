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
