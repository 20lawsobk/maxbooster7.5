---
name: fix-all pipeline design
description: How the resumable multi-phase fix-all pipeline works and the constraints that shaped it
---

# fix-all pipeline (scripts/fix-all.mjs)

Resumable phase-per-invocation CLI: `node scripts/fix-all.mjs --phase <ts-server|ts-client|verify|imports|schema|runtime|audit|lint|summary|status>`. State in `reports/fix-all/state.json`, snapshots in `reports/fix-all/.snapshots/<tag>/`, reports in `reports/fix-all/`.

Constraints that shaped it (don't regress):
- **ShellExec 5-min hard cap** → one phase per invocation; a combined apply+tsc-verify loop in a single call WILL time out (tsc alone ~2.5 min at 3.4GB heap).
- **tsc + dev server don't fit in RAM together** → stop workflow during tsc-heavy rounds, `WorkflowsRestart` before the runtime phase. Runtime probes right after restart fail spuriously — boot takes ~45s; wait or re-run.
- **Node 20: no `Object.groupBy`.**
- **esbuild `transformSync` as per-file syntax gate** + per-file snapshot restore catches handler-corrupted files cheaply (caught 1-3 files per round).
- **Import-path rewrites surface new TS2305** — modules that resolve for the first time reveal missing exports. Count can RISE after a correct fix; per-code deltas matter, not just totals.
- **Honest exit**: summary exits 1 while any category is outstanding; never claim success on partial cleanup (user-enforced contract).

Mechanical handlers plateau by design: conservative guards leave the judgment families (TS2322/2769/2345 contract drift, TS2353 non-literal writes, TS2305 missing exports) for targeted fixes.
