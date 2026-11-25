# Counted progress reporter candidate

This candidate adds `scripts/testing/report-progress.py` and `tests/testing/test_report_progress.py`. Root source remains unchanged until parent review and landing.

From the repository root, with the prepared Python interpreter:

```sh
python scripts/testing/report-progress.py --output reports/progress/current
python -m unittest discover -s tests/testing -p test_report_progress.py -v
```

For review before landing:

```sh
python /workspace/onboarding-results/measured-progress/report-progress.py --repo /workspace/maxbooster7.5 --output /workspace/onboarding-results/measured-progress/current-baseline
python /workspace/onboarding-results/measured-progress/test_report_progress.py
```

The reporter reconciles all 80 unique page identities, actual registered check rows, all plan work statuses, readiness counts and manifest bindings, and the coverage summary against the canonical group receipt. It reuses the existing launch audit's pure inventory validation and source/master freshness functions. It hashes artifact bytes as read, verifies they remain unchanged, and checks source inputs before and after collection. Imported helpers cannot write bytecode during collection. It does not regenerate reports, change statuses, mutate data, execute providers or count overlapping test groups as a unique total.

`progress.json` and `progress.md` keep three distinct acceptance fractions: Green pages, required checks and whole-plan work. Each uses its actual observed numerator/denominator. Four independent code coverage fractions expose both raw calculated percentages and Istanbul's recorded truncated values. Overall implementation completion remains `null` because no verified full-product implementation denominator exists. These distinct measures are never averaged or substituted for each other.

Exit 0 means a current, internally consistent measurement, **not launch approval**. Exit 1 means historical/stale observations only; `currentVerified` is null. Exit 2 means missing or invalid evidence and no current credit. Adding this reporter or any new source invalidates old current-source receipts until the new source epoch is tested; the previous measurement remains explicitly historical. Source and evidence hashes, tested revision, master timestamps and generated timestamp accompany successful measurements.

`test_report_progress.py` has 13 framework tests covering real read-only collection, missing evidence CLI behavior, stale evidence credit, exact 80-page identity, duplicate identities, contradictory summaries, Green conditions, malformed/boolean/overflow coverage counters, differing raw/canonical percentages, zero denominators and disagreement between the plan and readiness. They exercise reporting integrity; passing them does not close product-feature acceptance.

Suggested orchestration: run the reporter after the actual master and the generated launch-readiness audit, with no source changes between them. It should remain an observational command; its exit status is not a replacement for the strict master/Green launch gate.
