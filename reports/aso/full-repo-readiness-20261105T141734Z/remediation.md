# Actionable test and feature repair guide

Generated: `2026-11-05T14:50:39.654327+00:00`. Status: **needs_work**. Unresolved tasks: **4475**.

Observations come from the linked reports. A likely diagnosis is not a confirmed application bug. Run the reproduction command in the prepared isolated environment, complete the listed actions, and retain fresh proof. Generating this guide does not change a test result.

| Task kind | Unresolved |
| --- | ---: |
| assertion_failure | 214 |
| blocked_check | 20 |
| command_failure | 13 |
| coverage_gap | 2467 |
| feature_acceptance_gap | 1177 |
| mapping_gap | 355 |
| missing_evidence | 1 |
| missing_execution | 214 |
| skipped_case | 14 |

## Failure families

| Observed boundary / diagnosis | Tasks |
| --- | ---: |
| Source-defined behavior lacks the required execution/feature evidence. | 3636 |
| The source inventory cannot resolve the actual target of a dynamic registration or interaction. | 351 |
| This check was not executed under its required conditions. | 248 |
| The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred. | 202 |
| A required capability/readiness condition was not established. | 14 |
| Authorization/session setup and application behavior must be distinguished before changing this expectation. | 14 |
| A required test or application dependency could not be imported. | 5 |
| The deletion test imports a source module that is absent from this checkout. | 2 |
| A browser descendant may still be writing the temporary profile during cleanup. | 1 |
| An immutable historical diagnostic record or its referenced bytes no longer verifies. | 1 |
| The master run cannot establish this verification boundary without its expected artifact. | 1 |

Machine details, exact uncovered source locations and platform acceptance IDs are in `remediation.json`. The platform register provides every page/API/control requirement; these tasks link to it without copying the entire register.

This Markdown shows the first 100 prioritized tasks of 4475. The JSON retains every task and every uncovered location. Use `--markdown-limit N` to expand this review without changing the machine results.

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

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/commerce.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-commerce.py --output /home/runner/workspace/reports/aso/full-repo-readiness-20261105T141734Z/commerce
```

Required changes:

1. Reproduce the exact named case in scripts/testing/run-all.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6d1d75bc602ee565` — beat-loop-lifecycle-postgres.test

Source: `tests/payment-processing/beat-loop-lifecycle-postgres.test.mjs`. Group: `commerce`. Kind: `command_failure`. Priority: **P1**.

Observed: failureType: 'testCodeFailure'       error: |-         Actual ASGI fixture exited: Traceback (most recent call last):           File "./tests/payment-processing/helpers-beat-media-asgi.py", line 24, in <module>             from ai_model.generation.live_serving import LiveServingModel           File "./external/maxcore/artifacts/ai-training-server/ai_model/generation/__init__.py", line 18, in <module>             from .technique import TechniqueProfile, extract_technique           File "./external/maxcore/artifacts/ai-training-server/ai_model/generation/technique.py", line 31, in <module>             import numpy as np         ModuleNotFoundError: No module named 'numpy'

Diagnosis (**confirmed**): A required test or application dependency could not be imported.

Evidence: `beat-loop-lifecycle-postgres.test.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only beat-loop-lifecycle-postgres.test.mjs
```

Required changes:

1. Read the exact missing module in the captured exception and map it to the owning package/lockfile.
2. Install Node dependencies from the root and imported workspace locks, or Python dependencies from scripts/testing/requirements.txt using the selected prepared interpreter.
3. Use npm ci; pnpm --dir external/maxcore install --frozen-lockfile; pnpm --dir external/pdim install --frozen-lockfile; or /path/to/prepared/python -m pip install -r scripts/testing/requirements.txt for the owning language.
4. If it is a first-party module, restore the source/export or correct the real import path; do not mock away the behavior under test.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c2ba33fdf46d96e2` — real Python ASGI synthesizes and delivers beat audio and poster into the SQL listing without a checkpoint

Source: `tests/payment-processing/beat-loop-lifecycle-postgres.test.mjs`. Group: `commerce`. Kind: `assertion_failure`. Priority: **P1**.

Observed: Actual ASGI fixture exited: Traceback (most recent call last):  File &quot;./tests/payment-processing/helpers-beat-media-asgi.py&quot;, line 24, in <module>    from ai_model.generation.live_serving import LiveServingModel  File &quot;./external/maxcore/artifacts/ai-training-server/ai_model/generation/__init__.py&quot;, line 18, in <module>    from .technique import TechniqueProfile, extract_technique  File &quot;./external/maxcore/ar

Diagnosis (**confirmed**): A required test or application dependency could not be imported.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/commerce/beat-loop-lifecycle-postgres.test.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only beat-loop-lifecycle-postgres.test.mjs
```

