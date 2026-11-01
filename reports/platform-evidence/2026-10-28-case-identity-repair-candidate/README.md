# Case identity repair candidate

Outside-only review candidate against repository HEAD `d9d04498a02c25a1b6ce03306adc20727e9aa2d1` (tested code epoch `10d19267`). No source file or canonical acceptance result was changed by this work. Other agents own the commerce and catalog repairs. This report does not grant launch approval or change any page to Green.

The fifteen-file [source patch](source.patch) repairs all **90 targeted ambiguous identity occurrences** from the retained 104-row trace: 64 Vitest occurrences and 26 Python occurrences. It applies cleanly with `git apply --check`. The other fourteen commerce occurrences are outside this patch.

| Actual exercise | Result | Meaning |
| --- | --- | --- |
| Ten original Vitest files, before | 173 passed; 0 failed/skipped | Reproduced the original duplicate labels. |
| Same ten files, after | 173 passed; 0 failed/skipped | All 173 emitted identities unique; all original cases retained. |
| Two unchanged copied MaxCore Python files | 151 passed; 0 failed/skipped | All 26 affected class-scoped leaves now distinct; 125 already unique names unchanged. |
| Provenance/extraction/topology regressions | 99 passed; 0 failed/skipped | 83 platform evidence, 9 summary, 7 endpoint topology cases. Candidate bytes unchanged throughout sealed execution. |
| Independent shared-reader review | 5 checks passed | Mixed outcomes, nesting, distinct classes, same-class duplicates and compatibility reviewed independently. |
| Exact HTTP compatibility | 8 of 8 identities unchanged | Retained records decoded for compatibility only; no old PASS promoted to a new master. |

These are overlapping validation exercises, so their counts are not combined into a platform coverage or completion percentage. Within this narrowly assigned repair batch, **90/90 targeted identity occurrences are repaired in fresh candidate output**. Platform-wide readiness remains governed by the current master, complete feature acceptance and the unchanged 100% coverage requirements.

## Exact implementation

The ten trace-derived Vitest files contain fifteen colliding `it.each` title declarations. Each title gains only ` [row %#]`, which installed Vitest 4.1.12 formats as its zero-based table row index. There are 82 total rows at those declarations; 64 originally shared a colliding emitted label. `validate.py` reverses precisely those fifteen literal edits and verifies every other byte equals the original source. Inputs, callback arguments, assertions, skip declarations and mixed-table empty-array rows are unchanged. Actual before/after JUnit counts and outcomes match, and stripping only the new index suffix reproduces the original case multiset.

The new `scripts/testing/junit_evidence.py` is shared by the summary extractor and strict underlying XML proof reader. It preserves raw names, classnames and complete nested suite names. Existing unique names and every non-Python name retain their identity. A Python `(file, raw name)` repeated across distinct nonblank explicit XML classnames becomes `classname::raw name`, for example `ai_model.director.test_director.StoryBibleTests::test_for_platform`. It does not invent class scope from suite labels. Missing names/classes remain ambiguous. No legitimate Python method/class/test body is renamed.

The proof reader still counts **every occurrence** before admitting a unique passing leaf. Same-class pass/pass, pass/failure and pass/skip duplicates therefore remain ineligible. A distinct single class does not inherit another class's outcome. Current source inventory, exact command, selected group, source digest, file/log hashes, artifact ownership, strict integer exit codes and execution-window checks remain intact; Node duplicate file executions and aggregate browser ownership remain rejected. The XML cache key now includes group because Python scoping is group-specific.

## Evidence and how to use it

- [source-hashes.json](source-hashes.json): exact baseline/candidate hashes for all fifteen changed/new source files. `baseline-source/` and `proposed/` retain the reviewable bytes.
- [baseline.json](baseline.json): baseline HEAD, patch hash and hashes of every retained old trace artifact. The 104-row trace is read-only.
- [validation-results.json](validation-results.json): explicit row counts, title-only byte guards, all 26 fresh qualified Python rows and all eight unchanged HTTP identities.
- [raw/vitest/receipts.json](raw/vitest/receipts.json): actual Node 22 commands, time bounds, exits and log hashes. `before.junit.xml`/`after.junit.xml` retain all 173 leaves each. `sites.json` cites every original parameter declaration.
- [raw/maxcore/receipt.json](raw/maxcore/receipt.json): unchanged copied subject hashes before/after and the two original `run_suite` results. Original clean environment, private temporary state, network guard and bytecode suppression remain active. Source was copied first, so imports and native caches could not write into root source.
- [raw/framework/framework-sealed-receipt.json](raw/framework/framework-sealed-receipt.json): final actual 99-case run with candidate source hashes before/after. Its log/JUnit retain every result. The six new real-pytest scenarios cover distinct classes with pass/pass, pass/skip and pass/failure outcomes, plus same-class duplicate pass/pass, pass/failure and pass/skip attempts.
- `raw/http-compatibility/`: the eight exact retained mapped records and unchanged original XML, used only to test decoder compatibility.
- `raw/independent-review/`: independent review script and five-check receipt, executed against the owned candidate, separate from the sealed framework run.
- [toolchain.json](toolchain.json): Node v22.23.3, Python 3.12.14, Vitest 4.1.12 and pytest 9.1.1.
- [manifest.json](manifest.json): SHA-256 for every report file except the manifest itself.

From the repository root, verify the saved candidate/report invariants without running application code or contacting services:

```sh
/path/to/prepared/python reports/platform-evidence/2026-10-28-case-identity-repair-candidate/validate.py --repo .
```

The validator exits nonzero if a case disappears, an outcome changes, a repaired identity collides, a non-title byte changes, a mapped HTTP name changes, the sealed framework log/source hashes mismatch, or any of its explicit counts differ. It writes only its own `validation-results.json`. It does not invoke the acceptance linker or mark checks verified.

After the parent integrates the patch in the controlled source window, rerun the meaningful framework checks with the prepared interpreter:

```sh
/path/to/prepared/python -m pytest -q \
  tests/testing/test_platform_evidence.py \
  tests/testing/test_summary_results.py \
  tests/testing/test_endpoint_mount_resolution.py \
  --junitxml=/tmp/case-identity-framework.xml
```

The copied actual Vitest commands are fully recorded in `raw/vitest/receipts.json`; run the listed ten files with Node 22, the existing `vitest.config.ts`, and JUnit/verbose reporters. Do not replace their table inputs or omit a failing file. The two MaxCore sources can be selected with the existing runner:

```sh
/path/to/prepared/python scripts/testing/run-python-suites.py \
  --python /path/to/prepared/python \
  --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py \
  --file external/maxcore/artifacts/ai-training-server/ai_model/director/test_director.py \
  --output /tmp/case-identity-maxcore
```

The report retains an initial outside-only `--configLoader runner` startup attempt that failed because the unchanged config requires its normal `__dirname` handling. The successful before/after executions use the existing default config loader with an owned dependency-link directory and cache disabled. That setup failure was not hidden, retried as a product PASS or counted as a failed product test.

## Integration and rollback

The parent must apply/review the complete fifteen-file patch, finish the separate commerce/catalog repairs, then run a fresh source-frozen master. Old source-bound master results cannot become current by recomputing names or digests. No acceptance-map edit is included. Before admitting broader feature links, review the actual assertion scope; uniqueness alone does not prove a whole feature or page.

Rollback reverses this metadata/identity patch as one change while retaining these historical receipts. The previous ambiguity rejection then returns; it must not be replaced by unioning duplicate cases, removing negative outcomes, reducing coverage thresholds or dropping input rows.
