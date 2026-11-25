# Platform-wide master verification results

Generated: `2026-11-10T15:53:16.906257+00:00`. Checkout baseline: `d33649d75e7a0dffc80adf40fa410f4ee66b1984`.

**The master gate remains open.** Passing groups and unresolved checks are reported separately. No production-readiness or complete-feature claim follows from a passing subset.

Run the same sweep from a prepared checkout:

```sh
npm run test:master -- --python /path/to/prepared/python
```

Use [the setup guide](README.md) for dependencies and toolchain selectors, [the catalog](catalog.md) for every source test and command, [the platform register](../../reports/test-verification/platform-register.md) for every feature check, [the full platform plan](platform-completion-plan.md) for all 80 page and backend work ledgers, and [the generated fix checklist](../../reports/test-verification/remediation.md) for exact next actions.

## Actual group outcomes

| Group | Result | Measured scope |
| --- | --- | --- |
| `root-unit` | **passed** | passed: 3031 |
| `root-additional` | **passed** | passed: 18 |
| `coverage-contracts` | **passed** | passed: 43 |
| `commerce` | **passed** | passed: 137, skipped: 1 |
| `subsystems` | **passed** | rust-boosterstate: blocked; go-dns: passed; pdim-erasure: passed; maxcore-js-security: passed; rust-cleanup-concurrency: passed; pdim-http-load: passed |
| `browser` | **passed** | tests: 5, pass: 5, fail: 0, skipped: 0 |
| `page80` | **passed** | PASS_WITH_UNTESTED_CATEGORIES; 0 final acceptance failures; individual browser observations remain in the raw evidence |
| `http` | **passed** | passed: 529, skipped: 7 |
| `bounded-http-load` | **passed** | One source application and disposable database; 10/20 workers for 20/10 seconds, not global capacity or soak proof |
| `checks` | **passed** | build: exit 0; types: exit 0; lint: exit 0; audit: exit 0 |
| `dependency-audit-recheck` | **passed** | {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}, "dependencies": {"prod": 1023, "dev": 318, "optional": 140, "peer": 0, "peerOptional": 0, "total": 1473}} |
| `operations` | **failed** | scripts/testing/platform-register.py: exit 0; external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py: exit 0; evaluations/maxcore-quality/verify_types.py: exit 0; evaluations/maxcore-quality/verify_evidence.py: exit 0; scripts/maxcore-isolated-recovery-acceptance.py: exit 1; tests/payment-processing/run.mjs: exit 0 |
| `coverage` | **failed** | lines: 13.53%; statements: 13.43%; functions: 9.15%; branches: 9.32% |
| `master-commands` | **failed** | build: exit 0; ci: exit 1; additional: exit 0; coverage: exit 1; commerce: exit 0; subsystems: exit 1; browser: exit 0; http: exit 0; pages: exit 0; bounded-http-load: exit 0; operations: exit 1; types: exit 0; lint: exit 0; audit: exit 0 |
| `source-integrity` | **passed** | Git-visible code/configuration inputs remained unchanged throughout execution |
| `evidence-gates` | **passed** | platform: exit 0; remediation: exit 0; completion-plan: exit 0 |

Group counts overlap. CI repeats some Node contracts; instrumented unit tests repeat the same assertions under coverage; HTTP also runs cross-pod cache tests. Node TAP can count parents while JUnit counts leaf cases. Python suite counters include unittest subtests. No inflated grand total is claimed.

## Failures and unverified boundaries

| Source suite | Failed recorded cases |
| --- | --- |

The full case list and exact assertion messages are in [case-results.json](../../reports/test-verification/case-results.json). Assertion failures may identify an implementation defect, obsolete fixture or unmet dependency; the remediation guide distinguishes confirmed observations from likely diagnoses.

The strict master retains missing-source targets, browser-policy restrictions, unavailable semantic generation and provider/hardware prerequisites as unresolved work. It does not change expected statuses or substitute stubs to turn these into passes.

## Platform coverage and required work

Source catalog: `{"byGroup": {"commerce": 22, "integration-browser": 11, "manual-destructive-provider": 37, "python": 150, "root-node": 140, "root-unit": 335, "runner-support": 89, "subsystems": 5}, "canonicalTestFiles": 700, "nonExecutableSupportFiles": 12, "retainedSnapshotFiles": 220, "supportSourceFiles": 89}`.

File evidence status: `{"blocked_or_skipped": 1, "executed": 376, "failed": 1, "not_run": 322, "support": 89}`.

Platform register: `{"actualCoverageFiles": 2669, "backendRegistrations": 2994, "frontendApiContracts": 934, "invalidEvidenceLinks": 9, "requiredChecks": 34180, "routedPageDeclarations": 80, "scannedTypeScriptJavaScriptFiles": 3467, "uiInteractionDeclarations": 8431, "unknownMappings": 173, "unverifiedChecks": 34180}`.

Required behavior checks are a test plan, not a count of proven product bugs or necessarily a count of missing test files. Existing tests can satisfy checks when their exact automated evidence is linked. Static candidate matches and line execution alone do not establish authorization, persistence, recovery or full UI behavior. No human approval/signature is required.

Repair task categories: `{"blocked_check": 4, "command_failure": 6, "coverage_gap": 2505, "feature_acceptance_gap": 838, "mapping_gap": 20, "missing_evidence": 1, "missing_execution": 322, "skipped_case": 8}`.

The readable checklist is bounded for review; its JSON retains every task, location, reproduction command and required proof.

JavaScript/TypeScript coverage measures the instrumented unit run across frontend, backend, shared, DSP and imported source. It includes retained/unreached modules. Chromium execution and Python are separate measurements, not silently merged into the V8 percentage. Missing line/branch hits require targeted tests; even complete line execution is not proof of every business rule.

## Provenance and replay

- The baseline commit plus source hashes identify the tested working tree; no historical artifact is promoted to current evidence.
- Initial failures are retained separately; final reconciliation reads only artifacts from this master invocation.
- The earlier baseline sweep and its evidence are preserved in commit `4f9d419a`; newer upstream work was merged normally before the integrated rerun.
- Production data, real financial transactions and private provider state are outside the isolated sweep. Unrun operational modes retain explicit prerequisites.
- Reports, JUnit, TAP, machine case/file status, coverage maps and the source scripts are committed together. Duplicate generated HTML is reproducible.
