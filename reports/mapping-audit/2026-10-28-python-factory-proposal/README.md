# Unreviewed Python factory-mount proposal

This preserves the exact interrupted outside-checkout work so it can be reviewed from another workspace. It has **not** been applied to production source, tested as a completed candidate or accepted into the canonical inventory. No behavior, mapping or page receives a pass from these files.

The existing mapping plan retains 19 Python factory/include-router declarations: 13 unconditional source mounts and six Director mounts with optional availability. The proposal attempts to enrich their source topology while preserving unsupported/conditional cases. The source trace remains [the authoritative historical input](../2026-10-28/python-router-trace.json).

Before any application: inspect both Python source files and the complete patch, establish its exact current base, add scope/alias/prefix/conditional/unsupported regressions, check all 221 source declarations and every old-to-new backend/check identity, and preserve all 80 page IDs and 2,162 section IDs. Verify actual supported factories without importing an unbounded server or starting model/provider jobs. Preserve optional availability; source inclusion cannot establish runtime readiness. Rebase onto the latest evidence-binding guard without dropping it.

The authoring session was interrupted before final tests, review and a complete integration receipt. The flat patch and helper must be reviewed together; this is not a ready-to-apply implementation. `build-candidate.py` records original workspace paths and may rewrite its own outputs, so inspect or copy it before use. Continue the existing seven-level roadmap; this proposal does not replace it.
