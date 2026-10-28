# Platform evidence integrity receipts

These receipts test the machinery that binds exact feature checks to actual
current execution. They do not themselves establish product behavior, all-page
acceptance, 100% coverage or production launch approval.

| Cohort | Evidence and limits |
| --- | --- |
| [Current-execution binding and duplicate-file repair](2026-10-28-source-binding-final/README.md) | Original stale-ledger and duplicate-Node false-pass reproductions, intermediate 118/124/130 results, final 133 passing focused regressions, actual logs/XML and source hashes. The integrated 10d19267 master result was pending at documentation time. |
| [Historical real-master compatibility](2026-10-28-historical-compatibility/README.md) | Read-only schema replay accepts eight exact historical HTTP identities only with explicitly injected historical source and rejects the same old ledger with real current source. Seven diagnostic checks pass; no current product test reran. |

Each cohort has its own artifact manifest. Preserve original failures, source
revisions and scope; a later fix or passing focused run does not rewrite an old
master result. [Usage and acceptance policy](../../docs/testing/acceptance-link-review.md)
retains the six narrow access-policy links and all eight exact case identities.
All 80 page declarations, their 2,162 sections and remaining global/deployed
requirements stay in the governing plan. Only actual fresh complete evidence
can change a launch decision.
