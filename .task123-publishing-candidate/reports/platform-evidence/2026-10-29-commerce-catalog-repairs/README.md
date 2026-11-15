# Commerce selector and catalog ownership repair candidate

The parent reviewed this outside-only candidate against HEAD
`d9d04498a02c25a1b6ce03306adc20727e9aa2d1`. The three script modifications and two
new framework test files have not been applied by this agent. The baseline
code/config input digest is
`cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`.

`manifest.json` gives every exact source path, original hash, candidate hash and
next acceptance step. `source.patch` contains only those five files;
`git apply --check` passed. Its SHA-256 is
`538665930f6000027a104167dfce59dcd73170e4ed53c0fcc23e88ddf9c66093`.
The complete source files are also under `candidate/` for hash-guarded landing.

The parent subsequently reported that this exact five-file patch was landed in
the root checkout after hash verification. The parent owns the post-landing
framework and real SQL executions; the receipts here remain explicitly
pre-landing receipts. This child made no root mutations. Product acceptance is
pending those actual post-landing runs and a fresh frozen master.

## Implemented repairs

The commerce job now supplies its own recorded `path` variable as
`--subject-file tests/unit/beat-sale-money-loop.test.ts`. The adapter validates
argument arity, registration, repository-relative path, regular file ownership,
and the existing static Vitest include before importing the database fixture or
allocating temporary resources. It rejects selection-changing config fields,
spreads, dynamic includes and duplicate properties before starting PostgreSQL or
Redis. It passes the validated subject as the actual Vitest positional filter;
the validation is not an evidence allowlist exemption. It logs the selected
subject, config and adapter hashes plus the exact child argv. Existing real SQL,
migrations, 14 money-loop assertions, transport guard, environment allowlist,
worker timeouts and cleanup are unchanged.

The catalog now treats test-like source owned by any `reports/` directory as
retained source evidence using its existing hashed snapshot index. Existing
`.pdim-*` treatment and all current source classifiers remain unchanged. A report
copy is indexed without an active canonical runner selector. Historical failure
bytes and current counterpart tests remain intact.

## Observed verification

| Check | Original | Candidate | Scope |
| --- | --- | --- | --- |
| Commerce selector framework | Expected red: 20 failed reported outcomes, 2 passing wrappers | 12 top-level tests and 10 subtests passed | Real adapter/runner code with explicitly intercepted framework transports |
| Catalog framework | 6 failures | 6 passes | Actual classifier, renderer and owning Node discovery/CLI |
| Real Node selector census | Report-held copies advertised incorrectly | All 124 current selectors admitted; historical selector rejected exit 2 before output creation | `--list` only, no historical/current product execution |
| Adapter Node syntax and Python syntax | Not modified | Passed | Actual candidate files |
| Guarded baseline bytes | Retained | Unchanged | Selector protected results/inputs; catalog 1,320 files, HEAD and Git status |
| New real money-loop executions | 0 | 0 | Parent must run the actual owned SQL fixture after controlled landing |

At this current doc-only checkpoint, the original collector reports 642
canonical tests, 130 root Node tests and 71 retained snapshots. The corrected
collector over the same inputs reports **635 canonical / 124 Node / 78 retained**.
The old trace's expected 72 snapshots predated six additional report-held test
copies. All seven moved paths and their original hashes appear in
`catalog/receipts/actual-census.json`:

1. `reports/accessibility-audit/2026-10-28-sealed-startup/test-before.mjs`
2. `reports/coverage-producer/2026-10-28-keepnames-final/independent-review/staged/tests/database-backup-restore-postgres.test.mjs`
3. `reports/coverage-producer/2026-10-28-keepnames-final/independent-review/staged/tests/testing/coverage-provenance.test.mjs`
4. `reports/mapping-audit/2026-10-28-topology-final/candidate/tests/endpoint-topology.test.mjs`
5. `reports/mapping-audit/2026-10-28-topology-final/candidate/tests/finite-route-paths.test.mjs`
6. `reports/mapping-audit/2026-10-28-topology-final/candidate/tests/testing/test_endpoint_mount_resolution.py`
7. `reports/mapping-audit/2026-10-28-topology-final/historical-helper/finite-route-paths.before.test.mjs`

These seven files share one catalog ownership gap category. All 710 current test/support rows and all 71
previous snapshot rows remain unchanged; no current source test is suppressed.
Landing the two new Python framework suites legitimately adds two canonical test
files: this repair alone would then yield 637 canonical files, 124 Node and 78
retained, before other agents' additions. Regenerate and measure the actual
catalog after the full controlled source batch; do not force these counts.

No canonical result, feature map, coverage counter/threshold/denominator,
master acceptance result, page/section identity or completion-plan metric was
rewritten. The 80 pages, 2,162 sections and 53,020 current work items are retained.
These framework results grant no product feature, page, load or launch approval.

## What each commerce framework test does

Run `tests/testing/test_commerce_subject_selector.py` with Python unittest or the
existing pytest runner. It requires existing Node 22+ and installed TypeScript;
there are no new package dependencies.

