# Measured completion

Run this from the prepared repository root:

```sh
npm run test:progress
```

The command writes [progress.json](../../reports/progress/current/progress.json)
and [progress.md](../../reports/progress/current/progress.md). It reads existing
execution receipts; it does not run tests, change acceptance records, or grant
launch approval. Python's standard library is sufficient.

Each percentage includes its actual numerator and denominator:

- **Green pages:** fully accepted pages divided by all 80 declarations.
- **Required-check acceptance:** exact passing source checks divided by all
  registered required checks.
- **Whole-plan acceptance:** passing retained work items divided by every item
  in the exhaustive plan, including shared and deployment work.
- **Coverage:** covered lines, statements, functions and branches divided by
  their respective instrumented totals. Raw fractions and Istanbul's truncated
  percentages remain separate.

These measurements are not averaged. Source presence, a page render, a skipped
case and a proposed fix do not count as completed acceptance. The report leaves
overall implementation completion unknown until a verified denominator exists.
Test groups overlap, so their case counts are not added into a platform total.

The reporter checks the complete source/config/test inventory, unchanged master
receipt, selected groups, source epochs, launch artifact hashes, all 80 page
identities, actual check and work-item counts, and raw coverage counters. A Green
row must also agree with its gates, exact checks and absence of blockers.

| Exit | Meaning |
| --- | --- |
| `0` | Internally consistent current measurement; the master may still have failed. |
| `1` | Historical evidence. `lastMeasured` is retained and `currentVerified` is null. |
| `2` | Missing or inconsistent evidence; no completion credit is emitted. |

After implementation changes, execute a fresh frozen master before claiming new
progress. Rebuild the launch matrix from that invocation's actual register and
exhaustive plan, then rerun this reporter:

```sh
npm run test:master -- --python /path/to/prepared/python
python3 scripts/testing/launch-readiness-audit.py
npm run test:progress
```

Keep the master's real nonzero exit and failed gates. Regenerating the inventory
or changing a candidate digest cannot make old execution current. An explicitly
selected group alone does not satisfy the complete-master requirement. The
[seven-level roadmap](launch-critical-path.md) retains the full platform scope.

The [continuation baseline](../../reports/progress/2026-10-29-baseline/README.md)
records the last fully measured `10d19267` source before the next implementation
batch: 0/80 Green, 6/33,549 checks and 6/53,020 plan items. Later source changes
make that result historical until a fresh master completes.

Validate the reporter and launch producer with the prepared Python interpreter:

```sh
/path/to/prepared/python -m pytest -q \
  tests/testing/test_report_progress.py \
  tests/testing/test_launch_readiness_audit.py
```

The regressions reject dropped pages, duplicate identities, contradictory Green
claims, malformed/overflow counts, disagreeing coverage totals, stale evidence
and missing inputs. The real read-only check compares repository files before
and after collection. Run it without concurrent writes to Git-visible files;
unrelated report generation would otherwise invalidate that comparison.
While the master is unfinished, rejection of mixed old/new reports is expected;
the same check still requires every file to remain unchanged. A completed
inconsistent report fails, and the reporter must run successfully again after
the final launch matrix is produced.
