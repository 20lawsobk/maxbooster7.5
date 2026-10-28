# Canonical Python assertion-oracle review

The canonical Python runner executes test files with `python -m pytest`, not
their `if __name__ == "__main__"` aggregators. A custom assertion helper must
therefore raise when its condition is false. Merely printing `FAIL` and
incrementing a counter that only `main()` checks can turn a false condition into
a passing pytest case.

The review confirmed that defect in five canonical modules:

| Module beneath `external/maxcore/artifacts/ai-training-server/` | False-condition bookkeeping | Current pytest cases |
| --- | --- | ---: |
| `ai_model/retrieval/test_pipeline.py` | `_check` appends `_FAILS` | 8 |
| `ai_model/retrieval/test_phase4.py` | `_check` appends `_FAILS` | 10 |
| `ai_model/retrieval/test_rcgs.py` | `_check` appends `_FAILS` | 4 |
| `ai_model/retrieval/test_retrieval.py` | `_check` increments `_failures` | 13 |
| `ai_model/rta/test_render_contracts.py` | `_check` appends `_FAILS` | 3 |

Each helper now preserves that bookkeeping and raises `AssertionError` for the
failed condition. Successful conditions remain successful. The first two fixes
and their actual imported-module counterexample are retained in
[the retrieval assertion cohort](../../reports/release-rehearsal/2026-10-27-retrieval-assertion-quality/README.md).
The additional three and the permanent all-five regression are retained in
[the Python oracle cohort](../../reports/python-oracle-acceptance/2026-10-27/README.md).

This correction makes the existing assertions authoritative under their actual
runner. It does not add missing product assertions, establish generation
quality or prove that every test in the repository is sufficient.

## Persistent regression and execution

`tests/testing/test_assertion_oracles.py` has ten parameterized regressions: one
false-condition and one true-condition probe for each exact current helper.
They parse the canonical source and compile only its actual `_check` definition,
preserving source filename and line positions. Full model modules, upload paths
and their import-time initialization are not imported by these probes.

Each false probe runs a real child pytest process and requires exit 1, exactly
one test failure of type `AssertionError` containing its unique marker, no
collection/import/name error, and the expected failure bookkeeping. The true
probe requires exit 0, a real passing test and no recorded failure. Children
receive only owned temporary HOME/TMPDIR, tool/library paths and test-runner
settings; they inherit no application credentials or model configuration.
These are oracle regressions, not extra product-acceptance cases.

Run from the repository root using the prepared Python 3.12 environment with
pytest and the application dependencies:

```sh
python3 scripts/testing/run-python-suites.py \
  --file tests/testing/test_assertion_oracles.py \
  --output /tmp/maxbooster-oracle-new-run
```

To rerun all five real suites and the oracle regressions together:

```sh
python3 scripts/testing/run-python-suites.py --workers 1 \
  --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py \
  --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py \
  --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py \
  --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py \
  --file external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py \
  --file tests/testing/test_assertion_oracles.py \
  --output /tmp/maxbooster-five-oracle-new-run
```

Use a new output directory to preserve earlier attempts. The canonical runner
provides isolated private model state, no inherited credentials, an ephemeral
loopback-only network guard and owned process-group cleanup. Source and runtime
prerequisites remain those documented by the master Python instructions.

The retrieval pipeline, phase4 and RCGS suites redirect real image generation
and matching retrieval aliases into owned temporary upload directories under
both pytest and their module entrypoints. RCGS now reuses the same context
manager, rather than writing its fixed test asset names into repository upload
state. The fixture restores aliases and removes temporary files on exit. The
other two suites use in-memory data/array render contracts.

## Results and scope

The original three additional helpers were proven with exact AST-extracted
false conditions: pytest reported three passes and exit 0 even while printing
`FAIL`/`FAILED`. Their full-file hashes match the retained baseline commit.
After repair, the same three intentional conditions produce three actual
`AssertionError` failures and exit 1. Those expected negative probes are not
failed product tests and are not combined with product case totals.

The focused positive cohort executes 38 actual cases across the five modules
plus ten oracle regressions. Direct module entrypoints additionally exercise
their existing `_check` calls; those diagnostic check counts are not extra
pytest cases. The receipts bind exact test-source hashes, real exit codes,
JUnit outcomes, log hashes and upload-state integrity. The source upload
inventory is retained only as aggregate count, bytes, modes and digest, without
file contents. The final fixture leaves that inventory unchanged and removes
its owned temporary upload directories.

A bounded static review covered the canonical runner's discovered Python files
and checked other custom failure counters, returned test values, standalone
aggregators and thread-error collections. The existing audio-analysis `_check`
already raises; reviewed thread-error tests assert their collected errors;
ordinary unittest assertions also raise. Live endpoint/load tools remain
explicitly blocked rather than counted as passing offline suites. Their
standalone failure exits are not defects merely because they aggregate results.

No further instance of this specific reachable log/counter-only `_check`
pattern was identified in that reviewed set. This is not a complete semantic
oracle audit, a global coverage result, live provider proof or launch approval.
