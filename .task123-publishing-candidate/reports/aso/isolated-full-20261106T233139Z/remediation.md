# Actionable test and feature repair guide

Generated: `2026-11-07T00:12:54.398900+00:00`. Status: **needs_work**. Unresolved tasks: **3669**.

Observations come from the linked reports. A likely diagnosis is not a confirmed application bug. Run the reproduction command in the prepared isolated environment, complete the listed actions, and retain fresh proof. Generating this guide does not change a test result.

| Task kind | Unresolved |
| --- | ---: |
| assertion_failure | 15 |
| blocked_check | 20 |
| command_failure | 11 |
| coverage_gap | 2535 |
| coverage_scope_gap | 174 |
| feature_acceptance_gap | 834 |
| mapping_gap | 20 |
| missing_evidence | 1 |
| missing_execution | 33 |
| skipped_case | 26 |

## Failure families

| Observed boundary / diagnosis | Tasks |
| --- | ---: |
| Source-defined behavior lacks the required execution/feature evidence. | 3365 |
| The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred. | 191 |
| This check was not executed under its required conditions. | 79 |
| The source inventory cannot resolve the actual target of a dynamic registration or interaction. | 20 |
| A required capability/readiness condition was not established. | 6 |
| Authorization/session setup and application behavior must be distinguished before changing this expectation. | 4 |
| The deletion test imports a source module that is absent from this checkout. | 2 |
| An immutable historical diagnostic record or its referenced bytes no longer verifies. | 1 |
| The master run cannot establish this verification boundary without its expected artifact. | 1 |

Machine details, exact uncovered source locations and platform acceptance IDs are in `remediation.json`. The platform register provides every page/API/control requirement; these tasks link to it without copying the entire register.

This Markdown shows the first 100 prioritized tasks of 3669. The JSON retains every task and every uncovered location. Use `--markdown-limit N` to expand this review without changing the machine results.

## `repair-00be17a09cfff36c` — Invalid feature evidence links

Source: `platform-register.json`. Group: `platform`. Kind: `missing_evidence`. Priority: **P0**.

Observed: The platform register rejected one or more proposed proof links.

Diagnosis (**confirmed**): The master run cannot establish this verification boundary without its expected artifact.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Run the owning catalog/coverage/platform/test producer using the documented isolated master command.
2. Retain a complete machine report, its current source identity and real process exit. Do not treat an absent report as zero failures.

Proof needed:

- The expected artifact exists, parses and describes an actually executed producer.

## `repair-bb62e2523080d74c` — commerce

Source: `scripts/testing/run-all.py`. Group: `commerce`. Kind: `command_failure`. Priority: **P1**.

Observed:  'failures': 0, 'errors': 0, 'skipped': 0} outbound-commerce: passed {'tests': 7, 'failures': 0, 'errors': 0, 'skipped': 0} outbound-membership-auth: passed {'tests': 1, 'failures': 0, 'errors': 0, 'skipped': 0} outbound-services-webhooks: passed {'tests': 8, 'failures': 0, 'errors': 0, 'skipped': 0} outbound-stripe-resource-ownership.test: passed {'tests': 1, 'failures': 0, 'errors': 0, 'skipped': 0} outbound-stripe-test-transport.test: passed {'tests': 3, 'failures': 0, 'errors': 0, 'skipped': 0} outbound-topup-journal: passed {'tests': 3, 'failures': 0, 'errors': 0, 'skipped': 0} provider-only-preferences.test: passed {'tests': 10, 'failures': 0, 'errors': 0, 'skipped': 0} settlement-dispute-hold-postgres.test: passed {'tests': 21, 'failures': 0, 'errors': 0, 'skipped': 0} subscription-authority-postgres.test: passed {'tests': 16, 'failures': 0, 'errors': 0, 'skipped': 0} legacy-beat: passed {'tests': 14, 'failures': 0, 'errors': 0, 'skipped': 0} provider-report-summary: passed None

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/commerce.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-commerce.py --output /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/commerce
```

Required changes:

1. Reproduce the exact named case in scripts/testing/run-all.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-39c444bc268a2fd2` — inbound-registration.test

Source: `tests/payment-processing/inbound-registration.test.mjs`. Group: `commerce`. Kind: `command_failure`. Priority: **P1**.

