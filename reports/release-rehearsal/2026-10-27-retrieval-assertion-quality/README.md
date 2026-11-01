# Retrieval tests fail when their real checks fail

Both canonical retrieval modules used `_check(name, condition)` to print a
failure and append `_FAILS`. Their direct module entrypoints inspected that list,
but pytest did not. A false condition could therefore leave pytest green.

Each checker now appends the existing failure record and raises
`AssertionError(name)`. Passing behavior and the original printed checks remain
unchanged. This cohort changes only that assertion behavior in the same two
test files; it does not modify the image generator or retrieval implementation.

The private pytest-child probe imports the **actual** two modules and calls
their real `_check(..., False)` functions. It adds no assertion around those
calls and substitutes no checker. Retained evidence shows:

| Execution | Actual pytest result | Child exit |
| --- | --- | --- |
| [Before repair](before-negative.json) | 2 falsely passed | 0 |
| [After repair](after-negative.json) | 2 failed with the real `AssertionError` | 1 |
| [Canonical positive rerun](receipt.json) | All 18 passed; no errors/failures/skips | 0 |

The after-repair failures are **deliberate negative proof**, kept outside
canonical test discovery. They are not recorded as production test failures or
added to the count of passing feature assertions.

The final [receipt](receipt.json) also records both documented module entrypoints
and the retained upload isolation probes:

- Pipeline module: 37 original scripted checks passed.
- Phase4 module: 40 original scripted checks passed.
- Existing and late-import reader aliases restored after the owned context.
- Actual render followed by a deliberate exception restored aliases and removed
  its temporary directory.

Every one of these five commands left all **36 existing source upload files**
unchanged by hash, size and mode, with no owned temporary roots remaining. The
scripted checks overlap pytest behavior and remain separately counted in
[counts.json](counts.json). Earlier upload-isolation evidence stays intact in
the [previous cohort](../2026-10-27-runtime-upload-isolation/python/README.md).

Run the canonical tests from `external/maxcore/artifacts/ai-training-server`:

```sh
python -m pytest -q -p no:cacheprovider --import-mode=importlib \
  ai_model/retrieval/test_pipeline.py ai_model/retrieval/test_phase4.py
python -u -m ai_model.retrieval.test_pipeline
python -u -m ai_model.retrieval.test_phase4
```

The retained `negative-oracle-proof.py <new-label>` captures a private child
pytest result under the selected label; **child exit 1 with two failures is
expected on the repaired source**. The capture driver itself succeeds after
recording that negative proof. `run-proof.py` reruns positive, direct-entrypoint
and cleanup checks using the recorded cloud Python tool and a credential-free
environment. Preserve an existing cohort before rerunning either evidence
driver, since selected output labels can be overwritten.

This establishes the two checkers' failure semantics and preserves their real
passing behavior. It is not a global coverage, release or production-readiness
claim.