| Test suffix | Explicit pass criterion |
| --- | --- |
| `missing_subject_selector_rejected` | Missing mandatory selector fails before fixture import, temp allocation or child execution. |
| `relative_report_rejected` | A relative JUnit output fails before resources. |
| `absolute_subject_rejected` | An absolute alias for the registered subject is rejected. |
| `traversal_subject_rejected` | A path traversal selector is rejected. |
| `unregistered_subject_rejected` | A different TS suite cannot be selected by the owned legacy fixture. |
| `unknown_duplicate_or_ignored_arguments_rejected` | Unknown flags, repeated selectors and a config override each fail before resources. |
| `missing_registered_file_rejected` | A missing subject fails before fixture import. |
| `symlink_redirection_outside_repository_rejected` | An owned fixture symlink to an outside file cannot satisfy source binding. |
| `config_include_mismatch_rejected` | The wrong config include fails before fixture import or processes. |
| `selection_changing_or_dynamic_config_rejected` | Excludes, changed root, spreads, dynamic/duplicate includes, wrong helper import and extra config code cannot silently ignore the selector. |
| `validated_subject_drives_actual_spawn_and_owned_cleanup` | The actual adapter sends the validated subject to captured Vitest argv, logs matching source hashes/argv, strips inherited application credentials, sets owned guard/SQL flags and completes its cleanup. All transports in this framework test are explicitly intercepted; no product JUnit is fabricated. |
| `runner_forwards_recorded_subject_and_strips_application_credentials` | The actual Python runner forwards exactly the recorded subject path and strips inherited database/provider/preload values. Its intentionally interrupted synthetic framework run is recorded failed. |

Each assertion is enforced by the test. CLI negative tests preload a child-process
audit sentinel and use a fixture import sentinel; any import/child/resource work
causes failure. Positive adapter checks capture its real child `spawn()` arguments
with owned framework doubles. They prove control/metadata behavior, not money
processing or SQL correctness. The actual 14-case product suite must still run.

The six catalog tests and their precise criteria are documented in
`catalog/README.md`. Their fixture test source deliberately throws if executed;
classification parses source and Node selection checks use `--list` only.

## Reproduce the outside candidate

Prepared tools used here are Python 3.12.14, Node v22.23.3 and the checkout's
existing npm dependencies. The following command reruns the same selector test
bytes against originals (expected exit 1) and candidate (expected exit 0), writes
raw logs and genuine framework JUnit/JSON receipts under `selector/receipts/`,
and verifies protected root inputs/results remain unchanged:

```sh
/workspace/.cloud-python/bin/python /workspace/onboarding-results/commerce-catalog-repairs/selector/verify.py
```

For a direct candidate test run without pytest:

```sh
env -i PATH=/workspace/.cloud-tools/node_modules/.bin:/usr/bin:/bin \
  HOME=/workspace/onboarding-results/commerce-catalog-repairs LANG=C TZ=UTC \
  MAXBOOSTER_SELECTOR_SOURCE_ROOT=/workspace/onboarding-results/commerce-catalog-repairs/candidate \
  MAXBOOSTER_SELECTOR_DEPENDENCY_ROOT=/workspace/maxbooster7.5 \
  /workspace/.cloud-python/bin/python -B \
  /workspace/onboarding-results/commerce-catalog-repairs/candidate/tests/testing/test_commerce_subject_selector.py -v
```

`MAXBOOSTER_SELECTOR_SOURCE_ROOT` and `MAXBOOSTER_SELECTOR_DEPENDENCY_ROOT` are
framework review overrides for outside candidate files. They are not used by the
commerce adapter/runner or production application. On another machine, use its
Python/Node locations and installed checkout. The direct test defaults to its
own repository root after landing and needs no review overrides.

Catalog clean-environment reproduction, actual read-only census and each
regression's instructions are in `catalog/README.md`. `catalog/verify_candidate.py`
is a pre-landing receipt generator; its original input/count guards deliberately
cease to match after new sources land. Preserve its original receipts.

## Exact remaining acceptance sequence

1. Parent verifies `manifest.json` before hashes and absence of both new tests,
   then lands exactly `source.patch` (or copies only the five manifest files).
   This agent has no authorization to edit the root checkout.
2. Re-run both framework suites from the landed source with the existing isolated
   Python runner. Node must be 22+; TypeScript must already be installed.
3. With the prepared PostgreSQL 17 and Redis tools and required runtime library
   path, use the credential-free runner:

   ```sh
   python3 scripts/testing/run-commerce.py --only legacy-beat --output /an/owned/outside/evidence-directory
   ```

   The runner builds a fresh sanitized environment; it inherits no application
   database URL, provider secret, account credentials or `NODE_OPTIONS`. Its owned
   PostgreSQL uses Unix sockets; Redis is owned loopback only; the existing egress
   guard prevents provider transport. Do not replace this with mocked framework
   transports or live provider credentials. Capture actual output, 14 JUnit cases,
   selection/hash/argv receipt, integer exit and final owned cleanup.
4. Verify all original 14 assertions execute and pass, hashes match current source,
   the command's subject equals its recorded path, and no owned fixture process or
   temporary resources remain. A selector line alone grants no acceptance.
5. Parent runs a fresh frozen master and strict source-evidence reconciliation.
   Retain historical results; never assign new source identities to old PASS rows.
   These fixes target 14 binding occurrences and one catalog gap, not whole-page
   feature implementation, 100% coverage or launch approval.

Rollback reverts only the reviewed source/test patch and reruns the affected
checks. Retain failed and passing receipts as historical evidence. Do not delete
source tests, change original money-loop assertions, lower thresholds, alter
production denominators, or recategorize current tests to manufacture success.