Required changes:

1. Read the exact missing module in the captured exception and map it to the owning package/lockfile.
2. Install Node dependencies from the root and imported workspace locks, or Python dependencies from scripts/testing/requirements.txt using the selected prepared interpreter.
3. Use npm ci; pnpm --dir external/maxcore install --frozen-lockfile; pnpm --dir external/pdim install --frozen-lockfile; or /path/to/prepared/python -m pip install -r scripts/testing/requirements.txt for the owning language.
4. If it is a first-party module, restore the source/export or correct the real import path; do not mock away the behavior under test.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e9ca68ef654083c1` — coverage

Source: `scripts/testing/run-all.py`. Group: `coverage`. Kind: `command_failure`. Priority: **P1**.

Observed: } [14:29:23.268] WARN (75228): Mobile token remove error:     err: {       "type": "Error",       "message": "database unavailable",       "stack":           [ACCESSOR]     } [14:29:23.281] WARN (75228): Push unsubscribe error:     err: {

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/coverage.txt`.

Reproduce from the documented working directory:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.platform.config.ts --reporter=junit --reporter=/home/runner/workspace/scripts/testing/coverage-outcome-reporter.mjs --outputFile=/home/runner/workspace/reports/aso/full-repo-readiness-20261105T141734Z/root/coverage-unit.junit.xml
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-171897d9232cfa52` — production API route registration over HTTP > mounts the social-post API and enforces authentication for anonymous visitors

Source: `tests/coverage/api-route-registration-http.test.ts`. Group: `coverage-contracts`. Kind: `assertion_failure`. Priority: **P1**.

Observed: Unexpected anonymous response: {"error":"Governance policy unavailable"}: expected 503 to be 401 // Object.is equality

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/root/coverage-unit.junit.xml`.

Reproduce from the documented working directory:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C CI=1 npx vitest run --config vitest.platform.config.ts tests/coverage/api-route-registration-http.test.ts
```

Required changes:

1. Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.
2. Compare the successful 80-page authentication fixture with this test's request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.
3. If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7a7070bc901258d0` — http

Source: `scripts/testing/run-all.py`. Group: `http`. Kind: `command_failure`. Priority: **P1**.

Observed: "ephemeralDatabase": "pass",   "error": "Owned canonical analytics router did not start within 60s: Traceback (most recent call last):\n  File \"./tests/contracts/helpers-account-analytics-server.py\", line 14, in <module>\n    from fastapi import Depends, FastAPI, Header, HTTPException\nModuleNotFoundError: No module named 'fastapi'\n",   "analyticsProcessCleanup": {     "tracked": 1,     "remaining": []   },   "postgresCleanup": "pass",   "finishedAt": "2026-11-05T14:41:33.401Z" }

Diagnosis (**confirmed**): A required test or application dependency could not be imported.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/http.txt`.

Reproduce from the documented working directory:

```sh
node scripts/testing/integration-browser.mjs
```

Required changes:

1. Read the exact missing module in the captured exception and map it to the owning package/lockfile.
2. Install Node dependencies from the root and imported workspace locks, or Python dependencies from scripts/testing/requirements.txt using the selected prepared interpreter.
3. Use npm ci; pnpm --dir external/maxcore install --frozen-lockfile; pnpm --dir external/pdim install --frozen-lockfile; or /path/to/prepared/python -m pip install -r scripts/testing/requirements.txt for the owning language.
4. If it is a first-party module, restore the source/export or correct the real import path; do not mock away the behavior under test.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9b1a3ee247480f92` — load_test.py

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: failed: engine profile 1/1; process exit 1; contention=None

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/operations/load_test.py.txt`.

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

## `repair-3cc39a8c1b51d7a6` — maxcore-isolated-recovery-acceptance.py

Source: `scripts/maxcore-isolated-recovery-acceptance.py`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: FAILED: ./reports/maxcore-acceptance/isolated-recovery-load.json — RuntimeError: isolated child exited 1: Traceback (most recent call last):   File "./scripts/maxcore-isolated-recovery-acceptance.py", line 308, in <module>     child(Path(sys.argv[2]), int(sys.argv[3]))   File "./scripts/maxcore-isolated-recovery-acceptance.py", line 37, in child     from fastapi import FastAPI ModuleNotFoundError: No module named 'fastapi'

Diagnosis (**confirmed**): A required test or application dependency could not be imported.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/operations/maxcore-isolated-recovery-acceptance.py.txt`.