Observed: failureType: 'testCodeFailure'   error: |-     Build failed with 1 error:     server/routes.ts:28:36: ERROR: No matching export in "registration-mock:./services/governancePolicyService.js" for import "isAdminOnlyMode"   code: 'ERR_TEST_FAILURE'   stack: |-     failureErrorWithLog (./node_modules/esbuild/lib/main.js:1752:15)     ./node_modules/esbuild/lib/main.js:1211:25     runOnEndCallbacks (./node_modules/esbuild/lib/main.js:1592:45)     buildResponseToResult (./node_modules/esbuild/lib/main.js:1209:7)

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `inbound-registration.test.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-registration.test.mjs
```

Required changes:

1. Reproduce the exact named case in tests/payment-processing/inbound-registration.test.mjs using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a9c6f727174d042d` — registration checkout, verification, and account creation execute payment/plan gates before any account write

Source: `tests/payment-processing/inbound-registration.test.mjs`. Group: `commerce`. Kind: `assertion_failure`. Priority: **P1**.

Observed: Build failed with 1 error:server/routes.ts:28:36: ERROR: No matching export in &quot;registration-mock:./services/governancePolicyService.js&quot; for import &quot;isAdminOnlyMode&quot;

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/commerce/inbound-registration.test.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-registration.test.mjs
```

Required changes:

1. Reproduce the exact named case in tests/payment-processing/inbound-registration.test.mjs using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e9ca68ef654083c1` — coverage

Source: `scripts/testing/run-all.py`. Group: `coverage`. Kind: `command_failure`. Priority: **P1**.

Observed: [23:42:19.077] INFO (114580): [PDIM] Auto multiplier: 4 (clusterWorkers=1 × ceil(cpuCores=8/2)=4) — AIMD init=1ms, floor=6ms (1workers×6ms, combined≤167 req/s), ZPOPMIN gap=4ms [23:42:21.296] WARN (114635): Mobile token remove error:     err: {       "type": "Error",       "message": "database unavailable",       "stack":           [ACCESSOR]     } [23:42:21.310] WARN (114635): Push unsubscribe error:     err: {

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/coverage.txt`.

Reproduce from the documented working directory:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.platform.config.ts --reporter=junit --reporter=/home/runner/workspace/scripts/testing/coverage-outcome-reporter.mjs --outputFile=/home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/root/coverage-unit.junit.xml
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7a7070bc901258d0` — http

Source: `scripts/testing/run-all.py`. Group: `http`. Kind: `command_failure`. Priority: **P1**.

Observed:  "9b66d8805eea33cfdbfcfff5bfe5c9a439de91c6efba3ca6866c65987e976812",       "external/maxcore/artifacts/ai-training-server/ai_model/analytics.py": "6e20ef9133b98c809f20d346f4062e86f38267cb19c53a70eec98f6a9ec4891e"     }   },   "applicationRoutes": "pass",   "registrationPolicyFixture": "public registration explicitly enabled in disposable PostgreSQL after default seeding",   "workerWorkingDirectory": "temporary fixture; source root used only for module/test resolution",   "trustedProxy": "Exact loopback fixture origin receives TLS forwarding and stable TEST-NET identities per file/client; hostile probes use distinct clients, production blocking and rate limits retained",   "exitCode": 1,   "signal": null,   "testProcessCleanup": {     "tracked": 40,     "remaining": []   },   "appProcessCleanup": {     "tracked": 15,     "remaining": []   },   "analyticsProcessCleanup": {     "tracked": 1,     "remaining": []   },   "postgresCleanup": "pass",   "finishedAt": "2026-11-07T00:07:18.603Z" }

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/http.txt`.

Reproduce from the documented working directory:

```sh
node scripts/testing/integration-browser.mjs
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2bc535afe5a68095` — MaxCore local subsystem (real spawn) > launches real Python and storage and reports provider-aware generation readiness

Source: `tests/integration/maxcore-local-supervisor.integration.test.ts`. Group: `http`. Kind: `assertion_failure`. Priority: **P1**.

