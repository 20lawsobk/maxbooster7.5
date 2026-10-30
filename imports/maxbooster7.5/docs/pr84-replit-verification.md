# PR 84 workspace application and verification

## Source and scope

- Repository: `20lawsobk/maxbooster7.5`.
- Clean workspace baseline and GitHub main observed: `38feb89fb2ba71b53498289a8f4b2e2c9b0778ed`.
- Imported PR head: `552d49dc605c093b54ebc16bc2d7db63653072c5`.
- All 36 changed PR files were copied from verified GitHub blobs after confirming
  the workspace matched the PR base and had no tracked or untracked user changes.
- No Git merge, remote write, production publication, migration execution, email,
  release submission or payment was performed.
- Both application workflows were already stopped and were left stopped:
  startup can activate workers against the shared application database.

## Additional local corrections

Imported files:

```text
.github/workflows/test-runner.yml
dns-os/package-lock.json
docs/sophia-agent-evaluation.md
eslint.config.js
migrations/0006_dmca_workflow_contract.sql
migrations/meta/_journal.json
package-lock.json
package.json
replit.md
script/sync-subsystem-dependencies.sh
scripts/pre-launch-check.ts
scripts/typecheck-in-chunks.mjs
server/automation-system.ts
server/index.ts
server/routes/auth.ts
server/routes/distribution.ts
server/routes/dmca.ts
server/services/autonomousService.ts
server/services/distributionPlatformService.ts
server/services/distributionService.ts
server/services/dmcaRules.ts
server/services/dmcaService.ts
server/services/kycService.ts
server/services/musicWorkflowAutomationService.ts
server/services/releaseScheduler.ts
server/services/statusPageService.ts
server/types/express.d.ts
shared/schema.ts
tests/deployment-contracts.cjs
tests/unit/distribution-platform-service.test.ts
tests/unit/distribution-provider-contract.test.ts
tests/unit/dmca-rules.test.ts
tests/unit/dmca-schema-contract.test.ts
tests/unit/pre-launch-check.test.ts
tests/unit/release-scheduler-honesty.test.ts
tls-proxy/package-lock.json
```

All imported files were compared with the verified PR blobs after application.
Only the six implementation/test files for the local corrections below differ.
The additional CI gate test is `tests/unit/ci-required-gates.test.ts`.

- Generic dispatch lookup referenced an undefined `storage` and an unimplemented
  `getDistroDispatch` method. It now explicitly reports unavailable. Existing
  historical release-status endpoints were not removed.
- DMCA rules reject invalid clocks, future uncertain-send timestamps and unknown
  email states; a persisted revocation overrides a stale active-strike flag.
- CI preflight cannot fall through to the shared Neon database. Remote CI
  `DATABASE_URL` targets require `CI_DATABASE_ISOLATED=true`; loopback and the
  `postgres` service hostname are accepted. This declaration is not proof of
  isolation: operators must provision a genuinely disposable database.
- Added an executable regression suite for the actual CI summary shell gate,
  covering failed, cancelled, skipped, selected-suite and scheduled-suite results.

## Commands and results

Tests used a cleared environment with test-only PostgreSQL URLs pointing to
`127.0.0.1:1`, not the configured shared database.

| Check | Result |
|---|---|
| `vitest run tests/unit/{ci-required-gates,distribution-platform-service,distribution-provider-contract,dmca-rules,dmca-schema-contract,pre-launch-check,release-scheduler-honesty,release-countdown-workflow,caption-repurpose-workflow,auto-posting-recovery,release-workflow-honesty}.test.ts --maxWorkers=1` | 79 tests passed in 11 files |
| `node --test tests/deployment-contracts.cjs tests/runtime-artifact-gates.test.mjs` | 18 tests passed |
| `GOMAXPROCS=2 GOMEMLIMIT=768MiB tsgo -p tsconfig.server.json --noEmit` | Passed after fixing the undefined dispatch storage reference |
| Same native checker with `tsconfig.client.json` | Passed |
| `eslint ... --quiet` over changed application modules, prelaunch scripts, schema and new/modified local regression tests | Passed |
| `timeout -k 5s 100s eslint . --quiet` | Timed out, exit 124; not a pass |
| `timeout -k 10s 150s ... vitest run --maxWorkers=1` | Timed out, exit 124; observed environment/readiness failures and database-dependent fixture setup failure |
| `vite build --outDir /tmp/pr84-client-build` with cleared environment | Passed |
| `esbuild server/index.ts scripts/retained-pdim-recovery-worker.ts server/cluster.ts server/diffusion-gateway/index.ts server/computeSizing.ts --bundle --platform=node --target=node22 --format=esm --packages=external --outdir=/tmp/pr84-server-bundles` | All five entry bundles compiled |
| `python_runtime/bin/python -m unittest discover -s external/maxcore/artifacts/ai-training-server/ai_model/model -p test_generation_regressions.py` with isolated environment and explicit subsystem PYTHONPATH | 12 checkpoint-free tests passed; intentional model-unavailable case logged an exception |
| Isolated `npm ci --dry-run --ignore-scripts --no-audit --no-fund` | Failed peer resolution without repository policy |
| Same dry run with `--legacy-peer-deps`, matching existing `.npmrc` | Passed; **not** an actual clean installation |
| Comparison of root, DNS and TLS lockfiles with baseline | Zero package version or integrity-hash changes; resolved HTTP registry hosts are `registry.npmjs.org` |
| `git diff --check` | Passed |

## Security and external CI

- Dependency scanner completed: 76 moderate findings, zero reported high/critical.
  Findings require applicability review and remediation; this is not a clean audit.
- SAST returned `incomplete: true` with no results: not a security pass.
- Privacy scan failed with `HOUNDDOG_SCHEMA_MISMATCH`: not a security pass.
- GitHub PR check statuses are red. The Type Check annotation explicitly says
  the job was not started because of a GitHub account billing lock. Do not
  attribute that unexecuted job to an application compile error or suppress CI.
- An obsolete local Git remote contains embedded credentials. Revoke the
  credential and replace that remote URL; never print it in diagnostics.

## Release blockers and unverified behavior

- The additive DMCA migration is present but **not applied**. Schema-backed
  legal workflows require authorized migration review and an isolated database
  rehearsal before activation.
- Counter-notice creation still uses a lookup followed by insert. Concurrent
  creation/send recovery requires database-backed verification and stronger
  serialization before legal-workflow readiness can be claimed.
- No fresh supported-serving/checkpoint quality evaluation was run. The 12
  MaxCore unit tests do not prove real generation quality or serving readiness.
- PR behavior intentionally makes unsupported automations, generic distribution,
  scheduled publishing and unsupported payouts unavailable rather than pretending
  they ran. It does not implement those missing integrations.
- Historical LabelGrid reads/legal handling remain, including their dependency.
  A fresh restored-capsule external-import check is still required.
- Full `bash build.sh` → capsule restore → `bash start.sh` was not run; the shell
  build has destructive cleanup and external installation/upload paths. The safe
  bundle builds and artifact fixture tests are not substitutes for that rehearsal.
- Full test/lint gates, fresh installation with lifecycle scripts, browser/API
  E2E, and production readiness remain unverified.

## Rollback

The baseline commit above and imported-head file list identify the code changes.
Reverse only this PR's file changes plus the explicitly listed local corrections,
preserving subsequent edits. No database rollback is needed because no migration
was applied. Do not use a destructive whole-workspace reset.

**Verdict:** PR code applied, focused validation passed, production sign-off blocked.
