# Isolated platform beta simulation

Started: 2026-09-29T22:27:17.183Z
Finished: 2026-09-29T22:30:31.783Z

**BLOCKED: passing isolated contracts do not establish full-platform or production acceptance**

Sequential allowlisted commands; fresh temporary HOME; cleared environment; no secrets/DB URLs inherited; bounded process-group timeout; Node TCP guard permits only same-process loopback fixtures. Not an OS sandbox.

beta-simulation.json/.md describe the latest started cycle, including partial progress, not necessarily the latest completed or passing cycle. Previous evidence is snapshotted before replacement.
Previous latest report: none existed. Snapshot file checksums are recorded in the JSON report.

PASS means the selected contract commands exited zero, not domain acceptance. Fixtures are test-only assertions against production logic, not simulated production success.

| Domain | Contract cycle | Commands | Acceptance |
|---|---|---:|---|
| security | FAIL | 4/4 | BLOCKED |
| commerce | FAIL | 2/2 | BLOCKED |
| integrations | FAIL | 5/5 | BLOCKED |
| growth | PASS | 1/1 | BLOCKED |
| client | FAIL | 3/3 | BLOCKED |
| admin | PASS | 1/1 | BLOCKED |
| data | FAIL | 3/3 | BLOCKED |
| media | BLOCKED | 3/3 | BLOCKED |
| autonomous | PASS | 1/1 | BLOCKED |
| deploy | FAIL | 5/5 | BLOCKED |
| privacy | PASS | 2/2 | BLOCKED |
| exports/sync | PASS | 1/1 | BLOCKED |

## Per-domain coverage limits
- **security:** No deployed cookies/proxy, browser auth, real session SQL contention, TLS egress or credential rotation acceptance.
- **commerce:** Mocked SQL/provider contracts only; no real charge, refund, payout, settlement or cross-process durable replay.
- **integrations:** Synthetic signatures/credentials, mocked providers and minimal isolated PostgreSQL receipt-merge behavior; no actual webhook delivery, catalog scale, live SQL contention or provider receipt.
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
Command: `/usr/bin/node --import tsx --test --test-concurrency=1 server/services/securityAuthority.test.ts`
Exit: 0; signal: none; timeout: false; duration: 688 ms.

### jwt-chain: PASS
Command: `/usr/bin/node --test --test-concurrency=1 server/services/securityJwtChain.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 376 ms.

### security-consumers: FAIL
Command: `/usr/bin/node --import tsx --test --test-concurrency=1 server/logSanitizer.test.ts script/security-readiness.test.mjs script/security-consumers.test.cjs`
Exit: 1; signal: none; timeout: false; duration: 2465 ms.
```text
✔ actual royalties CSV parser retains quoting, trimming, mapping and malformed-input semantics on v7 (155.371017ms)
✔ actual upload middleware accepts real multipart, rejects SVG, size overflow and malformed framing (392.187989ms)
✔ installed sharp decodes and transcodes genuine image bytes (304.511952ms)
✖ all installed tar parents resolve real patched code; archive roundtrip and traversal rejection work (131.84426ms)
✖ xcode UUID consumer remains compatible with patched UUID v11 (0.580662ms)
✔ duplicate occurrences stay separate and root matches do not invent shipped provenance (1.827643ms)
✔ empty incomplete SAST fails; completion also requires revision and coverage (1.071208ms)
✖ actual scanner input retains all 206 occurrences and blocks false clean attestation (0.519289ms)
✔ nested provider secrets and PII are redacted without mutating source (1.429585ms)
✔ cycles, accessors, binary and errors remain bounded and diagnostic (3.788986ms)
✔ production JSON emission covers interpolated messages, errors and child bindings (3.655816ms)
✔ text masks IPv4/IPv6 and credentials, keeps useful nonpersonal diagnostics (6.744531ms)
✔ typed event runtime boundary rejects raw personal fields and unknown provider errors (1.025579ms)
✔ valid typed events use the real logger consumer and retain opaque correlation (1.307753ms)
ℹ tests 14
ℹ suites 0
ℹ pass 11
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2409.427561

