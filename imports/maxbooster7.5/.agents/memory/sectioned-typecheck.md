---
name: Sectioned server typecheck
description: Full tsc runs exceed the shell time window; use scripts/typecheck-sections.sh in resumable sections
---

## Rule
Never block on or background a single full `tsc -p tsconfig.server.json` run — it exceeds the shell time window, and background runs are lost when the workspace container recycles. Use `scripts/typecheck-sections.sh` (resumable sections, state in `.cache/tc-sections/`).

**Why:** repeated full-run attempts were killed before producing a captured count, and the user explicitly directed sectioned checking.

**How to apply:**
- `all` runs sections within a time budget; rerun to continue. `report` gives the deduped authoritative total only when every section completed.
- Sections run with incremental OFF — stale tsbuildinfo previously produced an invalid zero-error reading.
- Never run tsc concurrently with the app or another tsc: old-space caps are additive and OOM the workspace.
