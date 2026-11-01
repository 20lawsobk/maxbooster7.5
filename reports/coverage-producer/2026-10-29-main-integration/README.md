# Main-branch coverage producer integration

The first actual integrated run retains its original three failures in
[results.json](results.json): a changed legacy CLI diagnostic, missing
TypeScript module declaration and unsafe finally-block throw in the HTTP
fixture. The runtime P1 profile already passed9scripts/27map comparisons and
was never merged into global counters.

The corrected [recheck](fixed-results.json) passes72coverage framework cases,
16source/plan regressions, frontend/backend type checks and lint, with the
complete source unchanged during execution. The fixes restore the diagnostic
contract, provide a typed ESM declaration tracked by the common source
inventory, and preserve operation/restoration failures explicitly.

[Runtime evidence](runtime/receipt.json) binds fresh exact executed wrapper
bytes, raw V8 functions, source maps and canonical raw originals. It remains
UNMERGED and grants no page or launch approval. The source changed after that
runtime profile for the integration corrections; the next frozen master
captures its own current baseline.

The focused canonical cohort has2652files,43database cases and9raw originals.
It lacks the JSON module imported by the full historical2653-file suite and
must not replace that whole-platform denominator. All four100% targets and
source inclusion/exclusion settings remain intact.

See [usage and remaining admission work](../../../docs/testing/node-coverage-producer.md).
