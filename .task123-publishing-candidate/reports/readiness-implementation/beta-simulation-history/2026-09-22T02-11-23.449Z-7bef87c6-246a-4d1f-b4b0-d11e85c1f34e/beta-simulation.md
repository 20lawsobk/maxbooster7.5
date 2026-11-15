# Isolated platform beta simulation

Started: 2026-09-22T02:03:30.362Z
Finished: 2026-09-22T02:04:13.691Z

**BLOCKED: passing isolated contracts do not establish full-platform or production acceptance**

Sequential allowlisted commands; fresh temporary HOME; cleared environment; no secrets/DB URLs inherited; bounded process-group timeout; Node TCP guard permits only same-process loopback fixtures. Not an OS sandbox.

beta-simulation.json/.md describe the latest started cycle, including partial progress, not necessarily the latest completed or passing cycle. Previous evidence is snapshotted before replacement.
Previous latest report: reports/readiness-implementation/beta-simulation-history/2026-09-22T02-03-30.365Z-89acf7ad-20b4-4e52-84ba-f80f35799cdf. Snapshot file checksums are recorded in the JSON report.

PASS means the selected contract commands exited zero, not domain acceptance. Fixtures are test-only assertions against production logic, not simulated production success.

| Domain | Contract cycle | Commands | Acceptance |
|---|---|---:|---|
| security | PASS | 3/3 | BLOCKED |
| commerce | PASS | 1/1 | BLOCKED |
| integrations | PASS | 4/4 | BLOCKED |
| growth | PASS | 1/1 | BLOCKED |
| client | PASS | 2/2 | BLOCKED |
| admin | PASS | 1/1 | BLOCKED |
| data | FAIL | 2/2 | BLOCKED |
| media | PASS | 3/3 | BLOCKED |
| autonomous | PASS | 1/1 | BLOCKED |
| deploy | PASS | 4/4 | BLOCKED |
| privacy | PASS | 2/2 | BLOCKED |
| exports/sync | PASS | 1/1 | BLOCKED |

## Per-domain coverage limits
- **security:** No deployed cookies/proxy, browser auth, real session SQL contention, TLS egress or credential rotation acceptance.
- **commerce:** Mocked SQL/provider contracts only; no real charge, refund, payout, settlement or cross-process durable replay.
- **integrations:** Synthetic signatures/credentials and mocked providers; no actual webhook delivery, catalog scale or provider receipt.
- **growth:** Mocked mail/database/payment boundaries; no delivered campaign, production split contention or legal acceptance.
- **client:** Node/source/browser-API fixtures only; no browser, service-worker lifecycle, device or offline end-to-end acceptance.
- **admin:** VM/mocked DB, email and Redis; no deployed admin authorization or moderation/evidence transaction acceptance.
- **data:** Mocked catalog/storage/dump/restore; no actual remote backup restore, SQL leases or crash durability acceptance. Migration harness excluded (schema worker owns it).
- **media:** Tiny test-only subprocesses, mocked rendering and resource contracts; no models, production render, quality or workload acceptance.
- **autonomous:** Mocked storage/security plus ephemeral HTTP fixture; no assembled app, restart durability, real build/autofix or operational feedback acceptance.
- **deploy:** Resource sizing/source contracts and tiny temporary capsules only; no deployment, real capsule recovery, migration or load acceptance.
- **privacy:** Mocked fabric deletion receipts, erasure workflow approval/lease/receipt boundaries and erasure-request SQL contracts. No complete user erasure, retention-policy/legal decision, remote deletion or cross-system verification.
- **exports/sync:** Mocked database/PDIM and tiny local FFmpeg WAV fixture; no remote artifact delivery, full codecs, expiry, workload, browser sync or real concurrent sessions.

## Excluded operations
app startup; shared/live databases; providers; payments; messages; models; generic test:all; fabricated-success lifecycle simulations; migration rehearsal (owned by schema worker); full TypeScript/browser/install.

## Command evidence
Captured stdout/stderr and input-file SHA-256 snapshots are in beta-simulation.json. Output is bounded at 512 KiB per stream; truncation is explicit.

### authority: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --import tsx --test --test-concurrency=1 server/services/securityAuthority.test.ts`
Exit: 0; signal: none; timeout: false; duration: 2542 ms.

### jwt-chain: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 server/services/securityJwtChain.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 1747 ms.

### security-consumers: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --import tsx --test --test-concurrency=1 server/logSanitizer.test.ts script/security-readiness.test.mjs script/security-consumers.test.cjs`
Exit: 0; signal: none; timeout: false; duration: 6224 ms.

### commerce: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 server/services/commerce.isolated.test.mjs server/services/commerce/orchestrator.isolated.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 1301 ms.

