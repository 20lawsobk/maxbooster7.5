# Current hardening evidence — 2026-10-16

## Status

**Not production-certified.** Preview bucket cutover and the ordinary npm
production build are verified. Actual production startup and disposable
publishing pack/restore remain unfinished local verification, not demonstrated
external credential blockers. No publication or production migration occurred.

## Concrete changes

- Bucket journal, snapshot, recovery, persistence and command-batching modules
  under `server/lib/pdimBucket*`; live owner integration in
  `server/lib/localPdimServer.ts`; async recovery export integration in
  `server/services/backup/pdimRecoveryBackupService.ts`.
- Lazy snapshot serialization in `server/lib/pdimSnapshotJson.ts`, avoiding
  whole-store eager string allocation.
- Authorized archive/verification and offline migration operators in
  `scripts/archive-pdim-staging.mjs` and `scripts/migrate-pdim-bucket.ts`.
  Original local snapshot/journals retained; only verified staging copies removed.
- Shutdown drains committed journal work without initiating another full
  snapshot. Pending snapshot publication cancels before HEAD replacement.
  Listener admission closes before queue drain. Startup can wait once for an
  expiring lease; a live owner renewing its lease still blocks takeover.
- `package.json`: broken `build:full` reference to nonexistent security-fix
  script replaced by read-only audit followed by build; `build:prod` delegates
  to build without pruning the workspace.
- `ConnectedAccountsManager.tsx`: ten supported individual icon entrypoints
  instead of the full icon barrel. Exact public type declarations preserved
  through `client/src/types/simple-icon-entrypoints.d.ts`.
- Added/updated focused bucket, snapshot, recovery, build-contract and selective
  icon regression tests. Updated obsolete static build assertions to inspect
  the real modular builder, startup validator and restored capsule gates.

## Observed checks

| Command / check | Observed result |
| --- | --- |
| `timeout 240s env NODE_OPTIONS=--max-old-space-size=2048 GOMEMLIMIT=512MiB GOGC=50 npm run build` | Exit 0. Nested API, Vite and server runtime bundles built. |
| Same build with 1024 MB heap, before and after icon import change | Both exit 1, Vite heap exhaustion. Not passes. |
| `validateBuild(process.cwd())` imported from `scripts/start-production.mjs` | Exit 0, current generated artifact/input hashes accepted. |
| `tsgo --noEmit --project tsconfig.client.json --incremental false` | Exit 0, with 120s timeout and resource environment below. |
| `tsgo --noEmit --project tsconfig.server.json --incremental false` | Exit 0, same environment. Preview terminated during this check; OOM counter increased. |
| `vitest run --config vitest.config.ts` with six migration/operator test files | 27 passed. |
| Latest journal + persistence Vitest regression run | 11 passed, 0 failed. |
| `node --test tests/npm-build-start-contract.test.mjs` | 7 passed, 0 failed/skipped. |
| `node --test tests/selective-brand-icons.test.mjs` | 1 passed; ten icons resolve through 11 inputs including the test entry. |
| `node --test tests/deployment-contracts.cjs tests/runtime-artifact-gates.test.mjs` | 18 passed, 0 failed/skipped. These are contracts, not full publishing rehearsal. |
| `timeout 90s node --import tsx tests/pdim-bucket-cloud-smoke.ts --confirm-isolated-bucket-writes` | Exit 0: real bucket HTTP owner write/restart/recovery/export, no local durable files; fixture objects removed. |
| Targeted ESLint on bucket modules, local owner, recovery test and icon declarations | Exit 0. Not full lint. |
| Public preview screenshot | Landing page rendered; not authenticated-flow verification. |
| Latest `/api/ready` after restart | HTTP 200, status ok, awarenessReady true. |
| Dependency scanner | 0 critical/high, 72 moderate; findings need exposure triage. |
| Static scanner / privacy scanner | Incomplete / timeout, respectively. Not clean passes. |

Typecheck environment: `GOMEMLIMIT=512MiB GOGC=30
NODE_OPTIONS=--max-old-space-size=768`. These are soft/runtime-specific limits,
not proof that total concurrent memory use is bounded. Do not repeat full
typechecks/security scanners alongside this preview workload.

Build evidence log:
`/tmp/replit-background-tasks/b9ea24d7-ba63-495c-a14a-28fd0588c7b6.log`.
Latest health capture: `/tmp/current-ready.json`.
Logs in `/tmp` are temporary, not durable release evidence.

## Remaining launch gates

1. Actual isolated `npm run start`, supported model runtime, readiness,
   clean shutdown/port release/restart; then configured shell pack/restore
   rehearsal and production-only dependency closure. Do not run destructive
   publishing scripts in the live checkout.
2. Active LabelGrid imports remain in distribution routes/services and the SDK
   remains a dependency. Preserve historical provider identifiers while
   retiring active integration paths.
3. Live ScriptAgent generation still reports checkpoint unknown-token rejection.
   Keep validation; do not substitute fabricated/template success.
4. Full security, full lint, broader tests, tenant/payment/webhook and critical
   authenticated business workflows remain unverified in this pass.
5. Preview PDIM bucket cutover does not migrate production storage, native Redis
   AOF or every other filesystem-backed subsystem. Retained original data must
   not be deleted under the narrower staging-file removal authorization.

Rollback must preserve newly committed bucket data. Do not switch back to the
pre-cutover local snapshot as if it were current. Code changes are separable;
storage rollback needs a verified export/recovery of current bucket state.