Reproduce from the documented working directory:

```sh
python3 scripts/maxcore-isolated-recovery-acceptance.py
```

Required changes:

1. Read the exact missing module in the captured exception and map it to the owning package/lockfile.
2. Install Node dependencies from the root and imported workspace locks, or Python dependencies from scripts/testing/requirements.txt using the selected prepared interpreter.
3. Use npm ci; pnpm --dir external/maxcore install --frozen-lockfile; pnpm --dir external/pdim install --frozen-lockfile; or /path/to/prepared/python -m pip install -r scripts/testing/requirements.txt for the owning language.
4. If it is a first-party module, restore the source/export or correct the real import path; do not mock away the behavior under test.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-17c3e36753b7fd24` — operations

Source: `scripts/testing/run-all.py`. Group: `operations`. Kind: `command_failure`. Priority: **P1**.

Observed: passed scripts/testing/platform-register.py failed external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py passed evaluations/maxcore-quality/verify_types.py passed evaluations/maxcore-quality/verify_evidence.py failed scripts/maxcore-isolated-recovery-acceptance.py passed tests/payment-processing/run.mjs

Diagnosis (**needs_verification**): An immutable historical diagnostic record or its referenced bytes no longer verifies.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/operations.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 scripts/testing/run-operations.py --python /nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 --output /home/runner/workspace/reports/aso/full-repo-readiness-20261105T141734Z/operations
```

Required changes:

1. Read the first missing file/hash assertion and obtain the matching recorded diagnostic artifact generation.
2. Verify fixture/checkpoint/media SHA-256 identities without changing the historical expected digest to fit newer bytes.
3. If this verifier is intentionally historical, retain it with its required archive and label it as such; add a separate current-generation verifier rather than treating old quality evidence as current.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-feb90a4711404c4c` — coverage-metrics-tests

Source: `scripts/testing/run-all.py`. Group: `pages`. Kind: `command_failure`. Priority: **P1**.

Observed: >       assert Path(plan["pythonPreflight"]["executable"]).resolve() == (ROOT / "python_runtime/bin/python3").resolve() E       AssertionError: assert PosixPath('/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3.12') == PosixPath('./python_runtime/bin/python3.12') E        +  where PosixPath('/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3.12') = resolve() E        +    where resolve = PosixPath('/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3.12').resolve E        +      where PosixPath('/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3.12') = Path('/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3.12') E        +  and   PosixPath('./python_runtime/bin/python3.12') = resolve() E        +    where resolve = (PosixPath('.') / 'python_runtime/bin/python3').resolve  tests/testing/test_page_certification_runner.py:84: AssertionError =========================== short test summary info ============================

Diagnosis (**needs_verification**): A required capability/readiness condition was not established.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/coverage-metrics-tests.txt`.

Reproduce from the documented working directory:

```sh
/nix/store/h097imm3w6dpx10qynrd2sz9fks2wbq8-python3-3.12.11/bin/python3 -m pytest -q tests/testing/test_coverage_metrics.py tests/testing/test_page_certification_runner.py
```

Required changes:

1. Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.
2. Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.
3. Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b3c48b7fd7f62605` — page-line-coverage

Source: `scripts/testing/run-all.py`. Group: `pages`. Kind: `command_failure`. Priority: **P1**.

Observed: stdout | tests/coverage/client-page-render.test.ts > client page route and user-flow coverage > ../../client/src/pages/Advertisement.tsx renders for its authenticated role [ERROR] ❌ WebSocket error: ErrorEvent {   [Symbol(kTarget)]: PageTestWebSocket {     _events: [Object: null prototype] {       open: [Function],       message: [Function],       close: [Function],       error: [Function]     },     _eventsCount: 4,

Diagnosis (**needs_verification**): Authorization/session setup and application behavior must be distinguished before changing this expectation.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/page-line-coverage.txt`.

Reproduce from the documented working directory:

