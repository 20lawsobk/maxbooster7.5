# Current-execution binding repair and focused regressions

Recorded October 28, 2026, America/Detroit. The repaired gate requires an actual
selected execution bound to unchanged current source before an exact passing
case can qualify as feature evidence. Editing a candidate platform digest or
refreshing `case-results.json` cannot make old execution current. Source changes
are committed in `e5124419` and `10d192675beefcf1b7beef3ce47c271db0cc17cf`.

This cohort preserves actual focused results and original failure reproductions.
It grants no product feature acceptance, page Green status, coverage increase or
launch approval. The integrated master was running at documentation time; its
result and the next current-source matrix must be reconciled separately.

## Actual results

| Retained artifact | Recorded result | Meaning |
| --- | --- | --- |
| `platform-evidence-stale-baseline-2026-10-28.txt` | 1 failed, 25 deselected, 0.07s | The new actual main-linker test required UNVERIFIED; the old gate wrongly marked old execution PASS after the candidate digest was rewritten. This is the original expected failure reproduction. |
| `platform-evidence-fixed-2026-10-28.{txt,xml}` | 118 passed, zero failures/errors/skips, XML 7.872s | Intermediate focused repair; retained with its actual earlier scope. |
| `platform-evidence-final-2026-10-28.{txt,xml}` | 124 passed, zero failures/errors/skips, XML 9.688s | Intermediate focused expansion; retained without substituting for the final source. |
| `platform-evidence-reviewed-final-2026-10-28.{txt,xml}` | 130 passed, zero failures/errors/skips, XML 10.365s | Independent review found duplicate XML identities, malformed boolean exit codes and ambiguous browser/default-file bindings; their regressions are included here. |
| `platform-evidence-duplicate-file-red-2026-10-28.txt` | 3 failed, 74 deselected, 1.44s | Actual duplicate Node executions wrongly borrowed an earlier pass when the second execution passed, failed or skipped. All three required rejection. |
| `platform-evidence-duplicate-file-green-2026-10-28.{txt,xml}` | **133 passed**, zero failures/errors/skips, XML 14.564s | Final focused run includes all three duplicate-file regressions: 77 evidence cases, seven mount-consumer cases, 42 launch-audit cases and seven plan cases. |

The review JSON retains its original 130-case command, numeric exit and earlier
source hashes. It is not relabeled as final 10d source proof. The final 133-case
raw output and XML do not themselves include a shell command line or numeric
process exit; this cohort preserves the recorded pytest result without inventing
missing metadata. The reproduction command below is a usage instruction.

Two initially supplied related test paths did not exist and caused collection
errors before product cases ran. The first local selection-error output was
overwritten by a subsequent successful scoped run. Those errors are disclosed;
no retained raw receipt for the overwritten output is claimed. The separate
one- and three-failure reproductions above remain intact.

`receipt.json` records exact copied-file hashes, XML counts/timestamps and the
source bytes observed during documentation:

| File | Current SHA-256 |
| --- | --- |
| `scripts/testing/platform-register.py` | `f8c4e518a50cfb66cce48e4b305b1760df6729ffbacbdaccaddb0708ab106257` |
| `tests/testing/test_platform_evidence.py` | `7cad1816b277bb29e6f1bd43b877ffc98ba3fb92207368df5bd906f65eea7f06` |

Every copied log, XML and review JSON is byte-identical to its retained original
under `/workspace/onboarding-results`. `manifest.json` hashes every retained
cohort artifact except itself. No source, canonical master output or global
coverage file was changed while documenting this cohort.

## What the implementation validates

1. The full recorded common source file/hash map and its calculated digest must
   match current source and the actual master's unchanged-input ledger.
2. Each proof must belong to a selected, uniquely recorded actual command with
   valid timing, bounded artifact freshness, exact log hash and owned output.
   The ledger binding uses stable execution fields so normal postprocessing
   additions do not invalidate a genuine run.
3. XML identities must uniquely occur and actually pass. Python and commerce
   default-file reports require their matching successful file producer and
   command; Python also requires its exact source hash. A passing label in an
   editable case index is insufficient.
4. Node proof requires one actual successful execution for the exact file and
   unique passing TAP identity. Duplicate file executions reject that file's
   proof regardless of whether the second run passes, fails or skips. Node
   artifacts may not be borrowed across files, groups, runs or source snapshots.
5. Aggregate browser TAP cannot assign an ambiguous case to one of several
   files. A supported single-file producer must bind exact command, file, case,
   log and timing. Malformed reports, booleans masquerading as exit codes,
   failures/skips/TODO and ambiguous identities do not become proof.
6. The explicit link still requires the current platform digest, registered
   unchanged test file and every unique exact case in its declared bundle.

Passing leaf cases can qualify even when a distinct global coverage or launch
gate fails. Such qualification closes only the exact reviewed requirement; it
never supplies an overall master, endpoint, page or launch pass.

## Reproduce the focused validation

From the repository root, select the prepared Python interpreter and installed
Node 22. Use a new owned report directory; preserve this cohort:

```sh
mkdir -p reports/platform-evidence/my-new-focused-run
python -m pytest -q \
  tests/testing/test_platform_evidence.py \
  tests/testing/test_endpoint_mount_resolution.py \
  tests/testing/test_launch_readiness_audit.py \
  tests/testing/test_platform_plan.py \
  --junitxml=reports/platform-evidence/my-new-focused-run/focused.xml \
  > reports/platform-evidence/my-new-focused-run/focused.txt 2>&1
```

Record the actual shell exit, source snapshot and command with a new run. The
regressions execute bounded credential-free temporary Node/Python producers and
reject stale, substituted and ambiguous evidence; they do not run application
providers or certify product features. Do not run competing heavy suites while
the canonical full master is active.

The [acceptance-link instructions](../../../docs/testing/acceptance-link-review.md)
describe the separate frozen-master procedure and six reviewed HTTP links. The
[historical real-master compatibility replay](../2026-10-28-historical-compatibility/README.md)
accepts the eight old identities only after explicit old-source injection and
rejects them with real current inputs. It is a schema diagnostic, not new
execution. The complete all-80 plan retains all 2,162 sections and every shared,
coverage, native, deployed, provider and accessibility gate.
