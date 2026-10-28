# Canonical retrieval tests isolate generated images

The prior master sweep passed retrieval assertions while an unseeded image from
`test_pipeline.py::test_ingest_generated_asset` was written into the checked-out
MaxCore runtime upload directory. The release's final source guard rejected that
concurrent mutation. The retained
[before evidence](../../2026-10-27-analytics-dependencies-final/source-drift-diagnosis.json)
records the new file, exact hash and matching test execution time. This proof
does not create another source-local image to reproduce the same known leak.

The two canonical files now direct their real image engine and retrieval readers
to one owned temporary upload root. Pytest setup/teardown hooks and each
documented `python -m` entrypoint enter the same context. Existing module aliases
are redirected together; aliases imported during the context are restored too.
Existing render, feature, retrieval, deduplication and ingestion implementations
remain real. Cleanup touches the owned temporary directory and preserves existing
source uploads.

[receipt.json](receipt.json) records five final commands, all exit 0:

1. The two canonical pytest files: **18 cases passed**, no errors/failures/skips.
2. `python -u -m ai_model.retrieval.test_pipeline`: all original scripted checks.
3. `python -u -m ai_model.retrieval.test_phase4`: all original scripted checks.
4. The retained late-import reader regression probe.
5. An actual image render followed by a deliberate exception: existing and
   late-import reader paths restored and the temporary root removed.

Before and after **every** command, all 36 existing source upload files retained
identical hashes, sizes and modes. No owned temporary root remained. File
contents are not included in this evidence; only inventory hashes are retained.
The recorded `counts.json` distinguishes pytest cases from overlapping scripted
checks rather than summing them as extra feature coverage.

`first-isolation-pass/` preserves the first passing pytest and module runs. A
subsequent targeted probe exposed stale path aliases imported while the temporary
context was active; `late-import-before.json` and its failure log retain that
development regression. The helper was corrected and all five final commands
then passed. Nothing is represented as an original production-model failure.

To reproduce with the documented test tools installed, run the commands from
`external/maxcore/artifacts/ai-training-server`, or execute the retained
[run-proof.py](run-proof.py) from the repository root. The proof driver creates
credential-free subprocess environments and records source/upload hashes and
temporary cleanup. It overwrites its own generated final logs; preserve an old
cohort before using it for a later source revision. The module entrypoints do
not gain a pytest runtime dependency.

This closes the demonstrated test upload leak. Release packaging policy,
subsequent full master checks and a fresh prepared/cold payload remain separate
work. No production or global readiness claim is made here.