```sh
env MAXBOOSTER_PAGE_COVERAGE_DIR=/home/runner/workspace/reports/aso/full-repo-readiness-20261105T141734Z/page-coverage npm run test:pages:coverage
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

Observed: {   "decision": "FAIL",   "evidence": {     "capacityAdmission": "not_run",     "schemaGeneration": "pass",     "postgres": "pass",     "appProcess": "pass",     "health": {       "status": 200,       "contentType": "application/json; charset=utf-8"

Diagnosis (**likely**): A browser descendant may still be writing the temporary profile during cleanup.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/orchestration/pages.txt`.

Reproduce from the documented working directory:

```sh
node scripts/testing/page80-acceptance.mjs
```

Required changes:

1. Use tests/helpers-browser-processes.mjs and the PID-identity owned-process tracker while the browser is running.
2. Stop only owned descendants before deleting the profile, and fail if any owned processes remain. Keep all UI/audio assertions.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c98f3f26b4f6b3a6` — ai_model.audio.test_audio_analysis

Source: `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_audio_analysis.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__audio__test_audio_analysis.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_audio_analysis.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/audio/test_audio_analysis.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d3694ae073a90324` — ai_model.audio.test_controls

Source: `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_controls.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__audio__test_controls.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_controls.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/audio/test_controls.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f982bb5a09b911eb` — ai_model.audio.test_media_facade

Source: `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_media_facade.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__audio__test_media_facade.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_media_facade.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/audio/test_media_facade.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c04add2e5b75722c` — ai_model.audio.test_short_duration

Source: `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_short_duration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__audio__test_short_duration.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_short_duration.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/audio/test_short_duration.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4a905892688769f5` — test_actual_kernel_numeric_ranking

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d005247a04cf0166` — test_all_domains_provenance_hash_and_immutable_copy

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0327c034478d004c` — test_clean_is_idempotent_after_nested_html_entity_decoding

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b4890f9953fbb9b6` — test_clean_reaches_a_fixed_point_after_all_sanitization_steps

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7fd480a501627b62` — test_concurrent_source_failures_keep_their_own_source_labels

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-5815e301cad60911` — test_contextual_headlines_and_unsupported_sources_do_not_become_peak_examples

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f91c77d187cd7ab4` — test_duplicate_full_content_does_not_amplify_training_weight

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e57a85c9005bb86d` — test_fenced_publication_error_is_safely_classified

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-927157f863fe6782` — test_full_content_top_engagement_within_source_domain_balance_and_policy_hash

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2d28e3edd0e26767` — test_hash_and_pointer_validation_on_restart

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-03a9196fcf761c75` — test_incomplete_keeps_previous_only_until_ttl

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-86eb7963a30f6492` — test_invalid_snapshot_reports_safe_failure_category

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a8951380915f1243` — test_ledger_full_body_preserved_and_stale_observations_excluded

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9f2a4e38361a6d6d` — test_lifecycle_idempotent_and_stops

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-317ad59410f76066` — test_malformed_optional_legacy_source_metadata_is_ignored

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ff36a1bca97764bf` — test_missing_domain_never_published

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6910fc53daa3a290` — test_nested_bind_restores_and_invalid_hash_is_rejected

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0695c33bf283b3cf` — test_no_empty_or_all_failed_rehashed_snapshot

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-acb16d344785961a` — test_optional_facade_context_and_bound_snapshot_revalidation

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-fb25c3805e3df407` — test_partial_source_observations_survive_incomplete_snapshot

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6e4b775338ec73db` — test_peak_selection_excludes_fake_origin_zero_and_irrelevant

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-62bceeff34329b6b` — test_publication_command_error_does_not_expose_exception_text

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c28f3c453e2bcf4c` — test_publication_failure_keeps_last_acknowledged_snapshot

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7b3f0e2f7730629f` — test_search_matrix_waits_for_a_valid_live_snapshot

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ddd0d5b89f57ba9e` — test_secondary_phrase_storage_failure_has_safe_operation_category

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-83b6c46d0c5c9989` — test_source_failure_diagnostic_excludes_exception_messages

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-28ac5ffd393325dc` — test_source_failure_logs_only_allowlisted_http_error_metadata

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-708ddebd6c7f369d` — test_source_observation_writes_are_fenced_by_ingest_ownership

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c5f8eaded2f4c0ce` — test_timeout_is_not_knowledge_and_retry_backs_off

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b1d54823317bfe35` — test_topic_selection_is_shared_across_modalities_and_preserves_evidence

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-def8bfbcc4794057` — test_untrusted_content

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_engine.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a48469805b401692` — test_contenders_and_owner_checked_heartbeat_release

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-005a4d0d2fa3fac4` — test_lost_lease_cannot_overwrite_successor_pointer

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c76996f79d6c6d46` — test_previous_id_only_pointer_migrates_without_regression

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-cc8dc2be738b1bfe` — test_published_snapshot_loads_into_follower_without_ingest

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1e093952f5985102` — test_same_owner_out_of_order_publication_rejected

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-00e3abe0c1fa9dd2` — test_server_clock_rejects_expired_publication

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_lease.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d269576b681a8ce3` — test_search_registry_uses_matrix_queries_for_automatic_discovery

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_matrix.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_matrix.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_matrix.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_matrix.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1dac00a26c3b3cab` — ai_model.awareness.test_sources

Source: `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_sources.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__awareness__test_sources.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_sources.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_sources.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c5f724884d2cac4f` — ai_model.generation.test_campaign

Source: `external/maxcore/artifacts/ai-training-server/ai_model/generation/test_campaign.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__generation__test_campaign.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/generation/test_campaign.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/generation/test_campaign.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-861118b9604023f4` — ai_model.gpu.native.tests.test_native_kernels

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/tests/test_native_kernels.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__native__tests__test_native_kernels.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/tests/test_native_kernels.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/tests/test_native_kernels.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1b53d77ae20c5ab3` — ai_model.gpu.tests.test_digital_backend_bridge

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_backend_bridge.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__tests__test_digital_backend_bridge.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_backend_bridge.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_backend_bridge.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e2d90cd41171d1d5` — ai_model.gpu.tests.test_digital_gpu_comprehensive

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__tests__test_digital_gpu_comprehensive.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-5eb922f018ec844c` — ai_model.gpu.tests.test_kernels

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_kernels.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__tests__test_kernels.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_kernels.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_kernels.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-cc9334cd152dc1d5` — ai_model.gpu.tests.test_pocket_execution

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_pocket_execution.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__tests__test_pocket_execution.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_pocket_execution.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_pocket_execution.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-8c6f8ea7cd562ded` — ai_model.gpu.tests.test_silicon_model

