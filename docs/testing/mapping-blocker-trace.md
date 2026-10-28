# Trace every unresolved route mapping

This October 28, 2026 source review continues the existing 80-page platform
plan. It retains **all 130 mapping warnings and their exact existing `/resolve`
work-item IDs**. No application source, configuration, tests, canonical report,
acceptance map or coverage threshold changed. Discovery did not import an
application/model module, start services, contact providers or mutate data.

The input register is the completed `a1603b13` snapshot. The selected source
trace finished at `cb783f1f`, whose additional browser-fixture repair does not
alter these route sources. Exact register/plan hashes and selected source hashes
are retained; these are not interchangeable with the master's complete digest.

The [full130-entry matrix](../../reports/mapping-audit/2026-10-28/trace-matrix.md)
links the [machine records](../../reports/mapping-audit/2026-10-28/entries.json).
Each record contains its original warning, existing work ID, root cause,
affected current backend/page/consumer associations, process/path candidates,
source excerpts and hashes, required correction, dependencies, execution order,
risk, validation and production acceptance. Empty current associations do not
prove that a cross-process consumer is absent.

## Source findings

| Warning group | Entries | What the source establishes | Remaining acceptance |
| --- | ---: | --- | --- |
| Root legacy social router | 73 | Main Node imports `server/routes/socialMedia.js`; the root `AI enhancements/socialMedia.ts` is a different retained file, excluded from the production simulation copy. No mount of that legacy file was found in the inspected canonical entrypoint. | Inspect supported alternate entrypoints and current caller/import/packaging graph before integration or retirement; retain source/coverage work. |
| Retained PDIM storage router | 11 | The canonical PDIM index mounts health, redis, datasets, monitor and fabric. It does not import/mount its separate `routes/storage.ts`. | Trace actual storage consumers and alternative runtimes; file presence is not a production endpoint, and non-mount is not proof of missing product functionality. |
| Middleware treated as routers | 6 | The imported symbols are request/error middleware; two follow safety-module re-exports. | Classify them separately while retaining security/operations dependencies, registration order and behavior tests. |
| Computed route sites | 12 | Finite arrays, lexical loop templates, a shared registration helper and a 45-path already-expanded array loop have source-resolvable cases. | Implement bounded, scope-correct expansion and controlled real-router comparison; unsupported expressions remain explicit unknowns. |
| Additional null-path records at the same sites | 9 | These warnings refer to nine of those same computed declarations. | Reconcile declaration identities without deleting any concrete path or its original behavior requirements. |
| Python factory/include-router mounts | 19 | Canonical source binds analytics 3, native analysis 5, Director 6, live learning 3 and media learning 2 routes. Thirteen use unconditional source mount calls; Director's six retain its try/None availability condition. | Implement factory/prefix/conditional topology discovery and verify actual mounted/authenticated runtime behavior. Source inclusion does not establish operational availability. |

The Python subreview retains
[every exact decorator/factory/mount trace](../../reports/mapping-audit/2026-10-28/python-router-trace.json).
Public live-awareness behavior is not made dependent on an obsolete trained
checkpoint by this classification. An intentionally unavailable training mode
remains its actual contract, rather than a presumed missing live-awareness route.

**No missing production handler was proven by these130 warnings. No behavior
check was closed, and no page received Green status.** Their canonical unresolved
state remains unchanged until the appropriate producer and runtime acceptance
work executes.

## Two confirmed topology-producer defects

The review also proved incorrect existing **high-confidence** records, separate
from the 130 unresolved warnings. Their exact current IDs and excerpts are in
[confirmed-findings.json](../../reports/mapping-audit/2026-10-28/confirmed-findings.json).

1. The main lazy-loader mounts the export router at `/api/export`; that router
   mounts `durableExports` with no additional prefix. The audit records the
   child's empty relative mount as its complete file prefix. Consequently
   `POST /jobs/:jobId/:action` and `DELETE /history/:id` are incorrectly labeled
   main-app high-confidence paths. Their source chains require
   `/api/export/jobs/:jobId/:action` and `/api/export/history/:id`.
2. Fan Hub iterates `action` over the literal values `consent` and `unsubscribe`.
   The regex audit treats the interpolated backtick string as a literal,
   producing high-confidence `/api/fan-hub/${action}/:token` GET/POST records.
   The finite source chain instead declares four method/action instances:
   GET/POST × `/api/fan-hub/consent/:token` and
   `/api/fan-hub/unsubscribe/:token`.

These defects can misdirect consumer/check identities even though the actual
handler source exists. They require discovery fixes and fresh controlled route
assertions; editing metadata cannot supply passing feature evidence.

## Exact next source batch

[next-patch-spec.json](../../reports/mapping-audit/2026-10-28/next-patch-spec.json)
defines seven ordered deliverables and explicit positive/negative parser and
runtime validation requirements:

1. Establish application/process/router identities and compose the full mount
   graph, retaining multiple aliases, nested empty mounts and bounded cycles.
2. Resolve middleware symbols/re-exports into retained security dependencies.
3. Expand finite literal arrays and scope-correct loop templates. Preserve all 45
   existing MaxCore `POST_PATHS` registrations; no path may disappear when its
   redundant diagnostic is reconciled.
4. Specialize distribution's three literal helper callsites under the real
   `/api/distribution` prefix. Unknown arguments stay unresolved.
5. Connect all 19 Python factory-created declarations to the canonical router
   mounts, preserving prefixes and optional Director availability.
6. Retain/classify all 84 legacy or unmounted source declarations. Any retirement
   needs explicit caller/entrypoint/packaging evidence and a reviewed change.
7. Review semantic old/new identity relationships, regenerate the complete
   register and existing plan, and execute actual current cases. Preserve all 80
   declarations, 2162 existing sections, 12972 dimension steps and every existing
   control/backend/global behavior requirement. New discoveries may add work.

After the shared identity/output contract is stable, disjoint middleware,
finite-expression/helper, Python and legacy classifications can be implemented
in parallel. Registry reconciliation and final execution remain serialized.
Keep the historical failed evidence. A producer rollback reverts the faulty
discovery change; it does not rewrite old results, relax 100% coverage targets or
turn source resolution into launch approval.

The [cross-process analytics example](../../reports/mapping-audit/2026-10-28/cross-process-example.json)
shows actual source references from the AI page through Node and MaxCore to its
Python router. The registry currently has no direct page associations for those
Python subject IDs. A complete cross-process consumer join remains necessary;
zero direct associations must never be interpreted as unused functionality.

## Reproduce and review

From the repository root, using Python 3 and the corresponding source/register
snapshot:

```sh
python3 reports/mapping-audit/2026-10-28/build-trace.py
python3 reports/mapping-audit/2026-10-28/validate-trace.py
```

The report-only program requires the adjacent Python subtrace, exactly130 input
warnings, matching plan identities, valid source citation ranges and all 45
already-expanded MaxCore paths. It reads source text only and writes its own
cohort outputs. Preserve the committed artifacts before rerunning; this selector
rewrites the generated report files in this versioned cohort. Use a new copied
cohort for a later source snapshot. No application credentials are required.

The [artifact manifest](../../reports/mapping-audit/2026-10-28/manifest.json)
hashes every retained output, and
[validation.json](../../reports/mapping-audit/2026-10-28/validation.json) records
the actual identity, citation, source-hash and preservation checks. These are
report-integrity checks, not extra product tests.
