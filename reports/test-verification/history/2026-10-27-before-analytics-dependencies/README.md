# Baseline before analytics and dependency repairs

This snapshot is extracted from immutable evidence commit
`c06fbecdb32a5c3b76662f631604bfd9abac386b`. It records the completed October27
master against source `b369d68e`: ordinary executable groups passed; coverage
and strict feature gates failed. A new moderate qs advisory was observed.

Command logs/exits, source inputs, coverage totals, audit and reconciled results
are copied byte-for-byte with `manifest.json` hashes. The complete original
cases, counters, maps and other artifacts remain available in
[that Git snapshot](https://github.com/20lawsobk/maxbooster7.5/tree/c06fbecdb32a5c3b76662f631604bfd9abac386b/reports/test-verification).
Original receipt log paths refer to that original root; equivalent copied
command logs are under `orchestration/` here.

Later analytics, dependency, alert, recovery-test and coverage-producer changes
require their own stable-source run. Nothing in this archive certifies them.