✖ failing tests:

test at script/security-consumers.test.cjs:113:1
✖ all installed tar parents resolve real patched code; archive roundtrip and traversal rejection work (131.84426ms)
  Error: Cannot find module 'app-builder-lib/package.json'
  Require stack:
  - /home/hatch/workspace/maxbooster7.5/script/security-consumers.test.cjs
      at node:internal/modules/cjs/loader:1564:15
      at j._resolveFilename (file:///home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C4vWVmug.mjs:2:17957)
      at nextResolveSimple (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:1006)
      at /home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:9:4959
      at /home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:9:4261
      at resolveTsPaths (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:759)
      at Module._resolveFilename (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:1199)
      at wrapResolveFilename (node:internal/modules/cjs/loader:1118:27)
      at defaultResolve (node:internal/modules/cjs/loader:1199:20)
      at nextStep (node:internal/modules/customization_hooks:189:26) {
    code: 'MODULE_NOT_FOUND',
    requireStack: [ '/home/hatch/workspace/maxbooster7.5/script/security-consumers.test.cjs' ]
  }

test at script/security-consumers.test.cjs:164:1
✖ xcode UUID consumer remains compatible with patched UUID v11 (0.580662ms)
  Error: Cannot find module 'xcode/package.json'
  Require stack:
  - /home/hatch/workspace/maxbooster7.5/script/security-consumers.test.cjs
      at node:internal/modules/cjs/loader:1564:15
      at j._resolveFilename (file:///home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C4vWVmug.mjs:2:17957)
      at nextResolveSimple (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:1006)
      at /home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:9:4959
      at /home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:9:4261
      at resolveTsPaths (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:759)
      at Module._resolveFilename (/home/hatch/workspace/maxbooster7.5/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/register-C557imBs.cjs:10:1199)
      at wrapResolveFilename (node:internal/modules/cjs/loader:1118:27)
      at defaultResolve (node:internal/modules/cjs/loader:1199:20)
      at nextStep (node:internal/modules/customization_hooks:189:26) {
    code: 'MODULE_NOT_FOUND',
    requireStack: [ '/home/hatch/workspace/maxbooster7.5/script/security-consumers.test.cjs' ]
  }

test at script/security-readiness.test.mjs:23:1
✖ actual scanner input retains all 206 occurrences and blocks false clean attestation (0.519289ms)
  Error: ENOENT: no such file or directory, open '/home/hatch/workspace/maxbooster7.5/reports/readiness-audit/scanner-dependencies.json'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at read (file:///home/hatch/workspace/maxbooster7.5/script/security-readiness.mjs:46:19)
      at inspectReadiness (file:///home/hatch/workspace/maxbooster7.5/script/security-readiness.mjs:50:40)
      at TestContext.<anonymous> (file:///home/hatch/workspace/maxbooster7.5/script/security-readiness.test.mjs:24:18)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19)
      at Test.run (node:internal/test_runner/test:1462:12) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/home/hatch/workspace/maxbooster7.5/reports/readiness-audit/scanner-dependencies.json'
  }

```

### commerce: PASS
Command: `/usr/bin/node --test --test-concurrency=1 server/services/commerce.isolated.test.mjs server/services/commerce/orchestrator.isolated.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 598 ms.

### integrations-readiness: PASS
Command: `/usr/bin/node tests/integrations-readiness.cjs`
Exit: 0; signal: none; timeout: false; duration: 650 ms.

### integration-webhooks: PASS
Command: `/usr/bin/node tests/integration-webhooks.cjs`
Exit: 0; signal: none; timeout: false; duration: 446 ms.

### closure-integrations: FAIL
Command: `/usr/bin/node --test --test-concurrency=1 tests/closure-integrations.cjs tests/closure-integrations-shared.cjs tests/scheduled-post-receipt-compatibility.cjs`
Exit: 1; signal: none; timeout: false; duration: 1622 ms.
```text
✔ shared scheduled-post updates merge metadata and protect ambiguous/confirmed receipts (81.465135ms)
✔ compatibility status method delegates to the same atomic merge; status-only retains engagement (19.97706ms)
✔ raw engagement replacement and malformed result arrays fail before writing (14.53977ms)
✔ digest is schema-gated and registered with the real draining lifecycle (0.817707ms)
✔ catalog follows every track page and retains zero-duration tracks (1.655124ms)
✔ catalog rejects missing exhaustion, failed pages, loops and hostile credential cursors (1.242384ms)
✔ actual Spotify scanner enriches albums beyond ten and preserves authoritative empty/failure (27.160429ms)
✔ submission stops at a lost durable checkpoint without executing the next provider step (22.140546ms)
✔ digest queues independently of in-app and rechecks mute/category preferences (32.429658ms)
✔ unknown digest acceptance is durable and never retried (11.980138ms)
✔ muted digests are suppressed; quiet hours defer without sending (45.011199ms)
✔ posting claims quarantine unknown receipts; immediate reads use normalized results (0.677446ms)
✔ scheduled-post reads accept root arrays, legacy results, current results, and mixed metadata (108.578044ms)
✔ scheduled-post SQL atomically canonicalizes every receipt shape without metadata loss (15.799019ms)
✖ real PostgreSQL merge progresses only the same operation and never downgrades confirmation (9.251975ms)
ℹ tests 15
ℹ suites 0
ℹ pass 14
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1562.387573

✖ failing tests:

test at tests/scheduled-post-receipt-compatibility.cjs:115:1
✖ real PostgreSQL merge progresses only the same operation and never downgrades confirmation (9.251975ms)
  Error: Command failed: bash -c command -v postgres
      at genericNodeError (node:internal/errors:986:15)
      at wrappedFn (node:internal/errors:540:14)
      at checkExecSyncError (node:child_process:942:11)
      at Object.execFileSync (node:child_process:978:15)
      at postgresBinary (/home/hatch/workspace/maxbooster7.5/tests/scheduled-post-receipt-compatibility.cjs:94:33)
      at TestContext.<anonymous> (/home/hatch/workspace/maxbooster7.5/tests/scheduled-post-receipt-compatibility.cjs:120:18)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19) {
    status: 1,
    signal: null,
    output: [ null, '', '' ],
    pid: 5778,
    stdout: '',
    stderr: ''
  }

```

### growth-rights: PASS
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config tests/growth-rights.vitest.config.ts --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 1684 ms.

### client-contracts: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/unit/client-offline-readiness.test.mjs tests/unit/client-account-boundary.test.mjs tests/unit/client-sync-receipts.test.mjs tests/unit/client-worker-handoff.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 760 ms.

### admin-governance: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/admin-governance-isolated.cjs`
Exit: 0; signal: none; timeout: false; duration: 1661 ms.

### resumed-webhook-topology: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/resume-integration-contracts.cjs`
Exit: 0; signal: none; timeout: false; duration: 1043 ms.

### client-auth-contracts: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/unit/client-auth-beta-contracts.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 250 ms.

### data-runtime: FAIL
Command: `/usr/bin/node scripts/test-data-runtime.mjs`
Exit: 1; signal: none; timeout: false; duration: 200 ms.
```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: The input did not match the regular expression /snapshot recovery failed/. Input:

'Error: PDIM fabric persistence was not supplied by the owner'

    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async file:///home/hatch/workspace/maxbooster7.5/scripts/test-data-runtime.mjs:152:3 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: Error: PDIM fabric persistence was not supplied by the owner
      at _RedisStore.getPersistence (file:///tmp/readiness-beta-2o5OrY/runtime-tests-ZqE4xr/0.613220928862615.mjs:261:34)
      at _RedisStore.load (file:///tmp/readiness-beta-2o5OrY/runtime-tests-ZqE4xr/0.613220928862615.mjs:403:32)
      at file:///home/hatch/workspace/maxbooster7.5/scripts/test-data-runtime.mjs:152:30
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5),
  expected: /snapshot recovery failed/,
  operator: 'rejects',
  diff: 'simple'
}

Node.js v24.20.0

```

### fabric-deletion: PASS
Command: `/usr/bin/node scripts/test-fabric-deletion.mjs`
Exit: 0; signal: none; timeout: false; duration: 105 ms.

### closure-erasure-workflow: PASS
Command: `/usr/bin/node --import tsx --test --test-concurrency=1 server/services/accountErasureWorkflow.test.ts`
Exit: 0; signal: none; timeout: false; duration: 345 ms.

### closure-backup-postgres-tools: PASS
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/backup.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 1044 ms.

### test_media_delivery_contract: BLOCKED
Command: `/home/hatch/workspace/maxbooster7.5/.pythonlibs/bin/python3 -B external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py`
Exit: none; signal: none; timeout: false; duration: 0 ms.
Reason: Required files unavailable: /home/hatch/workspace/maxbooster7.5/.pythonlibs/bin/python3
```text

```

### test_isolated_audio: BLOCKED
Command: `/home/hatch/workspace/maxbooster7.5/.pythonlibs/bin/python3 -B external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py`
Exit: none; signal: none; timeout: false; duration: 0 ms.
Reason: Required files unavailable: /home/hatch/workspace/maxbooster7.5/.pythonlibs/bin/python3
```text

```

### media-resources: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/unit/aiMediaResourceContracts.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 285 ms.

### autonomous-contracts: PASS
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/autonomous.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 4079 ms.

### deployment-contracts: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/deployment-contracts.cjs`
Exit: 0; signal: none; timeout: false; duration: 377 ms.

### worker-composition: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/readiness-worker-composition.cjs`
Exit: 0; signal: none; timeout: false; duration: 357 ms.

### beta-evidence-history: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/readiness-beta-history.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 187 ms.

### closure-runtime-artifacts: PASS
Command: `/usr/bin/node --test --test-concurrency=1 tests/runtime-artifact-gates.test.mjs tests/nested-reconciliation.test.mjs`
Exit: 0; signal: none; timeout: false; duration: 557 ms.

### exports-sync: PASS
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config tests/coverage-gaps.config.ts --maxWorkers=1 --no-file-parallelism`
Exit: 0; signal: none; timeout: false; duration: 3272 ms.

### fixed-contracts-commerce: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 28363 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

### fixed-contracts-integrations: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 26134 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

### fixed-contracts-security: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 26372 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

### fixed-contracts-client: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 26869 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

### fixed-contracts-data: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 34359 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

### fixed-contracts-deploy: FAIL
Command: `/usr/bin/node node_modules/vitest/vitest.mjs run --config <temporary>/fixed-contracts.config.mjs --maxWorkers=1 --no-file-parallelism`
Exit: 1; signal: none; timeout: false; duration: 29361 ms.
```text

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/config/index.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/maxcore-proxy-contract.test.ts > MaxCore proxy route contract
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:37
     71|   afterAll(async () => {
     72|     vi.unstubAllGlobals();
     73|     await new Promise((r) => server.close(r));
       |                                     ^
     74|   });
     75|
 ❯ tests/unit/maxcore-proxy-contract.test.ts:73:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/stripe-webhook-honesty.test.ts [ tests/unit/stripe-webhook-honesty.test.ts ]
Error: [env] Critical environment variables missing:
  SESSION_SECRET: Invalid input: expected string, received undefined
 ❯ parseEnv server/config/env.ts:96:13
     94|     );
     95|     if (criticalFail) {
     96|       throw new Error(
       |             ^
     97|         `[env] Critical environment variables missing:\n${issues}`,
     98|       );
 ❯ server/config/env.ts:109:20
 ❯ server/safety/stripeWebhookSecurity.ts:13:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


```

Run a completed integration cycle with `node scripts/readiness-beta-simulation.mjs`. The stable filenames track the latest started cycle; previous report pairs are preserved under beta-simulation-history/. An absent finishedAt means incomplete execution, not a passing cycle. No full-platform acceptance claim is made.