### integrations-readiness: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node tests/integrations-readiness.cjs`
Exit: 0; signal: none; timeout: false; duration: 731 ms.

### integration-webhooks: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node tests/integration-webhooks.cjs`
Exit: 0; signal: none; timeout: false; duration: 355 ms.

### closure-integrations: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/closure-integrations.cjs tests/closure-integrations-shared.cjs`
Exit: 0; signal: none; timeout: false; duration: 881 ms.

### growth-rights: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node node_modules/vitest/vitest.mjs run --config tests/growth-rights.vitest.config.ts --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 3814 ms.

### client-contracts: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/unit/client-offline-readiness.test.mjs tests/unit/client-account-boundary.test.mjs tests/unit/client-sync-receipts.test.mjs tests/unit/client-worker-handoff.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 1261 ms.

### admin-governance: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/admin-governance-isolated.cjs`
Exit: 0; signal: none; timeout: false; duration: 1484 ms.

### resumed-webhook-topology: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/resume-integration-contracts.cjs`
Exit: 0; signal: none; timeout: false; duration: 1419 ms.

### client-auth-contracts: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/unit/client-auth-beta-contracts.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 338 ms.

### data-runtime: FAIL
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node scripts/test-data-runtime.mjs`
Exit: 1; signal: none; timeout: false; duration: 389 ms.
```text
file:///tmp/readiness-beta-Gc0q9P/runtime-tests-24dm1V/0.9648253763068868.mjs:230
  throw new Error(`Could not query PostgreSQL server major with installed psql clients: ${failures.join("; ")}`);
        ^

Error: Could not query PostgreSQL server major with installed psql clients: /nix/store/jawi15brxq4h3a9snmlr9szx0zcaf2yx-postgresql-17.5/bin/psql (17.5): server version query exited with code 2; /nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/psql (16.10): server version query exited with code 2; /nix/store/4w1zl7v3s7gq13nxrrs6xx5sgkbp89cp-postgresql-16.10/bin/psql (16.10): server version query exited with code 2
    at serverMajorWithAvailablePsql (file:///tmp/readiness-beta-Gc0q9P/runtime-tests-24dm1V/0.9648253763068868.mjs:230:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async Promise.all (index 0)
    at async selectPgDumpForServer (file:///tmp/readiness-beta-Gc0q9P/runtime-tests-24dm1V/0.9648253763068868.mjs:236:36)
    at async DatabaseBackupService.createBackup (file:///tmp/readiness-beta-Gc0q9P/runtime-tests-24dm1V/0.9648253763068868.mjs:369:27)
    at async Promise.all (index 1)
    at async file:///home/runner/workspace/scripts/test-data-runtime.mjs:253:16

Node.js v24.13.0

```

### fabric-deletion: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node scripts/test-fabric-deletion.mjs`
Exit: 0; signal: none; timeout: false; duration: 84 ms.

### closure-erasure-workflow: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --import tsx --test --test-concurrency=1 server/services/accountErasureWorkflow.test.ts`
Exit: 0; signal: none; timeout: false; duration: 268 ms.

### closure-backup-postgres-tools: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/backup.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 560 ms.

### test_media_delivery_contract: PASS
Command: `/home/runner/workspace/.pythonlibs/bin/python3 -B external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py`
Exit: 0; signal: none; timeout: false; duration: 6754 ms.

### test_isolated_audio: PASS
Command: `/home/runner/workspace/.pythonlibs/bin/python3 -B external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py`
Exit: 0; signal: none; timeout: false; duration: 2265 ms.

### media-resources: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/unit/aiMediaResourceContracts.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 301 ms.

### autonomous-contracts: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/autonomous.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 4146 ms.

### deployment-contracts: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/deployment-contracts.cjs`
Exit: 0; signal: none; timeout: false; duration: 422 ms.

### worker-composition: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/readiness-worker-composition.cjs`
Exit: 0; signal: none; timeout: false; duration: 198 ms.

### beta-evidence-history: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/readiness-beta-history.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 125 ms.

### closure-runtime-artifacts: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node --test --test-concurrency=1 tests/runtime-artifact-gates.test.mjs tests/nested-reconciliation.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 460 ms.

### exports-sync: PASS
Command: `/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node node_modules/vitest/vitest.mjs run --config tests/coverage-gaps.config.ts --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 4914 ms.

Run a completed integration cycle with `node scripts/readiness-beta-simulation.mjs`. The stable filenames track the latest started cycle; previous report pairs are preserved under beta-simulation-history/. An absent finishedAt means incomplete execution, not a passing cycle. No full-platform acceptance claim is made.