Observed: expected false to be true // Object.is equality

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/isolated-full-20261106T233139Z/integration-browser/http/integration.junit.xml`.

Reproduce from the documented working directory:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C MAXBOOSTER_PYTHON="${MAXBOOSTER_PYTHON:-python3}" node scripts/testing/integration-browser.mjs tests/integration/maxcore-local-supervisor.integration.test.ts
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-13b56480f2b7eba2` — node

Source: `scripts/testing/run-all.py`. Group: `node`. Kind: `command_failure`. Priority: **P1**.

Observed: passed: tests/source-capsule-admission.test.mjs passed: tests/startup-health.test.mjs passed: tests/storage-chunk-shared-postgres.test.mjs passed: tests/storefront-canonical-links.test.mjs passed: tests/subscription-checkout-isolated.test.mjs passed: tests/testing/coverage-coordinate-contract.test.mjs passed: tests/testing/coverage-outcome-reporter.test.mjs passed: tests/testing/coverage-provenance.test.mjs passed: tests/tls-toolchain-consumer.test.mjs passed: tests/unit/aiMediaResourceContracts.test.mjs passed: tests/unit/client-account-boundary.test.mjs passed: tests/unit/client-auth-beta-contracts.test.mjs passed: tests/unit/client-offline-readiness.test.mjs passed: tests/unit/client-sync-receipts.test.mjs passed: tests/unit/client-worker-handoff.test.mjs passed: tests/unit/generated-pdim-isolated.mjs passed: tests/unit/production-simulation-policy.test.mjs passed: tests/vite-development-entry.test.mjs passed: tests/vst3-binary-inspection.test.mjs passed: tests/web-ci-scope.test.mjs

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/node.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-node-suites.py --output /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/node --rust-toolchain /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1
```

Required changes:

1. Reproduce the exact named case in scripts/testing/run-all.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d0f59212bb570c09` — actual upgraded Puppeteer drives configured Chromium through owned loopback CDP

Source: `tests/maxcore-dev-dependency-security.test.mjs`. Group: `node`. Kind: `assertion_failure`. Priority: **P1**.

Observed: failureType: 'testCodeFailure'   error: 'Configured real Chromium is required'   code: 'ERR_ASSERTION'   name: 'AssertionError'   expected: true   operator: '=='   stack: |-     TestContext.<anonymous> (./tests/maxcore-dev-dependency-security.test.mjs:79:10)     Test.runInAsyncScope (node:async_hooks:214:14)     Test.run (node:internal/test_runner/test:1047:25)

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/node/tests__maxcore-dev-dependency-security.test.mjs.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-node-suites.py --file tests/maxcore-dev-dependency-security.test.mjs
```

Required changes:

1. Reproduce the exact named case in tests/maxcore-dev-dependency-security.test.mjs using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e183da2ed2e1e193` — actual patent generator renders valid Letter PDF using supplied local Chromium

Source: `tests/patent-pdf-runtime.test.mjs`. Group: `node`. Kind: `assertion_failure`. Priority: **P1**.

