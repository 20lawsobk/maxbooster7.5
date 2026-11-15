# Page hardening convergence evidence — 2026-10-17

## Later convergence: age-16 enrollment and Distribution completion

After the original results below, additional age-policy and Distribution patches
were implemented. Fresh checks on that later working tree:

- `node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 --retry=0 tests/unit/auth-page-age-policy.test.ts tests/unit/auth-page-contracts.test.ts tests/unit/checkout-subscription-page-contracts.test.ts tests/unit/distribution-draft-flow.test.ts tests/unit/distribution-completion-contracts.test.ts`
  — exit 0, **110 passed / 5 files**, 13:51:21, 9.85s.
  Initial convergence had 108 passes and 2 failures because the checkout harness
  replaced the newly imported age helper with its generic UI proxy. Loading the
  actual shared helper corrected the harness; no application validation bypass.
- `timeout 180s node_modules/.bin/tsgo --noEmit -p tsconfig.server.json`
  and the equivalent `tsconfig.client.json` command — both exit 0.
- The same bounded ordinary `npm run build` command recorded below — exit 0,
  Vite 1m14s, all runtime bundles generated.
- Current `validateBuild(process.cwd())` — exit 0.
- Development workflow restart succeeded. Readiness initially returned 503
  during route registration and model startup, then **HTTP 200 / status ok**.
  Logs confirmed 71/71 model tensors loaded and the Digital GPU backend.
- `/register` screenshot rendered DOB and the 16-year minimum. One unspecified
  resource 404 remains in browser logs; no full registration/browser acceptance
  is claimed.

Temporary logs: `/tmp/age-distribution-convergence.log`,
`/tmp/age-server-types.log`, `/tmp/age-client-types.log`,
`/tmp/age-distribution-build.log`, `/tmp/age-readiness.json`.
Existing accounts are unchanged. Dormant SSO/SCIM provisioning primitives remain
outside this public-enrollment patch and need eligibility review before exposure.
No isolated production startup or live Google/Stripe acceptance was performed.

Inspected Git HEAD: `84331d7b9`. Results apply to the working tree with the page
and backend patches, not the committed HEAD alone. No production-ready claim.

## Observed checks

1. `node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 tests/unit/project-backend-mutations.test.ts tests/unit/project-backend-client-contracts.test.ts tests/unit/dashboard-projects-page-regressions.test.ts tests/unit/royalty-and-project-settings.test.ts tests/unit/checkout-subscription-page-contracts.test.ts tests/unit/marketplace-storage-read-failures.test.ts tests/unit/authentication-boundary.test.ts tests/unit/auth-page-contracts.test.ts tests/unit/pricing-policy-page-render.test.ts tests/unit/onboarding-update-validation.test.ts tests/unit/refund-request-persistence.test.ts`
   - Exit 0; **151 passed, 11 files passed**, 23.82s, started 13:25:19.
   - `/tmp/page-convergence-tests.log` (temporary).
2. `timeout 180s node_modules/.bin/tsgo --noEmit -p tsconfig.server.json`
   - Exit 0, no diagnostics; `/tmp/page-server-typecheck.log`.
3. `timeout 180s node_modules/.bin/tsgo --noEmit -p tsconfig.client.json`
   - Exit 0, no diagnostics; `/tmp/page-client-typecheck.log`.
   - These are native compiler checks, not execution of the manifest's `npm run check`.
4. `DEPLOY_PACK=0 SUBSYSTEM_INSTALL=0 NODE_OPTIONS=--max-old-space-size=2048 GOMEMLIMIT=512MiB GOGC=50 timeout 240s npm run build`
   - Exit 0. Vite completed in 53.29s; all runtime entry bundles built.
   - `/tmp/page-production-build.log`. Ordinary compile only; no publishing,
     capsule pruning, dependency installation or runtime provisioning.
5. `node --test tests/deployment-contracts.cjs tests/runtime-artifact-gates.test.mjs`
   - Exit 0; **18 passed, 0 failed, 0 skipped, 0 cancelled**, 4.58s.
   - `/tmp/page-artifact-contract-tests.log`.
6. `node --input-type=module -e 'import {validateBuild} from "./scripts/start-production.mjs"; validateBuild(process.cwd()); console.log("Current build artifact/input contract: PASS")'`
   - Exit 0; current artifacts matched their recorded build inputs.
7. `node --max-old-space-size=512 node_modules/.bin/eslint client/src/components/auth/AuthProvider.tsx client/src/lib/authenticationBoundary.ts server/lib/onboardingUpdate.ts`
   - Exit 0, no output. Scoped lint only, **not full-repository lint**.
8. Development workflow restarted successfully after the batch.
   - Final preview `/api/ready`: HTTP 200, `status: "ok"`.
   - Logs showed real Python weights loaded and Digital GPU warm-up successful.
   - Not evidence of isolated production startup or generation-quality acceptance.

## Earlier failures and verification limits

- Checkout's initial harness run: 8 passed, 16 failed. Harness repairs were
  subsequently included in the successful 151-test convergence run.
- Storage extraction tests initially failed because ORM helpers were absent
  from the harness. Real query-building helpers and exact injected-error
  assertions corrected it; six storage tests passed in convergence.
- One lint attempt lost its workspace connection; later bounded scoped lint
  passed. Some shell commands timed out without results; not counted as passes.
- Browser: login 200 → authoritative session check 200 → private Dashboard
  rendered. Two-tab/logout/re-login did **not** finish: module-load failures,
  browser-worker disconnect and memory pressure interrupted verification.
  Headless retry was unable to finish; no workspace-resolvable browser driver
  was available under the no-install constraint.
- OOM counter increased from 2 to 3. Orphaned test recording, an orphaned model
  process and duplicate agent TypeScript analysis consumed substantial memory.
  A stale DNS child also caused a port conflict and was terminated so its
  current supervisor could own the service. Recovery progress is now logged.
- No fresh `npm run start` isolated fixture, complete publishing pack/restore
  rehearsal, full lint, full test suite, or complete security scan in this batch.
- No real payment/release/message action or migration was initiated for tests.

## Remaining local work and acceptance gaps

- Distribution legacy draft hydration, track metadata/upload and submission
  completion; private-media delivery and actual calendar publishing.
- Auth session revocation visibility, OAuth/shared account boundaries, password
  contract, consent/age policy and registration partial-failure recovery.
- Actual PostgreSQL concurrency/receipt rollback, noncooperating project child
  writers, job lifecycle and existing orphan-data recovery remain unverified.
- Remaining routed pages and rendered child panels are enumerated separately in
  `route-inventory.md`; bounded fixes are not exhaustive page certification.
- Real provider/sandbox acceptance, operational refunds and unsupported
  analytics/escrow/domain readiness require further work, not success claims.
- Age 13 versus 16 and approved entitlement discrepancies need authoritative
  product/legal decisions. Missing local fixture work is not an external
  infrastructure or credential blocker.

**Verdict: NO-GO for whole-platform certification.** Concrete patches and the
checks above are verified; the broader task remains unfinished.
