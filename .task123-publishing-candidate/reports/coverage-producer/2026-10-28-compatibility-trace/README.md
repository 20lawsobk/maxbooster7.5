# Retained Node/canonical coverage compatibility trace

October 28, 2026. **All nine profiles remain incompatible and unmerged.** This
is the next C5/P1–P2 compatibility investigation, not a global coverage increase
or a new product test run. Source, tests, thresholds and canonical counters were
not changed.

- The immutable 8cad archive/member SHA and all nine selected baseline entries
  were verified against the original Node receipt's baseline identity.
- Re-conversion of the actual retained Node runtime bytes/maps/V8 counters
  exactly reproduces all nine saved serialized profiles, including counters.
- Ports has 21 canonical versus 25 Node statements and 3 versus 4 functions. The actual
  compiler naming helper is credited as a phantom original function; its three
  calls map to original declaration names. Exact offsets/maps are retained.
- Raw `Infinity` columns and explicit `undefined` properties differ from their
  JSON wire representation. Three serialized branch maps agree, but every file
  still has genuinely incompatible statement/function maps. No partial merge
  is justified.
- The later a160 canonical maps for these nine files equal the immutable
  baseline maps. Its global metrics remain 13.10% lines/13.00% statements/
  8.67% functions/8.77% branches, with all 100% thresholds unmet.

[`analysis-receipt.json`](analysis-receipt.json) preserves actual commands,
exits, clean-child settings, log hashes and protected-input hashes.
[`replay-summary.json`](replay-summary.json) lists all nine complete-map
comparisons. [`ports-exact-details.json`](ports-exact-details.json) retains
complete representative maps, original mapping segments and typed coordinate
differences. [`current-canonical-comparison.json`](current-canonical-comparison.json)
records the completed a160 profile comparison and tool versions.

[Full explanation, exact next implementation tasks and validation](../../../docs/testing/coverage-compatibility-trace.md)
continue the existing C0–C7 and P1–P7 plans. `run-readonly-analysis.py` documents
the precise bounded replays. The initial package-entry harness failure is
retained separately; it failed before conversion and is not a product failure.

`manifest.json` hashes the complete cohort. It does not relabel historical raw
profiles as current full-platform evidence. No original counters, maps or
source paths were rewritten to force compatibility.