Observed: failureType: 'testCodeFailure'   error: 'Configured Chromium required; absence is not a pass'   code: 'ERR_ASSERTION'   name: 'AssertionError'   expected: true   operator: '=='   stack: |-     TestContext.<anonymous> (file://./tests/patent-pdf-runtime.test.mjs:30:10)     Test.runInAsyncScope (node:async_hooks:214:14)     Test.run (node:internal/test_runner/test:1047:25)

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/node/tests__patent-pdf-runtime.test.mjs.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-node-suites.py --file tests/patent-pdf-runtime.test.mjs
```

Required changes:

1. Reproduce the exact named case in tests/patent-pdf-runtime.test.mjs using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9b1a3ee247480f92` — load_test.py

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: failed: engine profile 1/1; process exit 1; contention=None

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/operations/load_test.py.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-17c3e36753b7fd24` — operations

Source: `scripts/testing/run-all.py`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: passed scripts/testing/platform-register.py failed external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py passed evaluations/maxcore-quality/verify_types.py passed evaluations/maxcore-quality/verify_evidence.py passed scripts/maxcore-isolated-recovery-acceptance.py failed tests/payment-processing/run.mjs

Diagnosis (**needs_verification**): An immutable historical diagnostic record or its referenced bytes no longer verifies.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/operations.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-operations.py --python /nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 --output /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/operations
```

Required changes:

1. Read the first missing file/hash assertion and obtain the matching recorded diagnostic artifact generation.
2. Verify fixture/checkpoint/media SHA-256 identities without changing the historical expected digest to fit newer bytes.
3. If this verifier is intentionally historical, retain it with its required archive and label it as such; add a separate current-generation verifier rather than treating old quality evidence as current.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c5a0ce7f22451539` — run.mjs

Source: `tests/payment-processing/run.mjs`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: failureType: 'testCodeFailure'   error: |-     Build failed with 1 error:     server/routes.ts:28:36: ERROR: No matching export in "registration-mock:./services/governancePolicyService.js" for import "isAdminOnlyMode"   code: 'ERR_TEST_FAILURE'   stack: |-     failureErrorWithLog (./node_modules/esbuild/lib/main.js:1752:15)     ./node_modules/esbuild/lib/main.js:1211:25     runOnEndCallbacks (./node_modules/esbuild/lib/main.js:1592:45)     buildResponseToResult (./node_modules/esbuild/lib/main.js:1209:7)

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/isolated-full-20261106T233139Z/operations/run.mjs.txt`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/run.mjs
```

Required changes:

1. Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.
2. Compare the successful 80-page authentication fixture with this test's request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.
3. If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b3c48b7fd7f62605` — page-line-coverage

Source: `scripts/testing/run-all.py`. Group: `pages`. Kind: `command_failure`. Priority: **P1**.

Observed: stdout | tests/coverage/client-page-render.test.ts > client page route and user-flow coverage > ../../client/src/pages/Advertisement.tsx renders for its authenticated role [ERROR] ❌ WebSocket error: ErrorEvent {   [Symbol(kTarget)]: PageTestWebSocket {     _events: [Object: null prototype] {       open: [Function],       message: [Function],       close: [Function],       error: [Function]     },     _eventsCount: 4,

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/page-line-coverage.txt`.

Reproduce from the documented working directory:

```sh
env MAXBOOSTER_PAGE_COVERAGE_DIR=/home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/page-coverage npm run test:pages:coverage
```

Required changes:

1. Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.
2. Compare the successful 80-page authentication fixture with this test's request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.
3. If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ed8e196aa02be592` — pages

Source: `scripts/testing/run-all.py`. Group: `pages`. Kind: `command_failure`. Priority: **P1**.

Observed: {   "decision": "FAIL",   "evidence": {     "accessProfile": "public launch explicitly enabled for this disposable registration/browser fixture; admin-only policy is covered by separate contract tests",     "capacityAdmission": "not_run",     "schemaGeneration": "pass",     "postgres": "pass",     "appProcess": "started",     "cpuProfile": "not_requested",     "health": "not_run",

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/pages.txt`.

Reproduce from the documented working directory:

```sh
node scripts/testing/page80-acceptance.mjs
```

Required changes:

1. Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.
2. Compare the successful 80-page authentication fixture with this test's request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.
3. If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-cde8f4d5669f51b9` — test_num_streams_env_var_default

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1] died before completing backend init (exit codes: {0: 1, 1: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c5d9008640e993b3` — test_runtime_frees_intermediate_tensors_but_not_outputs

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1, 2, 3] died before completing backend init (exit codes: {0: 1, 1: 1, 2: 1, 3: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ce52e6a2f473dbb3` — test_runtime_num_streams_does_not_change_numeric_result

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1, 2, 3] died before completing backend init (exit codes: {0: 1, 1: 1, 2: 1, 3: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d890e5ef7937ecea` — test_runtime_vram_oom_propagates_through_graph_run

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1] died before completing backend init (exit codes: {0: 1, 1: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b753eee39360fbe1` — test_shm_arena_grows_across_runs_and_stays_correct

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1, 2, 3] died before completing backend init (exit codes: {0: 1, 1: 1, 2: 1, 3: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-bd5d7b521194fbf0` — test_shm_fast_path_used_and_correct_for_large_tensors

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1, 2, 3] died before completing backend init (exit codes: {0: 1, 1: 1, 2: 1, 3: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-02d0ad13eff2be41` — test_shm_shutdown_unlinks_arena_no_leak

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1] died before completing backend init (exit codes: {0: 1, 1: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a685c4b749faf0ba` — test_smi_reports_backend_memory_and_streams

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: LaneProcessPool: worker process for lane(s) [0, 1, 2] died before completing backend init (exit codes: {0: 1, 1: 1, 2: 1})

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d953b6c95cfbbfed` — test_image_bytes_identical_across_processes

Source: `external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: RuntimeError: render subprocess (PYTHONHASHSEED=0) failed: Traceback (most recent call last):   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/__init__.py", line 24, in <module>     from . import multiarray   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/multiarray.py", line 11, in <module>     from . import _multiarray_umath, overrides ImportError: libz.so.1: cannot open shared object file: No such file or directory  [+38 more lines; full report in element

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__ai_model__rta__test_render_contracts.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a579516ffee04231` — test_awareness_telemetry_imports_without_torch

Source: `external/maxcore/artifacts/ai-training-server/tests/test_awareness_readiness_cold_import.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: AssertionError: 1 != 0 : awareness telemetry cold import failed: Traceback (most recent call last):   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/__init__.py", line 24, in <module>     from . import multiarray   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/multiarray.py", line 11, in <module>     from . import _multiarray_umath, overrides ImportError: libz.so.1: cannot open shared object file: No such file or directory  [+38 more lines; full report in e

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/external__maxcore__artifacts__ai-training-server__tests__test_awareness_readiness_cold_import.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_awareness_readiness_cold_import.py
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-dcc08600d01fcec6` — python

Source: `scripts/testing/run-all.py`. Group: `python`. Kind: `command_failure`. Priority: **P1**.

Observed: s.py passed   tests/testing/test_page_certification_runner.py passed   tests/testing/test_platform_plan.py passed   tests/testing/test_python_coverage_environment.py passed   tests/testing/test_python_factory_mounts.py passed   tests/testing/test_platform_evidence.py passed   tests/testing/test_python_runner_snapshot_exclusion.py passed   tests/testing/test_readiness_catalog.py passed   tests/testing/test_remediation.py passed   tests/testing/test_python_runner_scheduling.py passed   tests/testing/test_summary_results.py passed   tests/testing/test_untracked_suite_discovery.py passed   tests/testing/test_verified_remediation_scope.py passed   tests/testing/test_repo_test_scope.py passed   tests/urllib3-security-paths.py passed   tools/sophia-agent-runner/tests/test_sophia.py passed   tests/testing/test_report_progress.py {"summary": {"passed": 140, "failed": 4, "timeout": 0, "skipped": 2, "blocked": 19, "empty": 0}, "counts": {"tests": 1898, "failures": 11, "errors": 0, "skipped": 17}}

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/isolated-full-20261106T233139Z/orchestration/python.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-python-suites.py --python /nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 --coverage --coverage-gate --output /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/python --docs /home/runner/workspace/reports/aso/isolated-full-20261106T233139Z/python/suites.md
```

Required changes:

1. Reproduce the exact named case in scripts/testing/run-all.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-52beadf9cd9e5308` — test_real_native_writer_does_not_initialize_model_runtime

Source: `tests/test_awareness_native_import.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: AssertionError: 1 != 0 : Traceback (most recent call last):   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/__init__.py", line 24, in <module>     from . import multiarray   File "<repo>/.pythonlibs/lib/python3.12/site-packages/numpy/_core/multiarray.py", line 11, in <module>     from . import _multiarray_umath, overrides ImportError: libz.so.1: cannot open shared object file: No such file or directory  [+43 more lines; full report in element text]

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/isolated-full-20261106T233139Z/python/tests__test_awareness_native_import.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_awareness_native_import.py
```

Required changes:

1. Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.
2. Compare the successful 80-page authentication fixture with this test's request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.
3. If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-761120b343ef94b0` — Provider execution mode

Source: `tests/payment-processing/browser-fixture.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Provision the exact documented prerequisite: Invoked or imported by its owning test runner; do not run as a standalone test
2. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
3. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a580722c947ba8ba` — real Stripe test-mode checkout and PaymentIntent settle through production code in disposable SQL

Source: `tests/payment-processing/database-commerce.test.mjs`. Group: `commerce`. Kind: `skipped_case`. Priority: **P2**.

Observed: JUnit records this case as skipped; inspect its skip condition.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `reports/aso/isolated-full-20261106T233139Z/commerce/database-commerce.test.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only database-commerce.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
5. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6a5444c3e6fb05e4` — Provider execution mode

Source: `tests/payment-processing/inbound-real-stripe.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/inbound-real-stripe.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f66660c866104e5c` — Provider execution mode

Source: `tests/payment-processing/real-stripe-api.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/real-stripe-api.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4a923a25a6bf586c` — Provider execution mode

Source: `tests/payment-processing/real-stripe-topup.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/real-stripe-topup.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d51df19e254214a5` — Unexecuted source branches/functions

Source: `AI enhancements/AudioWorkletEngine.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 389 statements, 60 functions and 206 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/AudioWorkletEngine.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b40c99f2997911b7` — Unexecuted source branches/functions

Source: `AI enhancements/ServerVideoGenerator.tsx`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 389 statements, 70 functions and 513 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/ServerVideoGenerator.tsx. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-70251518cddd20cb` — Unexecuted source branches/functions

Source: `AI enhancements/SocialMedia.tsx`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 747 statements, 240 functions and 845 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/SocialMedia.tsx. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-49d82def77acf5ea` — Unexecuted source branches/functions

Source: `AI enhancements/advancedVideoRendererService.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 359 statements, 35 functions and 279 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/advancedVideoRendererService.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a4aa212b56cdae6a` — Unexecuted source branches/functions

Source: `AI enhancements/audio-processor.js`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 71 statements, 3 functions and 27 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/audio-processor.js. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f1422db8f7a6c7f2` — Unexecuted source branches/functions

Source: `AI enhancements/creativeModelService.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 304 statements, 60 functions and 343 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/creativeModelService.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3b41a9fff13b50a9` — Unexecuted source branches/functions

Source: `AI enhancements/maxcoreClient.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 112 statements, 15 functions and 100 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/maxcoreClient.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ca8aacb9f82dec9f` — Unexecuted source branches/functions

Source: `AI enhancements/musicVideoStudioService.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 68 statements, 11 functions and 62 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/musicVideoStudioService.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-186e8f7db007d1af` — Unexecuted source branches/functions

Source: `AI enhancements/socialMedia.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1495 statements, 162 functions and 1323 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: AI enhancements/socialMedia.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f1bc24b6d3d42863` — Maintained source file is missing from V8 coverage

Source: `_codemod_w1.cjs`. Group: `coverage`. Kind: `coverage_scope_gap`. Priority: **P2**.

Observed: The repository source inventory includes this JavaScript/TypeScript file, but the current Istanbul report has no matching file record.

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Reproduce the exact named case in _codemod_w1.cjs using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-53f2a64a137ca73a` — Maintained source file is missing from V8 coverage

Source: `awareness layer/ContentGenerationAwarenessService.ts`. Group: `coverage`. Kind: `coverage_scope_gap`. Priority: **P2**.

Observed: The repository source inventory includes this JavaScript/TypeScript file, but the current Istanbul report has no matching file record.

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Reproduce the exact named case in awareness layer/ContentGenerationAwarenessService.ts using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1656659423bef93b` — Maintained source file is missing from V8 coverage

Source: `awareness layer/industryMonitorService.ts`. Group: `coverage`. Kind: `coverage_scope_gap`. Priority: **P2**.

Observed: The repository source inventory includes this JavaScript/TypeScript file, but the current Istanbul report has no matching file record.

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Reproduce the exact named case in awareness layer/industryMonitorService.ts using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-524d7ebd68c11976` — Maintained source file is missing from V8 coverage

Source: `awareness layer/musicIndustryContextFilter.ts`. Group: `coverage`. Kind: `coverage_scope_gap`. Priority: **P2**.

Observed: The repository source inventory includes this JavaScript/TypeScript file, but the current Istanbul report has no matching file record.

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Reproduce the exact named case in awareness layer/musicIndustryContextFilter.ts using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1bb27ab523dacdb2` — Unexecuted source branches/functions

Source: `built-in plugins dsp/BasePlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 26 statements, 8 functions and 2 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/BasePlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-677afc0f670b76db` — Unexecuted source branches/functions

Source: `built-in plugins dsp/ChorusPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 94 statements, 22 functions and 26 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/ChorusPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-761f1f7cd04181cd` — Unexecuted source branches/functions

Source: `built-in plugins dsp/CompressorPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 89 statements, 18 functions and 36 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/CompressorPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7a89f79f2e76b07b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DeEsserPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 211 statements, 24 functions and 44 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DeEsserPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-aab5497efd6e8a4a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DelayPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 210 statements, 18 functions and 59 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DelayPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-79af72fc06db466b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DistortionPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 134 statements, 13 functions and 45 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DistortionPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06e052bcdfbfba0d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DynamicEQPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 296 statements, 39 functions and 95 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DynamicEQPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ea7d805b8d623771` — Unexecuted source branches/functions

Source: `built-in plugins dsp/EQPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 86 statements, 14 functions and 40 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/EQPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1e1c26122a46db5c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/FlangerPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 96 statements, 10 functions and 16 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/FlangerPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7f9b4039c27dcf6b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/PhaserPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 181 statements, 17 functions and 42 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/PhaserPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-8fa8de547e05ab5f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/ReverbPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 147 statements, 24 functions and 38 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/ReverbPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0d63e4a199fd2032` — Unexecuted source branches/functions

Source: `built-in plugins dsp/VocoderPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 298 statements, 46 functions and 91 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/VocoderPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-bde841a15f64c4a4` — Unexecuted source branches/functions

Source: `built-in plugins dsp/index.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/index.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6ac2217b11110e0f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-3d-panner.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-3d-panner.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b024a0c76bd33782` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-acid-bass.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-acid-bass.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f6df29903c7a0b77` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-analog-polysynth.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-analog-polysynth.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-22ce8de2ccf6ae28` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-analog-synth.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-analog-synth.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-077f33d4a41285bb` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-auto-filter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-auto-filter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a06cd132f74be1ba` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-808.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-808.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1937295664108dfe` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-acid.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-acid.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-94673edc4870bfb8` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-electric.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-electric.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f1f1f9caeca1764b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-fm.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-fm.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-dab0aa3f7785719d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-moog.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-moog.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-314c16b893f6c7aa` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-reese.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-reese.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e2425693a9c736ff` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-slap.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-slap.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-99c2b680587d6b06` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-sub.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-sub.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c1a987e469400749` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-upright.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-upright.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9ce5b46264aa3a1a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-wobble.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-wobble.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2634a123fc793d8c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-407803f10edb0a72` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-chimes.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-chimes.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4822f81461cee708` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-churchbell.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-churchbell.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6333116f4b174f5e` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-crystal-bowl.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-crystal-bowl.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-5eb32bdf4017efbe` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-gong.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-gong.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-da72032812ff2f82` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-handbell.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-handbell.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a55ca7ca3775348c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-steeldrum.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-steeldrum.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2d99c1b17fd3e5f0` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-tibetan.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-tibetan.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1dda9cd440dcd089` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-tubular.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-tubular.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-dcb2bcbd9f1b1b9b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-binaural.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-binaural.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-342de8a5e2e83708` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bitcrusher.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bitcrusher.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3ad1040e74ea9493` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-cornet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-cornet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f6a6ef93db3c557f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-ensemble.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-ensemble.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-427041bce37d4686` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-euphonium.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-euphonium.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7e2835b9d22b408b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-flugelhorn.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-flugelhorn.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-78f353dddf4c6bc7` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-frenchhorn.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-frenchhorn.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-38adc12901e59d1c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-muted-trumpet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-muted-trumpet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1c8d51831ce125f4` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-alto.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-alto.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-112a2c04cae33f34` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-bari.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-bari.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-14fc9024466d341d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-soprano.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-soprano.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-74be596cdd2ef21a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-tenor.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-tenor.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-af033cf7d546cd8c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-trombone.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-trombone.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06789b75a34b60c3` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-trumpet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-trumpet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ad0178d3aa5c6902` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-tuba.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-tuba.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-44658d9cdef67c5d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brickwall-limiter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brickwall-limiter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06941fa00546d439` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus-classic.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus-classic.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b0523166962343a8` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus-dimension.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/aso/isolated-full-20261106T233139Z/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus-dimension.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.
