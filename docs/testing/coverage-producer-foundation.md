# Coverage command proof foundation

The master coverage command selects a public Vitest reporter in addition to JUnit. Outcomes use fresh UUID-specific `coverage/command-outcomes/<UUID>.json` paths; consecutive commands retain earlier outcomes and UUID collisions fail before writes. The parent captures both fresh artifacts during that same bounded command, before later summary or reconciliation can replace them. Its `coverageEvidence` records exact SHA-256, size, regular-file identity, strict XML root/suite/leaf counts, a new invocation UUID, selected/completed module identities, and the actual reporter lifecycle window. Nanosecond timestamps are decimal strings so JavaScript readers can parse them with `BigInt` without rounding.

This closes two concrete evidence gaps: a replacement one-case XML could previously look equivalent to the actual 2,771-case invocation, and Vitest can emit clean JUnit plus coverage threshold errors while an unhandled runtime rejection also occurred. The public `onTestRunEnd(testModules, unhandledErrors, reason)` callback records that separate error count; `reason: passed` alone does not prove no unhandled errors.

The reporter uses the installed Vitest 4.1.12 public `TestModule`/`TestCollection`/`TestCase` methods. It writes counts and source module identifiers, never error messages or private data. It checks the selected coverage output, rejects symlink ancestors and missing nonce, writes once, and never overwrites a prior outcome. The parent verifies source bytes before and after the actual child command, opens fresh artifact bytes without following a file symlink, bounds file size, checks consistent counters and module identities, and marks missing/stale/substituted artifacts invalid. Failed assertions, skips, pending work, interruption, collection failures, module errors and unhandled errors remain ineligible for counter admission. Their real child exit code remains intact. The master fails invalid or ineligible proof even when a child unexpectedly exits zero.

## Commands

The normal invocation is unchanged:

```sh
npm run test:all
```

Or run the prepared Python master as documented in `docs/testing/README.md`. `run-all.py` supplies the additional reporter argument, new UUID and the selected output path automatically. A coverage-only run is still a focused run; it does not replace full-platform launch verification.

The regressions are also independently runnable:

```sh
python -B tests/testing/test_coverage_command_binding.py
node --test --test-concurrency=1 tests/testing/coverage-outcome-reporter.test.mjs
```

Use the prepared Node 22 and Python testing environments described in the project test documentation. Both suites create disposable local fixture files/processes, perform no application/provider operations, and clean their owned processes. The Python suite exercises 36 real-child modes across 13 framework cases, including unchanged/stale/outside-window/symlink/oversized artifacts, wrong nonces, inconsistent root/suite/module counters, source mutation, unhandled errors and real exit preservation. The Node suite runs eleven actual installed Vitest lifecycle cases, including the clean-JUnit unhandled-rejection counterexample, threshold-only failure, real assertion/collection/skip outcomes, and ownership/overwrite rejection, including dangling symlinks and two consecutive commands without coverage cleaning.

Optional `C5_TEST_EVIDENCE_DIR` retains the Node fixture command receipts and outputs; optional `C5_TEST_REPOSITORY_ROOT` selects the checkout only when running an outside review copy. Neither is required for the canonical master. The test config, subjects and commands in retained receipts refer to ephemeral owned fixtures; rerun the test suite to regenerate them rather than executing deleted paths literally.

## Scope

This producer foundation does not merge coverage, waive the four 100% thresholds, certify page journeys, or grant launch approval. A threshold-only child exit 1 remains a failing coverage command; clean, bound test-outcome evidence can separately become eligible input to a later exact-map counter-admission gate. That gate still needs full source/runtime/process/map/counter identity, canonical raw-to-official-JSON correspondence, unique snapshot/overlap protection, exact source-pinned implementation inventory and owned transactional output. Historical profiles must be rejected after source changes. The current P2 admission prototype remains review-blocked until those separate guards are repaired and independently rechecked.
