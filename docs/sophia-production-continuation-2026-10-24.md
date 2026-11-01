# Production continuation — 2026-10-24

Continued by the [platform hardening report](platform-hardening-2026-10-24.md) and
[explicit per-file register](platform-review-register-2026-10-24.csv). This report
retains its original revision-specific results.

Continues draft PR #112 at remote commit `3a3401914300187355d398ce35856f9dd16f4dc7` (local equivalent tree `f430f026d4be0ffa32b845f812205114abddf1d3`). The [October 23 documentation register](documentation-review-2026-10-23.md) and [prior implementation report](sophia-production-continuation-2026-10-23.md) remain historical evidence for that exact tree.

The owner requested parallel investigation. Disjoint generation, runtime and recovery/business reviews investigated actual source and executed focused regressions; integrated changes received an additional independent review. Heavy integrated checks run without competing build/compiler jobs. Multi-application workflows remain excluded. Predeployment acceptance uses isolated real consumers and clearly identified provider boundaries; real production charges, posts and public deployment are not prerequisites imposed by this continuation.

## Confirmed defects repaired

### Critical route registration could falsely pass readiness

`safeLoadRoute` swallowed critical module import and invalid-export failures. Modular mount/setup errors were logged, while the routes probe subsequently claimed every section registered. The previous startup log includes failed billing configuration but an `ok` routes probe.

`server/lib/bootState.ts` now records failures for the existing six critical categories (auth, billing, Stripe webhook, admin, security and storage), separately from boot completion. Loader, export, mount and awaited asynchronous setup failures record only known route names; health readiness remains degraded. Optional routes do not become new mandatory gates. Direct paid-router errors already reject registration. Six exact-source regressions exercise these transitions without importing database/providers.

### Fresh awareness scans could starve qualified candidates

The selector correctly binds capability observations to the exact fresh awareness snapshot, checkpoint, report, certificate, configuration and budget. But refreshing the scan invalidated failures while newest-first scheduling repeatedly spent both permitted new probes on the same newest failed candidates. An older capable candidate could never receive a probe.

`external/maxcore/artifacts/ai-training-server/ai_model/training/auto_selection.py` now keeps bounded scheduling history separately from capability evidence. Candidates rotate within the existing newest-100 inventory, with at most two new probes per tick and 128 scheduling hints. Qualification, provenance, hashes, policy separation, deadlines and awareness freshness remain unchanged. The fresh-scan regression reproduces the starvation and verifies eventual selection without accepting stale capability evidence.

This does not supply a trained model. The actual checkout contains one legacy live candidate with one training step/128 tokens, nonsensical sample output and promotion disabled; it has no qualifying `public-content-transformer-v2` candidate. No artifact was promoted, quality gate relaxed or generated output fabricated.

### Restore process had unbounded lifetime and diagnostics

`databaseBackupService.restoreBackup` could wait indefinitely for psql and accumulate unlimited stderr. The new `databaseRestore.ts` executor limits restoration to 30 minutes and diagnostics to 16 KiB, escalates TERM to KILL, confirms close before normal settlement, and explicitly reports unconfirmed termination after bounded escalation. Credentials are passed through discrete libpq environment variables and diagnostics are redacted.

Verified catalog/checksum, isolated target, empty-target check, single transaction and operator-supplied invariants remain intact. Seven regressions include real successful, hung, flooding, failed and TERM-resistant child processes, plus unconfirmed-teardown simulation. Unconfirmed teardown remains an operator-visible failure, not a claim that a process exited or restoration committed.

### Delayed refunds could overwrite newer dispute state

A refund webhook read `disputed_cents`, waited for provider pagination, then wrote that old value after acquiring the source lock. Deterministic disposable-PostgreSQL tests demonstrated both a newer 10,000-cent hold being cleared and a won hold being resurrected. Both assertions failed before the fix.

