# Python assertion-oracle acceptance

This cohort repairs three additional false-passing canonical `_check` helpers
and adds a persistent exact-source regression for all five affected modules.
Source and command receipts identify the uncommitted changes above baseline
`c06fbecdb32a5c3b76662f631604bfd9abac386b`. The source is not claimed unchanged
across the earlier development attempts. Machine times use UTC; work occurred
October 27 in the user's America/Detroit timezone.

| Evidence | Actual result and limit |
| --- | --- |
| `before-three-helper-receipt.json`, `before-three-helper.xml`, `before-three-helper.txt` | Three exact helper AST probes intentionally call `_check(..., False)`. All three incorrectly pass pytest, exit 0, while printing `FAIL`/`FAILED`. The original full-file hashes match baseline; `before-helper-sources.json` retains their exact helper bodies and hash comparison. No full model imports or source upload writes occurred. |
| `after-three-helper-receipt.json`, `after-three-helper.xml`, `after-three-helper.txt` | The same intentional false conditions now produce exactly three actual `AssertionError` failures and exit 1. No collection/import/name error substitutes for an assertion failure. These are expected negative oracle probes, not product failures. |
| `final/canonical-python/results.json` and its six JUnit files | The final current-source canonical run passes 48 cases: 38 existing cases across five real modules plus ten persistent oracle regressions; zero failed/errors/skipped. |
| `final/receipt.json` and direct-entrypoint logs | All three additional direct entrypoints exit 0: RCGS executes 33 successful `_check` calls, retrieval 44 and RTA render contracts 8. Those diagnostic calls are not additional pytest cases. Source files remain unchanged during the final cohort. |
| `static-audit.json` | Bounded review of 130 discovered canonical Python files, including 19 explicitly blocked files. All six discovered top-level `_check` helpers, including the already-correct audio helper, now raise on false conditions. This is a specific pattern audit, not proof that every repository oracle is complete. |

The final canonical and direct runs preserve all 36 existing source-upload
files: 93,474,975 bytes, mode `0600`, aggregate inventory SHA-256
`2f8c7eb6491d636777a29d631354fb4b8521fe7298c98533947dc6afa0823b66`.
Count, size, modes and content digest are equal before/after pytest and every
direct run. The owned temporary home directories are removed and no owned
retrieval upload directory remains. No source-upload file content is retained.

Earlier `canonical-python/` and `canonical-all-five-and-oracles/` outputs retain
passing development attempts. The first full attempt predates the final oracle
test's traceback-line padding; `actual-canonical-receipt.json` binds that earlier
test hash. Those attempts are not silently relabeled as proof of the later file.
The final attempt was rerun into its own directory after that narrow correction.

The permanent oracle tests invoke actual child pytest processes, parse their
JUnit and require exact expected assertion outcomes. The tests compile only
the actual canonical helper AST; they do not substitute a mirrored helper or
import model modules merely to test the assertion mechanism. True conditions
must pass with empty failure bookkeeping. False conditions must raise and
record their failure. Separate canonical positive runs execute real original
test logic under the runner's credential-free, guarded private environment.

To reproduce the final positive cohort and its integrity receipts from the
repository root, select the prepared interpreter and a new output directory:

```sh
python3 reports/python-oracle-acceptance/2026-10-27/execution-driver.py \
  /tmp/maxbooster-oracle-final-new-run
```

[Instructions and every regression's purpose](../../../docs/testing/test-oracle-review.md)
explain prerequisites, canonical commands, upload isolation and limitations.
The earlier pipeline/phase4 imported-module proof remains in its separate
[retrieval cohort](../../release-rehearsal/2026-10-27-retrieval-assertion-quality/README.md).

`independent-review.json` records ten read-only integrity checks of the final
source hashes, logs, six JUnit files, retained baseline, intentional negative
probes and current upload inventory. All pass; no test rerun or source change
was needed. `manifest.json` binds all 56 retained artifact sizes and hashes.
This cohort establishes
actual assertion propagation, the named positive contracts and controlled
fixture isolation. It does not establish global test sufficiency, 100% platform
coverage, deployed provider journeys, creative quality or production readiness.
