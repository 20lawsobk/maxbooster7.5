# Platform-wide master verification results

Generated: `2026-11-10T08:35:18.619668+00:00`. Checkout baseline: `6f5e0735073ba883848864038e2782a2e6a8f5ee`.

**The master gate remains open.** Passing groups and unresolved checks are reported separately. No production-readiness or complete-feature claim follows from a passing subset.

Run the same sweep from a prepared checkout:

```sh
npm run test:master -- --python /path/to/prepared/python
```

Use [the setup guide](README.md) for dependencies and toolchain selectors, [the catalog](catalog.md) for every source test and command, [the platform register](../../reports/test-verification/platform-register.md) for every feature check, [the full platform plan](platform-completion-plan.md) for all 80 page and backend work ledgers, and [the generated fix checklist](../../reports/test-verification/remediation.md) for exact next actions.

## Actual group outcomes

| Group | Result | Measured scope |
| --- | --- | --- |
| `root-unit` | **failed** | passed: 3024, failed: 3 |
| `root-additional` | **passed** | passed: 18 |
| `master-commands` | **failed** | ci: exit 1; additional: exit 0 |
| `source-integrity` | **passed** | Git-visible code/configuration inputs remained unchanged throughout execution |
| `evidence-gates` | **passed** | platform: exit 0; remediation: exit 0; completion-plan: exit 0 |

Group counts overlap. CI repeats some Node contracts; instrumented unit tests repeat the same assertions under coverage; HTTP also runs cross-pod cache tests. Node TAP can count parents while JUnit counts leaf cases. Python suite counters include unittest subtests. No inflated grand total is claimed.

## Failures and unverified boundaries

| Source suite | Failed recorded cases |
| --- | --- |
| `tests/unit/maxcore-readiness-gate.test.ts` | 2 |
| `tests/unit/build-shell-python-runtime.test.ts` | 1 |

The full case list and exact assertion messages are in [case-results.json](../../reports/test-verification/case-results.json). Assertion failures may identify an implementation defect, obsolete fixture or unmet dependency; the remediation guide distinguishes confirmed observations from likely diagnoses.

The strict master retains missing-source targets, browser-policy restrictions, unavailable semantic generation and provider/hardware prerequisites as unresolved work. It does not change expected statuses or substitute stubs to turn these into passes.

## Platform coverage and required work

Source catalog: `{"byGroup": {"commerce": 22, "integration-browser": 11, "manual-destructive-provider": 37, "python": 149, "root-node": 139, "root-unit": 335, "runner-support": 89, "subsystems": 5}, "canonicalTestFiles": 698, "nonExecutableSupportFiles": 12, "retainedSnapshotFiles": 220, "supportSourceFiles": 89}`.

File evidence status: `{"executed": 314, "failed": 2, "not_run": 382, "support": 89}`.

Platform register: `{"actualCoverageFiles": 0, "backendRegistrations": 2994, "frontendApiContracts": 934, "invalidEvidenceLinks": 9, "requiredChecks": 34180, "routedPageDeclarations": 80, "scannedTypeScriptJavaScriptFiles": 3466, "uiInteractionDeclarations": 8431, "unknownMappings": 173, "unverifiedChecks": 34180}`.

Required behavior checks are a test plan, not a count of proven product bugs or necessarily a count of missing test files. Existing tests can satisfy checks when their exact automated evidence is linked. Static candidate matches and line execution alone do not establish authorization, persistence, recovery or full UI behavior. No human approval/signature is required.

Repair task categories: `{"assertion_failure": 3, "command_failure": 1, "feature_acceptance_gap": 838, "mapping_gap": 20, "missing_evidence": 2, "missing_execution": 382}`.

The readable checklist is bounded for review; its JSON retains every task, location, reproduction command and required proof.

JavaScript/TypeScript coverage measures the instrumented unit run across frontend, backend, shared, DSP and imported source. It includes retained/unreached modules. Chromium execution and Python are separate measurements, not silently merged into the V8 percentage. Missing line/branch hits require targeted tests; even complete line execution is not proof of every business rule.

## Provenance and replay

- The baseline commit plus source hashes identify the tested working tree; no historical artifact is promoted to current evidence.
- Initial failures are retained separately; final reconciliation reads only artifacts from this master invocation.
- The earlier baseline sweep and its evidence are preserved in commit `4f9d419a`; newer upstream work was merged normally before the integrated rerun.
- Production data, real financial transactions and private provider state are outside the isolated sweep. Unrun operational modes retain explicit prerequisites.
- Reports, JUnit, TAP, machine case/file status, coverage maps and the source scripts are committed together. Duplicate generated HTML is reproducible.
