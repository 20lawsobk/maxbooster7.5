# Production-readiness execution roadmap

## Evidence boundary
The existing React/Vite client calls Express routes, which delegate to service
modules, PostgreSQL/Drizzle, BullMQ/Redis, PDIM and supervised MaxCore processes.
Social and advertising share posting infrastructure; the beat loop promotes
marketplace listings through advertising dispatch and reconciles genuine sales.
Music workflow templates have their own dispatch and execution-log layer.
Publishing is configured as `bash build.sh` followed by `bash start.sh`, not
merely the package build command. Server bundles externalize dependencies.

## Ordered work and acceptance gates
1. Workflow execution integrity: replace descriptive-only success with owned,
   durable work; prove idempotency, publishing consent and error propagation.
   Unsupported provider operations must fail explicitly, not claim success.
2. Generation: trace awareness and checkpoint conditioning; retain unknown-token
   and quality validation. Prove actual supported requests generate usable
   outputs before enabling dependent autonomous work.
3. Distribution: retire active LabelGrid consumers, preserve historical IDs,
   route new work through authenticated Too Lost and its submission repository.
4. Deployment: inspect destructive scripts, then rehearse the configured
   build/restore/start in isolation. Verify external imports and readiness.
5. Cross-cutting gates: tenant/auth tests, input validation, credential
   redaction, replay-safe payments, worker recovery and load measurements.

Each patch requires focused tests, rereading changed source, and an appropriate
type/build check. A blocked stage is not a passed gate. No live posting, payments,
releases or production publishing are authorized by this roadmap.

## Initial demonstrated blockers
- Countdown, bio-update and caption-repurpose handlers return descriptions
  rather than their advertised side effects.
- ScriptAgent requires checkpoint generation even when awareness is present;
  runtime evidence includes the unknown-token rejection.
- Distribution modules still import LabelGrid and its SDK remains a dependency.
- No current complete publishing rehearsal has been established.

This document is an execution order, not a production-readiness certification.

## Sophia checkpoint — 2026-10-19

**Baseline:** `main` at `5a17a90878a5c05b4d09a9793d1393090f86af53`. This is
a point-in-time inspection, not a full-codebase certification. Proposed work is
isolated on `sophia/2026-10-19-public-build-integrity`. The earlier NO-GO
release decision in `PRODUCTION_READINESS.md` remains in force.

### Evidence and architecture inventory

- Root `package.json` requires Node >=22.12, npm 10.9.4, `npm run build`
  invokes `scripts/build-production.mjs`, and `npm run start` invokes
  `scripts/start-production.mjs`. The publishing shell flow is separate.
- `client/src/pages` has 71 immediate entries, including nested modules.
  These have **not** all been individually reviewed. The server contains
  routes, services, workers, and database integration; native, mobile, desktop,
  and external MaxCore/PDIM subsystems need independent release evidence.
- Five GitHub Actions YAML workflows exist. Runs for `main` include a failed
  CI run (`39151672500`) and failed Test Runner (`39254706805`).
  Desktop/mobile workflow failures were also reported. Failure causes must
  be diagnosed from reliable logs; the connector did not supply job logs in
  this inspection. PR descriptions claim billing-related CI limitations,
  but that is not independent proof of the cause of each failed run.
- At the checkpoint there are nine open PRs (#84, #85, #87-#93), including
  overlapping changes to authentication, registration, billing, and pages.
  Review/rebase and verify them; do not bulk-merge or reimplement blindly.
- The `main` branch API reports `protected: false`; the repository rulesets
  endpoint returned an empty list. Release branch protections and required
  status checks therefore need operator review before enabling merges.

### Updated risk-ranked work ledger

| Priority | Area, evidence and status | Acceptance / stop condition |
| --- | --- | --- |
| P0 | CI and release protection — **confirmed failures / gate absent**. `.github/workflows/ci.yml`, Test Runner, branch settings. | Diagnose failed workflows, restore runnable CI, require passing Type Check, Lint, Unit, Integration, Build, Security; enforce protected release branch and reviewer approval. A queued or skipped workflow is not a pass. |
| P0 | Build and startup parity — **partial fix proposed, runtime unverified**. `scripts/start-production.mjs`, `script/build.ts`, `build.sh`, `start.sh`, `Dockerfile.prod`, `docs/npm-build-start.md`. | Verify Node and lockfile reproducibility, `npm run build`, artifact integrity, `npm run start`, `/api/health` and `/api/ready`, shutdown/restart, and an isolated publishing pack/restore. Do not execute destructive publishing against shared data. |
| P0 | Authentication, tenant and payment integrity — **PRs open / needs verification**. `server/routes.ts`, auth services, registrations, notifications, support, developer API; #86 landed, #88-#92 remain open. | Test denial paths, tenant isolation, rate limits, consent atomicity, UTF-8 password policy, Stripe webhooks, idempotency and duplicate charging with disposable accounts and payment fixtures. Rebase conflicting PRs and rerun all affected checks before merge. |
| P0 | Secrets and vulnerabilities — **needs verification**. `.env.example`, runtime config, dependency trees, upload endpoints. | Secret scanning without emitting values; zero untriaged high/critical reachable vulnerabilities; confirm outbound credentials/PII are redacted and permissions are least-privilege. |
| P1 | Durable workflows, distribution and external models — **needs verification**. `server/workers`, publishing, social, MaxCore, PDIM, LabelGrid legacy consumers. | Prove owner-scoped durable work, retries/idempotency, truthful unsupported-provider errors, model outputs, payouts/distribution receipts, and recoverable failures. |
| P1 | Web page-by-page and API contract coverage — **inventory started, not reviewed**. `client/src/pages`, `server/routes`, `shared`, `tests`. | Record each route, permissions, API dependencies, error/empty/loading states, accessibility, and at least one appropriate regression test per fix. Do not mark unopened pages reviewed. |
| P1 | Operations and recovery — **needs verification**. `migrations`, sidecars, health endpoints, backup/restore. | Isolated migration forward/rollback, backup+restore checksums, alerting, structured-redacted logs, deployment rollback and load/soak measurements. |

### First safely scoped patch in this branch

1. `scripts/start-production.mjs`: inventory frontend build output when
   recording the completion contract, and fail startup when extra public
   assets or unsupported filesystem entries appear after compilation.
2. `tests/npm-build-start-contract.test.mjs`: add regression assertions for
   unexpected `dist/public/untracked.html` and a symlink entry (with a
   Windows guard), followed by confirmation the valid fixture is accepted.
3. Checks performed: current source inspected, GitHub commits created on an
   isolated feature branch, and changes read back. **No npm tests, lint,
   production build, production start, or live readiness probe executed in
   this GitHub-only session.** CI results for this patch are pending.

### Next execution order

First obtain green, current-commit CI and a disposable startup/readiness
smoke; then review and safely integrate the overlapping auth/payment PRs;
next implement per-page route contracts in batches; finally validate the
full operations and disaster-recovery gates. Keep `NO-GO` until independently
observed release-critical evidence supports a different verdict.