Source: `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_silicon_model.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__gpu__tests__test_silicon_model.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_silicon_model.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_silicon_model.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9c5f45bf8cc95710` — ai_model.image.test_controls

Source: `external/maxcore/artifacts/ai-training-server/ai_model/image/test_controls.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__image__test_controls.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/image/test_controls.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/image/test_controls.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-64e48cc1bee1f033` — ai_model.image.test_image_contract

Source: `external/maxcore/artifacts/ai-training-server/ai_model/image/test_image_contract.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__image__test_image_contract.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/image/test_image_contract.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/image/test_image_contract.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-eaa1c0fe1dc06abf` — ai_model.maxcore.backend.tests.test_select_backend

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/tests/test_select_backend.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__backend__tests__test_select_backend.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/tests/test_select_backend.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/tests/test_select_backend.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e6b9c6b74b53fa82` — ai_model.maxcore.tests.test_gpu_native_orchestration

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_gpu_native_orchestration.xml`.

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

## `repair-074b5ca2bb283f97` — ai_model.maxcore.tests.test_hardware

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_hardware.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_hardware.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_hardware.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_hardware.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-69c9081c746a16e4` — ai_model.maxcore.tests.test_maxcore

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_maxcore.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_maxcore.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_maxcore.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_maxcore.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0b1f490077952983` — ai_model.maxcore.tests.test_precision

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_precision.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_precision.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_precision.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_precision.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f8ed8ef66ea9cfeb` — ai_model.maxcore.tests.test_resource_plan

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_resource_plan.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_resource_plan.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_resource_plan.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_resource_plan.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-bf9104ea8e4a44ef` — ai_model.maxcore.tests.test_silicon_simt_backend

Source: `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_silicon_simt_backend.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__maxcore__tests__test_silicon_simt_backend.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_silicon_simt_backend.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_silicon_simt_backend.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-253b03ecbd35561a` — ai_model.model.test_generation_regressions

Source: `external/maxcore/artifacts/ai-training-server/ai_model/model/test_generation_regressions.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__model__test_generation_regressions.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/model/test_generation_regressions.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/model/test_generation_regressions.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9357f72f7c8cddea` — ai_model.model.test_sampling_context

Source: `external/maxcore/artifacts/ai-training-server/ai_model/model/test_sampling_context.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__model__test_sampling_context.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/model/test_sampling_context.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/model/test_sampling_context.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-91cda77706739ebc` — ai_model.native_analysis.test_text