Refund-only compensation now omits dispute state; the repository reads the current hold under its transaction/source lock. Refund engine, payout reconciliation, topup reversal and undisputed settlement callers preserve the current hold. Actual dispute handlers still supply explicit transitions, including zero for won disputes. Regression assertions cover holds, available balances and balanced journal entries. This change does not claim to serialize every possible pair of overlapping provider dispute-status reads.

### Startup fixture corrections

The previous isolated start copy lacked `python_runtime/bin/python3`; logs show repeated interpreter launch failures before the model port bound. This is more specific than the earlier report's timeout/unavailable-awareness description and does not establish a deployed model outage.

`tests/npm-start-isolated-smoke.py` now checks native executable, interpreter and required base imports before launch, uses actual private port 5000, and supplies a synthetic Stripe credential exclusively inside its isolated network namespace so missing configuration does not silently omit billing. Provider traffic remains impossible there. A host-provisioned dependency fixture is not a portable deployment image or production-model qualification.

## Verification ledger

Integrated results are appended only after completion. Focused evidence:

- Corrected actual `npm run start` in the disposable network namespace: homepage/health HTTP 200, readiness HTTP 503. Database, Redis, critical routes, audit and automation report ok. Python completes application startup and binds port 9878 with zero restarts; the model remains unready and public awareness correctly lacks domain coverage with external networking disabled. The harness exits 1 for aggregate readiness, while the cleanup wrapper exits 0 after owned processes stop, ports are released and private PostgreSQL stops. The Python runtime and Node dependencies use host-provisioned dependencies through fixture links; no portable release/image closure or live generation qualification is claimed.
- Final `npm run test:ci -- --retry=0`: all 2,345 Vitest tests pass, zero failures/errors/skips across 278 suites, about 204 seconds. Runtime/security, Sharp and six preference Node phases also pass. No competing heavy compiler/build ran during this full suite.
- Final combined Node 22 server/client `npm run check`, ordinary `npm run build`, and scoped runtime/test ESLint passed.
- Ordinary credential-free payment runner passed 73 contracts, 14 SQL/handler tests and both refund/dispute overlap cases (three Node results); one remote Stripe test intentionally skipped. A partial agent invocation inherited shell transport configuration and failed five unrelated mock contracts; the actual runner strips that environment and passes. No provider configuration was modified.
- Python fixture syntax and three existing fixture-support contracts pass.
- Selector automatic/scaling/release regressions: 22 pass under the available Torch-capable Python runtime.
- Route-registration readiness: six pass; scoped lint has no errors.
- Restore/tool-selection/subprocess suites: 25 pass; scoped lint clean.
- Deterministic refund/dispute overlap: both directions fail before and pass after (three Node results including harness).
- MaxCore isolated journal/recovery/load drill: passes with original bytes preserved during storage outage, interrupted render explicitly failed, restored delivery committed once, completed restart not redelivered; 96 bounded HTTP probes, concurrency eight, zero unexpected responses. This uses extracted production recovery/readiness functions and a local fixture transport, not full inference, production PDIM or off-host failover. The initial attempt under default Python failed because it lacked Torch; rerunning under the existing Torch-capable runtime passed. Neither failure was relabelled as a model-quality result.

## Remaining acceptance gates

| Gate | Disposition |
| --- | --- |
| Qualified generated text and learned-media quality | BLOCKED: no qualifying trained candidate; no gate bypass. |
| Current full runtime readiness | NOT PASSED: corrected startup serves homepage/health 200 and registers critical routes, but readiness remains 503 with unready model and network-isolated awareness. Python startup and clean shutdown are observed. |
| Integrated source checks and tests | PASS: ordinary build, server/client types, scoped lint and all 2,345 unit tests; focused Python, payment and recovery checks pass within stated boundaries. |
| Business and recovery correctness | Bounded isolated scenarios improve evidence; full required consumer/provider-contract and retained recovery matrix is not yet complete. |
| Multi-application workflows | Excluded by owner instruction. |

No merge, publication, production/shared-data modification, actual charge, external post, or saved Sophia Agents API session execution occurred. This report does not certify 100% functionality or production readiness.
