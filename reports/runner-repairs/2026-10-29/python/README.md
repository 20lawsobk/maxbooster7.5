# Python runner completion repairs

Candidate source for local main 8a9b638; root code and canonical reports were not changed by this investigation.

The completed master failed the real read-only progress collection test because a second Python worker finalized `reports/test-verification/python/tests__testing__test_platform_evidence.txt` during the full Git-visible file snapshot. The writer's exact post-write mtime was 1793313595058557959, matching the assertion diff. Progress collection itself did not write that file.

`execute_suites` retains two-worker parallelism for ordinary files, joins their owned process groups and final report writes, then executes explicitly registered quiescent read-only suites. Every selected suite still executes exactly once. Normal failures, blocks and timeouts do not suppress the final phase or change their original statuses. The full snapshot assertion is unchanged. This protects against writes from this runner; operators must still avoid unrelated concurrent repository writes.

Independent reconciliation also found one report-owned historical Python test had run despite catalog retention. Discovery now applies the catalog's `reports/` and `.pdim-` ownership policy, retains historical paths in `duplicateSnapshots`, and rejects explicit historical selectors before output allocation. Current source suites and genuine normal directories such as `reports-archive/` remain selected. No retained copy is deleted.

## Reproduce

```sh
MAXBOOSTER_TEST_REPO_ROOT=/workspace/maxbooster7.5 \
MAXBOOSTER_PYTHON_RUNNER_SOURCE=/workspace/onboarding-results/python-failure-2026-10-29/candidate/scripts/testing/run-python-suites.py \
/workspace/.cloud-python/bin/python -m pytest -q -p no:cacheprovider \
 /workspace/onboarding-results/python-failure-2026-10-29/candidate/tests/testing/test_python_runner_scheduling.py
```

The seven tests create owned disposable Git repositories and execute real pytest child interpreters: writer cleanup and result-file finalization before the read-only phase; ordinary worker overlap; failed ordinary receipt retention; owned timeout retention; retained historical copies remaining unexecuted; invalid historical selector rejection; and exact quiescent-only selection. All seven candidate tests pass. Against the unchanged baseline runner, the same tests expose the overlap and historical ownership defects; the original diagnostics are retained. Synthetic fixture success is runner acceptance only, not feature or page readiness.

The separate existing `progress-goal-gate-fix/source.patch` was reviewed. It correctly replaces summary's intentional non-approval flag with independently recomputed current master launch-gate passage plus recorded launch-gate truth, while retaining all80 Green and current audit requirements. Its full synthetic Green fixtures cannot promote actual pages.

After integration, reconcile the completed master launch audit before running actual progress collection. The unchanged real read-only regression correctly rejects completed inconsistent old/new artifacts. Then run both the actual read-only check and these scheduler tests; run the completed full master again on the next frozen source epoch.

No production schema or remote data was mutated. No threshold, whole-platform declaration, source inventory or snapshot assertion was weakened.