Source: `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_text.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__native_analysis__test_text.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_text.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_text.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-42092bca9a01f607` — ai_model.native_analysis.test_website

Source: `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_website.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__native_analysis__test_website.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_website.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_website.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3f4a52105937dd3e` — ai_model.retrieval.test_phase4

Source: `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__retrieval__test_phase4.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9e51877f92309054` — ai_model.retrieval.test_pipeline

Source: `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__retrieval__test_pipeline.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a5840a15b579c995` — ai_model.retrieval.test_rcgs

Source: `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__retrieval__test_rcgs.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-da0fcaae03116204` — ai_model.retrieval.test_retrieval

Source: `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__retrieval__test_retrieval.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-08daa189cdca18fd` — ai_model.rta.test_render_contracts

Source: `external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__rta__test_render_contracts.xml`.

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

## `repair-eaafe54b9459c5b7` — test_bound_knowledge_does_not_retire_and_secondary_is_preserved

Source: `external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__test_quality_awareness.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7d6cae26a1c4cede` — test_own_corpus_retires_external_awareness_at_configured_threshold

Source: `external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__test_quality_awareness.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6dd10caa8b89baf0` — ai_model.training.test_candidate

Source: `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__training__test_candidate.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-343379a489702e12` — ai_model.training.test_candidate_generic

Source: `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_generic.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__training__test_candidate_generic.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_generic.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_generic.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e79a5e2b55d9658d` — ai_model.training.test_candidate_manual

Source: `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_manual.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__training__test_candidate_manual.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_manual.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_manual.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4af51babcb959ba3` — ai_model.training.test_live_learning

Source: `external/maxcore/artifacts/ai-training-server/ai_model/training/test_live_learning.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__training__test_live_learning.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_live_learning.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/training/test_live_learning.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-118e0e8dce123863` — ai_model.training.test_public_content_model

Source: `external/maxcore/artifacts/ai-training-server/ai_model/training/test_public_content_model.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__training__test_public_content_model.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_public_content_model.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/training/test_public_content_model.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7c31c03279937ad5` — ai_model.video.test_controls

Source: `external/maxcore/artifacts/ai-training-server/ai_model/video/test_controls.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__video__test_controls.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_controls.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/video/test_controls.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-831533a5bd570ce2` — ai_model.video.test_frame_continuity

Source: `external/maxcore/artifacts/ai-training-server/ai_model/video/test_frame_continuity.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__video__test_frame_continuity.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_frame_continuity.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/video/test_frame_continuity.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-cdd40c81a07c7947` — ai_model.video.test_production

Source: `external/maxcore/artifacts/ai-training-server/ai_model/video/test_production.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__ai_model__video__test_production.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_production.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/ai_model/video/test_production.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-8b68057e447c4529` — tests.test_admin_content_loop

Source: `external/maxcore/artifacts/ai-training-server/tests/test_admin_content_loop.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: collection failure

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_admin_content_loop.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_admin_content_loop.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_admin_content_loop.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0ab069f7714f8154` — test_above_threshold_no_seed

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0c3379034d8d5b5d` — test_already_seeding_is_graceful

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7686dfa7dc611ce1` — test_concurrent_lock_held_no_raise

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-cef7dfe2c868560e` — test_counter_increments_across_multiple_seeds

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c72ea0881918bfac` — test_not_throttled_after_interval_expires

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d709b0f909e628a9` — test_state_updated_on_success

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e8f8c09bf298a362` — test_throttled_within_interval

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_auto_growth.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-321b67ab64600248` — test_awareness_genre_matches_fma_id_track

Source: `external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py`. Group: `python`. Kind: `assertion_failure`. Priority: **P1**.

Observed: ImportError:   IMPORTANT: PLEASE READ THIS FOR ADVICE ON HOW TO SOLVE THIS ISSUE!  Importing the numpy C-extensions failed. This error can happen for many reasons, often due to issues with your setup or how NumPy was installed.  We have compiled some common reasons and troubleshooting tips at:      https://numpy.org/devdocs/user/troubleshooting-importerror.html  Please note and check the following:  [+10 more lines; full report in element text]

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/aso/full-repo-readiness-20261105T141734Z/python/external__maxcore__artifacts__ai-training-server__tests__test_audio_bpm_key_match.xml`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py
```

Required changes:

1. Reproduce the exact named case in external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.
