# Platform-wide master verification results

Generated: `2026-10-28T09:33:33.389184+00:00`. Checkout baseline: `a1603b13b6352a978e3877a2f43f1ccd98a98a18`.

**The master gate remains open.** Passing groups and unresolved checks are reported separately. No production-readiness or complete-feature claim follows from a passing subset.

Run the same sweep from a prepared checkout:

```sh
npm run test:master -- --python /path/to/prepared/python
```

Use [the setup guide](README.md) for dependencies and toolchain selectors, [the catalog](catalog.md) for every source test and command, [the platform register](../../reports/test-verification/platform-register.md) for every feature check, [the full platform plan](platform-completion-plan.md) for all 80 page and backend work ledgers, and [the generated fix checklist](../../reports/test-verification/remediation.md) for exact next actions.

## Actual group outcomes

| Group | Result | Measured scope |
| --- | --- | --- |
| `root-unit` | **passed** | passed: 2728 |
| `root-additional` | **passed** | passed: 18 |
| `coverage-contracts` | **passed** | passed: 43 |
| `node` | **failed** | 122 files; 1 failed files; TAP {"tests": 635, "pass": 632, "fail": 1, "skipped": 2, "cancelled": 0} |
| `python` | **passed** | tests: 1381, failures: 0, errors: 0, skipped: 12 |
| `commerce` | **passed** | passed: 136, skipped: 1 |
| `subsystems` | **passed** | rust-boosterstate: passed; go-dns: passed; pdim-erasure: passed; maxcore-js-security: passed; rust-cleanup-concurrency: passed; pdim-http-load: passed |
| `browser` | **passed** | tests: 5, pass: 5, fail: 0, skipped: 0 |
| `page80` | **passed** | PASS_WITH_UNTESTED_CATEGORIES; 0 final acceptance failures; individual browser observations remain in the raw evidence |
| `http` | **passed** | passed: 489, skipped: 9 |
| `bounded-http-load` | **passed** | One source application and disposable database; 10/20 workers for 20/10 seconds, not global capacity or soak proof |
| `checks` | **passed** | build: exit 0; types: exit 0; lint: exit 0; audit: exit 0 |
| `dependency-audit-recheck` | **passed** | {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}, "dependencies": {"prod": 1028, "dev": 315, "optional": 140, "peer": 0, "peerOptional": 0, "total": 1475}} |
| `operations` | **passed** | scripts/testing/platform-register.py: exit 0; external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py: exit 0; evaluations/maxcore-quality/verify_types.py: exit 0; evaluations/maxcore-quality/verify_evidence.py: exit 0; scripts/maxcore-isolated-recovery-acceptance.py: exit 0; tests/payment-processing/run.mjs: exit 0 |
| `coverage` | **failed** | lines: 13.1%; statements: 13%; functions: 8.67%; branches: 8.77% |
| `master-commands` | **failed** | build: exit 0; ci: exit 0; additional: exit 0; coverage: exit 1; desktop-transport-setup: exit 0; node: exit 1; python: exit 0; commerce: exit 0; subsystems: exit 0; browser: exit 0; http: exit 0; pages: exit 0; bounded-http-load: exit 0; operations: exit 0; types: exit 0; lint: exit 0; audit: exit 0 |
| `source-integrity` | **passed** | Git-visible code/configuration inputs remained unchanged throughout execution |
| `evidence-gates` | **failed** | platform: exit 1; remediation: exit 1; completion-plan: exit 0 |

Group counts overlap. CI repeats some Node contracts; instrumented unit tests repeat the same assertions under coverage; HTTP also runs cross-pod cache tests. Node TAP can count parents while JUnit counts leaf cases. Python suite counters include unittest subtests. No inflated grand total is claimed.

## Failures and unverified boundaries

| Source suite | Failed recorded cases |
| --- | --- |

The full case list and exact assertion messages are in [case-results.json](../../reports/test-verification/case-results.json). Assertion failures may identify an implementation defect, obsolete fixture or unmet dependency; the remediation guide distinguishes confirmed observations from likely diagnoses.

The strict master retains missing-source targets, browser-policy restrictions, unavailable semantic generation and provider/hardware prerequisites as unresolved work. It does not change expected statuses or substitute stubs to turn these into passes.

## Platform coverage and required work

Source catalog: `{"byGroup": {"commerce": 21, "integration-browser": 26, "manual-destructive-provider": 37, "python": 124, "root-node": 122, "root-unit": 297, "runner-support": 75, "subsystems": 5}, "canonicalTestFiles": 632, "nonExecutableSupportFiles": 11, "retainedSnapshotFiles": 71, "supportSourceFiles": 75}`.

File evidence status: `{"blocked_or_skipped": 16, "executed": 586, "failed": 1, "not_run": 29, "support": 75}`.

Platform register: `{"actualCoverageFiles": 2653, "backendRegistrations": 2907, "frontendApiContracts": 932, "invalidEvidenceLinks": 0, "requiredChecks": 33538, "routedPageDeclarations": 80, "scannedTypeScriptJavaScriptFiles": 3404, "uiInteractionDeclarations": 8374, "unknownMappings": 130, "unverifiedChecks": 33532}`.

Required behavior checks are a test plan, not a count of proven product bugs or necessarily a count of missing test files. Existing tests can satisfy checks when their exact automated evidence is linked. Static candidate matches and line execution alone do not establish authorization, persistence, recovery or full UI behavior. No human approval/signature is required.

Repair task categories: `{"assertion_failure": 2, "blocked_check": 20, "command_failure": 2, "coverage_gap": 2494, "feature_acceptance_gap": 833, "mapping_gap": 15, "missing_execution": 29, "skipped_case": 20}`.

The readable checklist is bounded for review; its JSON retains every task, location, reproduction command and required proof.

JavaScript/TypeScript coverage measures the instrumented unit run across frontend, backend, shared, DSP and imported source. It includes retained/unreached modules. Chromium execution and Python are separate measurements, not silently merged into the V8 percentage. Missing line/branch hits require targeted tests; even complete line execution is not proof of every business rule.

## Provenance and replay

- The baseline commit plus source hashes identify the tested working tree; no historical artifact is promoted to current evidence.
- Initial failures are retained separately; final reconciliation reads only artifacts from this master invocation.
- The earlier baseline sweep and its evidence are preserved in commit `4f9d419a`; newer upstream work was merged normally before the integrated rerun.
- Production data, real financial transactions and private provider state are outside the isolated sweep. Unrun operational modes retain explicit prerequisites.
- Reports, JUnit, TAP, machine case/file status, coverage maps and the source scripts are committed together. Duplicate generated HTML is reproducible.
