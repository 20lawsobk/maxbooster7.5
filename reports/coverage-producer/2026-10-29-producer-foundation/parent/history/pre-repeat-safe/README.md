# Parent coverage command binding candidate

This outside-only patch changes `scripts/testing/run-all.py` and adds `tests/testing/test_coverage_command_binding.py`. It depends on the separately reviewed public Vitest outcome reporter. It does not change repository files, coverage includes/excludes, thresholds, application behavior or published coverage counters.

The old coverage job receipt hashed its log but did not bind its JUnit bytes. The retained independent control could substitute one internally consistent passing case for the actual 2,771 cases. The parent wrapper now captures fresh JUnit bytes and the public run-end outcome immediately after the actual owned command, recording hashes, exact root/suite/leaf counts, a fresh command nonce, reporter source hash and parent time bounds. A later replacement must fail the captured hash.

Artifact reads reject missing/stale artifacts, nonregular files, symlink ancestors, input-size excess and files that change while read. The outcome must reconcile module identities, per-module counts, aggregate counts and the exact JUnit totals. Actual unhandled errors independently prevent eligibility even when public run reason is `passed` or the child exits zero. Missing/unexpected modules, skipped/pending tests, failed assertions, collection errors and interruption remain failures of the admission gate. The actual child exit code is retained.

`coverageEvidence.status = bound` means these producer-time bytes correspond. `validForAdmission` is one prerequisite for a later strict admission reader. Neither grants coverage threshold success or launch approval. An exit-one threshold failure remains exit one and the master remains failed; no threshold is relaxed.

Nanosecond values are decimal strings so a JavaScript reader can use BigInt without losing integer precision. Installed Vitest 4.1.12 omits the root JUnit `skipped` attribute; each suite and leaf still supplies the exact skipped count, and an explicit root attribute is checked when present.

Run the focused real-subprocess tests with:

```sh
/workspace/.cloud-python/bin/python -B \
  /workspace/onboarding-results/c5-producer-foundation/parent/candidate/tests/testing/test_coverage_command_binding.py
```

The 12 test methods exercise fresh byte binding, 1-vs-2,771 count substitution, later hash replacement, repeated identical XML with independent nonce, threshold failure, unhandled errors including child exit zero, real assertion failure, skips/interruption/module mismatch, stale/missing outputs, nonce/source/count/time/type tampering, bounded inputs, symlinks and reporter selection. Initial skip-control failure is retained in `tests-initial.txt`; it identified the real installed JUnit root schema omission and was corrected without dropping skipped-case validation.

`source.patch` applies cleanly to the source frozen during the current master. `candidate/scripts/testing/common.py` is an unchanged outside harness dependency and is not part of the patch. After integrating the public reporter and these two files together, rerun the focused tests, actual reporter/parent integration and a fresh unchanged-source full master. The consumer must verify the captured hashes and all other source/map/counter/process gates before any candidate merge.
