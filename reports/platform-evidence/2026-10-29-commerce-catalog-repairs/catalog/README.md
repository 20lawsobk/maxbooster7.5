# Catalog report-source ownership repair candidate

This directory is an isolated review candidate. Nothing has been applied, staged,
committed, or regenerated in `/workspace/maxbooster7.5`.

The change makes `snapshot()` retain every test-like source under `reports/`,
using the existing snapshot index and SHA-256 fields. `.pdim-*` copies retain their
existing treatment. Current test classifiers, source assertions, operational
rules, runner builders, and ordinary non-test report documents are unchanged.
The historical failing source is never imported or executed.

## Files to review

- `catalog-source.patch`: the three-line source correction only.
- `catalog-tests.patch`: the new portable six-case unittest suite only.
- `catalog-repair.patch`: both changes, ready for a controlled landing.
- `candidate/scripts/testing/generate-catalog.py`: complete candidate source.
- `candidate/tests/testing/test_catalog_snapshot_ownership.py`: complete proposed test source.
- `verify_candidate.py`: outside-only, read-only pre-landing census and Node CLI check.
- `receipts/`: raw baseline/candidate logs, structured results, actual census,
  selector output, and protected-file hashes before and after.
- `manifest.json`: artifact SHA-256 values.

`git apply --check catalog-repair.patch` succeeded against the unchanged checkout.
The patch has not been applied. The candidate and tests add no dependencies.

## Verified results and census reconciliation

At HEAD `d9d04498a02c25a1b6ce03306adc20727e9aa2d1`, all six tests fail against the
original collector and all six pass against the candidate. Both executions use
the same test bytes and metadata-only owning Node runner.

| Pre-landing classifier | Canonical tests | Root Node | Retained snapshots |
| --- | ---: | ---: | ---: |
| Original collector at current HEAD | 642 | 130 | 71 |
| Candidate collector, same repository inputs | 635 | 124 | 78 |

The earlier rejected-case trace expected `636 / 125 / 71` to become
`635 / 124 / 72`. Since that trace, doc-only checkpoints also retained six staged
test sources under coverage/mapping reports. The ownership rule correctly retains
those six too. Their exact seven paths and hashes appear in
`receipts/actual-census.json`; no current test is removed. Corrected canonical and
Node totals still match 635 and 124.

The full comparison proves:

- All 710 current entry rows (635 tests plus 75 support sources) remain identical.
- All 71 previously retained snapshot rows remain identical.
- All seven newly retained report sources preserve their exact source hashes.
- The 11 non-executable support rows and the combined input path/hash digest are unchanged.
- The actual Node builder discovers exactly the corrected 124 Node selectors.
- Its real CLI admits all 124 selectors with `--list` and rejects the historical
  accessibility report selector with exit 2 before creating an output directory.
- All 1,320 protected source, test, plan, report, results, and coverage files retain
  identical SHA-256 values. Git HEAD and status remain unchanged.

The unchanged input digest refers to a read-only comparison against the same
checkout bytes. Landing the generator change and new test will legitimately
change source hashes and add one canonical Python test file. With this repair
alone landed, the expected canonical total becomes 636, with 124 root Node and
78 retained snapshots. Other independently reviewed new tests may change totals
further; regenerate the real catalog only after a controlled source landing.

## What each regression does

| Test method suffix | Pass/fail requirement |
| --- | --- |
| `current_suite_is_canonical_and_report_copy_is_hashed_only` | Keeps the current Node suite and its original assertion title; only its report copy becomes a retained hash row. |
| `report_ownership_covers_plain_and_snapshot_paths_without_filename_suppression` | Retains ordinary report copies, report `.snapshots`, and existing `.pdim-*`; identically named current files outside report ownership remain indexed. |
| `existing_current_classifications_and_assertions_are_preserved` | Current Node, TypeScript/Vitest, Python, commerce, operational shell, and runner-support metadata remain unchanged after a report copy is added. |
| `unique_report_replay_sources_remain_documented_without_active_commands` | Unique report validators/replay recipes retain inventory and rendered-document hash rows without active commands; ordinary report instructions are not treated as executable tests. |
| `actual_node_builder_admits_generated_commands_and_rejects_report_selectors` | Exercises the owning runner's actual discovery and CLI on fixture metadata. Every generated selector is admitted, browser/commerce remain separately grouped, and both historical report selectors fail before output creation. |
| `census_is_read_only_and_preserves_every_input_hash_and_result_counter` | Repeated collection changes no fixture bytes, original assertions, retained inputs, example counters, coverage threshold, or catalog output. The combined input digest is recomputed independently. |

Fixture source deliberately contains a throw if executed. The collector parses
source; the runner is invoked only with `--list`. The example fixture counters are
test data and are not reported as production run counts.

## Reproduce without changing the checkout

Prepared tools used: Python 3.12.14 and Node v22.23.3. Node source execution is not
needed for this review. Both commands below write only under this outside tree.
The census script intentionally requires the current pre-landing totals; it is a
review receipt, not a replacement for the repository's normal catalog command.

Candidate tests:

```sh
env -i PATH=/workspace/.cloud-tools/node_modules/.bin:/workspace/.cloud-python/bin:/usr/bin:/bin \
  HOME=/workspace/onboarding-results/commerce-catalog-repairs/catalog LANG=C CI=1 PYTHONDONTWRITEBYTECODE=1 \
  MAXBOOSTER_TEST_REPO_ROOT=/workspace/maxbooster7.5 \
  MAXBOOSTER_CATALOG_SOURCE=/workspace/onboarding-results/commerce-catalog-repairs/catalog/candidate/scripts/testing/generate-catalog.py \
  /workspace/.cloud-python/bin/python -B \
  /workspace/onboarding-results/commerce-catalog-repairs/catalog/candidate/tests/testing/test_catalog_snapshot_ownership.py -v
```

To reproduce the baseline failure, change only `MAXBOOSTER_CATALOG_SOURCE` to
`/workspace/maxbooster7.5/scripts/testing/generate-catalog.py`. Expect six failures
and exit 1 before landing, versus six passes and exit 0 for the candidate.

Read-only actual repository census, 124 admitted real selectors, and rejected
historical report selector:

```sh
env -i PATH=/workspace/.cloud-tools/node_modules/.bin:/workspace/.cloud-python/bin:/usr/bin:/bin \
  HOME=/workspace/onboarding-results/commerce-catalog-repairs/catalog LANG=C CI=1 PYTHONDONTWRITEBYTECODE=1 \
  /workspace/.cloud-python/bin/python -B \
  /workspace/onboarding-results/commerce-catalog-repairs/catalog/verify_candidate.py \
  --repo /workspace/maxbooster7.5 \
  --candidate /workspace/onboarding-results/commerce-catalog-repairs/catalog/candidate/scripts/testing/generate-catalog.py \
  --output /workspace/onboarding-results/commerce-catalog-repairs/catalog/receipts
```

After controlled landing, run the portable test directly from the repo:

```sh
python3 -B tests/testing/test_catalog_snapshot_ownership.py -v
```

The normal catalog regeneration command remains
`python3 -B scripts/testing/generate-catalog.py`; it writes the inventory and
catalog and was deliberately not run against the checkout during this review.
`--check` only compares those generated files against current source metadata.

## Limits

This repair closes catalog ownership/discovery consistency only. It provides no
new application, commerce/payment, accessibility, feature, production startup,
coverage percentage, load, page, or section execution evidence. No launch score,
acceptance map, coverage denominator, master-result counter, or page/section
identity is rewritten. No provider credentials are inherited, no provider/network
calls occur, and no application/database/private resources are used.
