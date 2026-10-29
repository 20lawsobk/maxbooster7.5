# C5 producer-time proof foundation — candidate independently reviewed

Apply `source.patch` only after the active root master is archived. It contains five files: the parent `run-all.py` command wrapper, a public Vitest outcome reporter, two meaningful regression suites, and a usage/scope document. The patch was checked against local main `5eb416a04021f66c9bfc8af93997ec9fe8a55e31`; no checkout source was edited by this work.

## Result and exact scope

The parent now captures fresh, stable, bounded regular-file JUnit bytes and hashes/counts during the actual command. It also captures the actual public `onTestRunEnd` outcome, bound by a new parent UUID, exact reporter source hash, selected/completed modules, strict case/error counts and a parent time window. Nanosecond bounds are decimal strings and ISO timestamp conversion uses integer arithmetic. Invalid or ineligible proof fails the command/master gate while preserving the actual child exit code.

The outcome uses `coverage/command-outcomes/<UUID>.json`. Both parent and reporter reject collision/overwrite; existing proof is not deleted. Two consecutive real commands with `coverage.clean=false` retain separate nonce-specific outcomes. The reporter rejects existing and dangling symlink ancestors, records counts without error messages/private data, and uses only the installed Vitest 4.1.12 public API.

This is a **test-outcome producer foundation**, not global coverage admission or launch approval. It supplies the parent hashes that the blocked P2 prototype lacked. A threshold-only exit 1 remains a failing coverage command even if its test outcome is eligible for a later exact-map admission gate. The future consumer must still verify threshold-only reason and the full source/runtime/raw/map/counter/unique-snapshot/global chain. No global file or published percentage was changed.

## Verified final candidate

- Parent: **13/13 framework cases pass**, covering **36 distinct real-child modes** plus nonce collision/freshness/ownership controls.
- Public reporter: **11/11 actual installed-Vitest lifecycle cases pass**, including clean JUnit with an unhandled rejection and the same four threshold errors, assertion/collection/skip failures, missing nonce, existing/dangling symlink rejection, overwrite rejection, and consecutive commands without cleaning.
- Joint producer: **4/4 actual parent+Vitest modes pass**: clean, threshold-only, unhandled-with-clean-JUnit, and consecutive commands. Stale one-case XML is replaced by two actual cases; later one-case substitution differs from the bound hash. The unhandled case remains ineligible, and both real child exits remain unchanged.
- Independent final review passed. It verifies separate first/second XML and outcome hashes/windows and pins all four source files. See `independent-review/final-review.json`.
- `git apply --check source.patch` passes against the stated baseline.

Counts above describe distinct scopes; do not add them into an application acceptance percentage. These fixture subjects are not application feature execution or application coverage credit.

## Retained corrections

Original failures and earlier candidate evidence are retained. The first parent 11-case invocation found that Vitest omits the root `skipped` attribute; the final parser derives it from checked suite/leaf counts and validates it if present. A cross-driver repeat initially re-read the first JUnit path after the second command overwrote it; the corrected driver verifies/copies first bytes before the second command. Independent review found the same labelling issue in the Node fixture; the final helper retains first and second XML separately, each matching its own receipt. These were evidence-harness corrections; no failure was converted into an application pass.

The earlier P2 prototype and its executable negative controls remain separately `REVIEW_BLOCKED`, including the actual one-vs-2,771 counterexample. This patch does not claim those later admission guards are repaired.

## Usage

After integration, rerun the relevant checks and a new frozen canonical master; prior 8a9/5eb profiles cannot become evidence for changed source. The new document `docs/testing/coverage-producer-foundation.md` explains normal master use and both standalone suites.

For the outside candidate only:

```sh
/workspace/.cloud-python/bin/python -B /workspace/onboarding-results/c5-producer-foundation/candidate/tests/testing/test_coverage_command_binding.py
C5_TEST_REPOSITORY_ROOT=/workspace/maxbooster7.5 PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH node --test --test-concurrency=1 /workspace/onboarding-results/c5-producer-foundation/candidate/tests/testing/coverage-outcome-reporter.test.mjs
```

The scripts create and remove owned local fixtures/processes, perform no application/provider/production-data operations, and preserve the original application source. Actual fixture config/receipt paths are historical ephemeral paths; regenerate fixtures with the tests rather than invoking deleted command paths literally. `verify-package.py` checks every retained member against the manifest; `safe-copy-plan.json` names the exact later report destinations. No root report should be written while the current master is frozen.
