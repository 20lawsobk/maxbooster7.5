"""Read source and preserved inventory; never import application code or mutate it."""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
read_files = {}

def read(name):
    data = (ROOT / name).read_bytes()
    read_files[name] = hashlib.sha256(data).hexdigest()
    return data.decode()

def cite(name, start, end=None):
    lines = read(name).splitlines()
    end = end or start
    assert 1 <= start <= end <= len(lines), (name, start, end, len(lines))
    return {"file": name, "startLine": start, "endLine": end,
            "excerpt": "\n".join(lines[start - 1:end]), "sourceSha256": read_files[name]}

def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")

register_name = "reports/test-verification/platform-register.json"
plan_name = "reports/test-verification/completion-plan.json"
register = json.loads(read(register_name))
plan = json.loads(read(plan_name))
unknown = register["unknownMappings"]
assert len(unknown) == 130
assert unknown == plan["registry"]["unknownMappings"]
assert len(plan["entityIds"]["unknownMappings"]) == 130
python = json.loads((OUT / "python-router-trace.json").read_text())
python_by_index = {row["unknownIndex"]: row for row in python["entries"]}
read_files.update(python["sourceHashes"])

main = "server/routes.ts"
durable = "server/routes/durableExports.ts"
proxy = "server/routes/maxcoreProxy.ts"
fan = "server/routes/fanHub.ts"
distribution = "server/routes/distribution.ts"
max_app = "external/maxcore/artifacts/api-server/src/app.ts"
max_index = "external/maxcore/artifacts/api-server/src/routes/index.ts"
model = "external/maxcore/artifacts/api-server/src/routes/model-proxy.ts"
pdim_app = "external/pdim/artifacts/api-server/src/app.ts"
pdim_index = "external/pdim/artifacts/api-server/src/routes/index.ts"

post_block = re.search(r"const POST_PATHS = \[(.*?)\n\];", read(proxy), re.S).group(1)
post_paths = re.findall(r'"([^"\n]+)"', post_block)
assert len(post_paths) == 45
assert set(post_paths) == {row["path"] for row in register["backendRoutes"]
                          if row["source"] == {"file": proxy, "line": 523}}

def dynamic_trace(entry):
    file, line = entry["file"], entry["line"]
    evidence = [cite(file, max(1, line - 1), line + 1)]
    if file == max_app:
        values = ["/api", "/api/"] if line == 37 else ["/uploads", "/uploads/"]
        return "literal-route-array", values, "Canonical MaxCore Express application", evidence, "AST accepts a single string only, although Express accepts this finite array of literal aliases."
    if file == model:
        evidence += [cite(model, 674, 678), cite(max_index, 2, 10), cite(max_app, 44)]
        return "finite-loop-template", ["/api/analysis/" + x for x in ("image", "video", "text", "website")], "Canonical MaxCore Express gateway", evidence, "The finite endpoint binding is a template expression; the parser does not substitute its four literal loop values."
    if file == distribution:
        evidence += [cite(distribution, 8327, 8332), cite(distribution, 8413, 8419), cite(main, 6970, 6982), cite(main, 6991)]
        return "finite-helper-specialization", ["/api/distribution/platform/" + x for x in ("spotify", "apple", "youtube")], "Main Node application", evidence, "A shared registration helper receives three literal route arguments. The parser records the helper parameter instead of specializing the bounded callsites."
    if file == durable:
        local = {57: ["/audio/:projectId", "/audio/:projectId/stems"], 69: ["/data", "/analytics"],
                 76: ["/jobs/:jobId", "/status/:jobId"], 84: ["/jobs", "/history"],
                 114: ["/download/:jobId", "/download/zip/:jobId"]}[line]
        evidence += [cite("server/routes/export.ts", 10, 13), cite(main, 7886, 7891), cite(main, 7898, 7904)]
        return "literal-route-array-nested-mount", ["/api/export" + x for x in local], "Main Node application", evidence, "The declaration uses a literal alias array, and its router inherits /api/export through the parent export router. Both the array and complete mount chain require explicit representation."
    if file == fan:
        evidence += [cite(fan, 16, 18), cite(fan, 25, 35), cite(main, 7809, 7814)]
        return "finite-loop-template", ["/api/fan-hub/" + x + "/:token" for x in ("consent", "unsubscribe")], "Main Node application", evidence, "The finite action loop is not expanded by the AST parser; the regex audit also incorrectly labels its interpolation as a literal high-confidence path."
    if file == proxy:
        evidence += [cite(proxy, 470, 523), cite(main, 8712, 8719)]
        return "already-expanded-array-loop-diagnostic", post_paths, "Main Node application", evidence, "The main audit already enumerates all45 literal POST_PATHS entries at this registration site, but the fallback AST diagnostic is retained as an additional unresolved declaration. Deduplicate by source registration identity without dropping its45 paths."
    raise AssertionError((file, line))

middleware_locations = {
    "backpressureMiddleware": ("external/pdim/artifacts/api-server/src/middlewares/backpressure.ts", 26, 33),
    "rateLimitMiddleware": ("external/pdim/artifacts/api-server/src/middlewares/rateLimit.ts", 37, 44),
    "metricsMiddleware": ("server/monitoring.ts", 133, 146),
    "cloudflareMiddleware": ("server/middleware/cloudflare.ts", 95, 112),
    "sanitizationMiddleware": ("server/safety/inputValidation.ts", 215, 227),
    "globalErrorHandler": ("server/safety/mandatoryMiddleware.ts", 113, 130),
}

entries = []
for index, original in enumerate(unknown):
    backend = [row for row in register["backendRoutes"] if row["id"] == original.get("subjectId")]
    if not backend:
        backend = [row for row in register["backendRoutes"] if row["source"] == {"file": original["file"], "line": original["line"]}
                   and (not original.get("method") or row["method"] == original["method"])]
    backend_ids = {row["id"] for row in backend}
    pages = [row["id"] for row in register["pages"] if backend_ids.intersection(row.get("backendRouteIds", []))]
    calls = [row["id"] for row in register["frontendContracts"] if backend_ids.intersection(row.get("backendRouteIds", []))]
    row = {"unknownIndex": index, "existingMappingId": plan["entityIds"]["unknownMappings"][index],
           "existingWorkItemId": plan["entityIds"]["unknownMappings"][index] + "/resolve",
           "originalUnknownEntry": original, "status": "STATIC_TRACE_ONLY_REQUIRES_PRODUCER_AND_RUNTIME_ACCEPTANCE",
           "behavioralAcceptance": "UNVERIFIED", "productionReady": False,
           "affectedBackendIds": sorted(backend_ids), "affectedCurrentPageIds": pages,
           "affectedCurrentFrontendContractIds": calls,
           "associationLimit": "Current registry associations are static candidates; an empty list does not prove that a cross-process consumer is absent.",
           "risk": "P1-evidence-integrity", "dependencies": ["Correct source/process/mount enumeration", "Current-source exact contract assertions"],
           "sourceCitations": [cite(original["file"], original["line"])],
           "validationCriteria": "A bounded parser fixture reproduces the exact declaration/import chain and preserves each method/path/process/alias; unsupported expressions remain explicit warnings. No application module executes during discovery.",
           "productionAcceptanceCriteria": "Fresh actual mounted-route cases prove applicable auth, owner boundary, exact response, failure and persistence behavior. Source resolution alone cannot close the existing behavior checks or Green a page."}
    if index in python_by_index:
        child = python_by_index[index]
        assert child["originalUnknownEntry"] == original
        row.update(classification="python-factory-include-router", rootCause=child["rootCause"],
                   staticallyResolvedPaths=[child["staticallyResolvedPath"]], canonicalProcess=child["canonicalProcess"],
                   requiredFix=child["requiredFix"],
                   sourceCitations=[{"file": c["file"], "startLine": c["line"], "endLine": c["endLine"],
                                     "excerpt": c["snippet"], "sourceSha256": python["sourceHashes"][c["file"]]}
                                    for c in child["sourceCitations"]],
                   availabilityCondition=child["availabilityCondition"], executionOrder=5,
                   pythonTracePointer=f"python-router-trace.json#/entries/{index - 111}")
    elif original["kind"] == "unresolved-router-mount":
        symbol = original["toExport"]
        target, start, end = middleware_locations[symbol]
        row.update(classification="middleware-misclassified-as-router", executionOrder=2,
                   rootCause="The import resolves to request/error middleware rather than an Express Router export. The mount scanner expects a router export identity and emits a false unresolved-router diagnostic.",
                   staticallyResolvedPaths=[], canonicalProcess="Main Node application" if original["file"].startswith("server/") else "Canonical PDIM Express application",
                   requiredFix="Represent this exact middleware registration in a separate retained security/operations dependency inventory. Follow re-exports and resolve the symbol before deciding whether it is a Router; do not delete its middleware tests or mark security behavior passed.")
        row["sourceCitations"] += [cite(target, start, end)]
        if original["toFile"] == "server/safety/index.ts":
            row["sourceCitations"] += [cite("server/safety/index.ts", 25, 32), cite("server/safety/index.ts", 59, 69)]
    elif original["file"] == "AI enhancements/socialMedia.ts":
        row.update(classification="retained-legacy-router-not-canonical-mount", executionOrder=6,
                   rootCause="This declaration belongs to the root legacy AI enhancements copy. The inspected main runtime eagerly imports server/routes/socialMedia.js, and the production simulation source policy excludes the root AI enhancements tree. No mount of this legacy copy was found in the inspected canonical runtime chain.",
                   staticallyResolvedPaths=[], canonicalProcess="No canonical application mount established for this retained module",
                   requiredFix="Retain the declaration and its full-source work. Record a distinct dormant/legacy classification with explicit import/entrypoint evidence; inspect any supported alternative entrypoint before decommissioning. Never assign the canonical social router prefix to this other file or delete it only to reduce coverage.")
        row["sourceCitations"] += [cite(main, 7271, 7280), cite("scripts/lib/production-simulation-copy.mjs", 55, 58)]
    elif original["file"] == "external/pdim/artifacts/api-server/src/routes/storage.ts":
        row.update(classification="retained-pdim-storage-router-not-canonical-mount", executionOrder=6,
                   rootCause="The storage router exists, but the inspected canonical PDIM router imports/mounts health, redis, datasets, monitor and fabric, not storage. File presence alone does not establish a public storage mount.",
                   staticallyResolvedPaths=[], canonicalProcess="No canonical PDIM application mount established for this retained router",
                   requiredFix="Retain its source and behavior work as an unmounted/alternative router. Trace current storage consumers and any alternative entrypoint before deciding whether it should be integrated or retired; do not fabricate a prefix or assume missing production functionality.")
        row["sourceCitations"] += [cite(pdim_index, 1, 7), cite(pdim_index, 79, 83), cite(pdim_app, 52)]
    else:
        kind, paths, process, citations, cause = dynamic_trace(original)
        row.update(classification=kind, executionOrder=4 if kind == "finite-helper-specialization" else 3,
                   rootCause=cause, staticallyResolvedPaths=paths, canonicalProcess=process,
                   requiredFix="Add bounded literal-array/finite-binding/helper support and full mount composition; retain original declaration-to-expanded-path identities. Reconcile duplicate diagnostics only after proving that every concrete path is represented exactly once.",
                   sourceCitations=citations)
        if original["kind"] == "unverified-route-mount":
            row["duplicateDiagnosticIndexes"] = [i for i, candidate in enumerate(unknown)
                                                 if candidate["kind"] == "dynamic-backend-path" and candidate["file"] == original["file"] and candidate["line"] == original["line"]]
    entries.append(row)

assert [row["originalUnknownEntry"] for row in entries] == unknown
assert len({row["existingWorkItemId"] for row in entries}) == 130
summary = {"originalUnknownMappings": len(unknown), "preservedEntries": len(entries),
           "classifications": dict(collections.Counter(row["classification"] for row in entries)),
           "behaviorChecksClosed": 0, "missingProductionHandlersProven": 0,
           "sourceRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
           "registerSourceRevision": register.get("sourceRevision"),
           "registerSha256": read_files[register_name], "planSha256": read_files[plan_name],
           "platformSourceDigest": register.get("platformSourceDigest")}
write("entries.json", {"schemaVersion": 1, "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "scope": "Source traces for every existing mapping warning; not application execution, feature completion or launch approval",
      "productionReady": False, "summary": summary, "entries": entries})
write("source-hashes.json", {"sourceRevision": summary["sourceRevision"], "files": read_files,
      "meaning": "Exact selected source/report inputs read by this trace; this is not the master's complete source-input digest."})
print(json.dumps(summary))

wrong_exports = [row for row in register["backendRoutes"]
                 if row["source"]["file"] == durable and row["source"]["line"] in (98, 124)]
wrong_consent = [row for row in register["backendRoutes"]
                 if row["source"]["file"] == fan and row["source"]["line"] in (18, 25)]
assert len(wrong_exports) == 2 and all(row["confidence"] == "high" for row in wrong_exports)
assert len(wrong_consent) == 2 and all("${action}" in row["path"] for row in wrong_consent)
findings = [
    {"id": "nested-router-prefix-loss", "status": "CONFIRMED_PRODUCER_DEFECT", "risk": "P1-evidence-integrity",
     "affectedSystems": ["scripts/audit-endpoints.mjs", "scripts/testing/platform-register.py", "page/API dependency register"],
     "rootCause": "The audit stores one file-level prefix for the child router.use(durableExports) as empty, rather than composing the parent export router mount from the main application's lazy-loader registration.",
     "actualIncorrectRecords": [{"id": row["id"], "method": row["method"], "recordedPath": row["path"],
                                  "recordedConfidence": row["confidence"], "source": row["source"],
                                  "staticallyRequiredPath": "/api/export" + row["path"]} for row in wrong_exports],
     "sourceCitations": [cite("scripts/audit-endpoints.mjs", 201, 210), cite(main, 7886, 7891),
                         cite(main, 7898, 7904), cite("server/routes/export.ts", 10, 13), cite(durable, 98), cite(durable, 124)],
     "requiredFix": "Compose root-process → parent-router → child-router prefixes, preserving each mount/alias and original registration identity. A file-level first prefix must not substitute for the mount graph.",
     "validationCriteria": "A real-source parser regression produces /api/export/jobs/:jobId/:action and /api/export/history/:id, never their unprefixed versions. A controlled HTTP/router-stack fixture verifies those exact mounted routes and precedence.",
     "productionAcceptanceCriteria": "Every affected consumer is rebound to the correct process/path and its actual authorization, durable artifact, failure/retry and cancellation/delete assertions pass from current source.",
     "scopeLimit": "This proves an inventory defect, not a missing runtime route or a passing export workflow."},
    {"id": "finite-template-marked-literal", "status": "CONFIRMED_PRODUCER_DEFECT", "risk": "P1-evidence-integrity",
     "affectedSystems": ["scripts/audit-endpoints.mjs", "scripts/testing/platform-register.py", "Fan Hub consent/unsubscribe contract identities"],
     "rootCause": "The regex literal branch accepts a backtick TemplateExpression containing interpolation and marks it high-confidence without substituting the finite lexical action binding.",
     "actualIncorrectRecords": [{"id": row["id"], "method": row["method"], "recordedPath": row["path"],
                                  "recordedConfidence": row["confidence"], "source": row["source"],
                                  "staticallyRequiredPaths": ["/api/fan-hub/" + action + "/:token" for action in ("consent", "unsubscribe")]} for row in wrong_consent],
     "sourceCitations": [cite("scripts/audit-endpoints.mjs", 363, 380), cite(fan, 16, 35), cite(main, 7809, 7814)],
     "requiredFix": "Distinguish true string/no-substitution literals from template expressions. Expand only bounded, scope-correct literal bindings; preserve an explicit unknown for all unsupported expressions.",
     "validationCriteria": "Exactly four current GET/POST × consent/unsubscribe route instances are enumerated under /api/fan-hub, with no literal ${action} path. Shadowed, nonliteral and unbounded bindings stay unresolved.",
     "productionAcceptanceCriteria": "Each exact alias passes safe GET, CSRF-protected POST, token validation, single-use/expiry and durable preference behavior. Other route aliases cannot supply its acceptance automatically.",
     "scopeLimit": "This proves an inventory defect, not a successful email delivery or deployed preference journey."},
]
write("confirmed-findings.json", {"schemaVersion": 1, "productionReady": False, "items": findings})

steps = [
    ("MAPPING-1", [], "Shared source/process/router identity", ["scripts/audit-endpoints.mjs:137", "scripts/testing/platform-register.py:470"],
     "Represent application roots, router symbols, import/re-export edges and all mount prefixes separately. Preserve source declaration IDs and each expanded path/process; keep cycles/depth/size bounds explicit.",
     ["Nested empty child prefix composes with parent /api/export", "Two mounts of one router retain both aliases", "Identical relative paths in separate applications remain distinct", "Mount cycles terminate with an explicit diagnostic"]),
    ("MAPPING-2", ["MAPPING-1"], "Middleware classification and re-exports", ["scripts/testing/platform-register.py:470"],
     "Resolve all six proven middleware symbols including the safety re-exports. Retain their security/operations dependency records and exact registration order; remove a router warning only when its non-router identity is established.",
     ["All six current symbols classified as middleware", "Actual Router-returning factories are not misclassified", "Unknown/imported opaque functions stay unresolved", "Security/operations work-item identities remain retained"]),
    ("MAPPING-3", ["MAPPING-1"], "Finite literal arrays and loop templates", ["scripts/audit-endpoints.mjs:363", "scripts/testing/platform-register.py:NODE_EXTRACTOR"],
     "Expand literal alias arrays and bounded const/readonly literal-loop templates with lexical scope. Keep original registration-to-expanded-route relationships; reconcile the existing45-path MaxCore loop diagnostic without losing any path.",
     ["MaxCore /api,/api/ and /uploads,/uploads/ aliases preserved", "All10 durable export array aliases inherit /api/export", "Four native-analysis paths inherit MaxCore /api", "Fan Hub yields four concrete method/action combinations", "All45 existing POST_PATHS paths retained exactly once", "Unbounded/template shadowing/unsupported expressions remain explicit unknowns"]),
    ("MAPPING-4", ["MAPPING-1", "MAPPING-3"], "Bounded helper registration specialization", ["server/routes/distribution.ts:8327"],
     "Specialize the shared distribution registration helper at its three proven literal callsites without evaluating the application. Record both declaration and callsite provenance and apply /api/distribution.",
     ["Spotify/apple/youtube paths exactly represented", "Calls with computed arguments remain unresolved", "Helper parameter shadowing does not leak another call's value", "Existing auth/mutation requirements remain attached"]),
    ("MAPPING-5", ["MAPPING-1"], "Python factory/include_router topology", ["scripts/testing/platform-register.py:python_routes"],
     "Bind all19 factory-created route declarations to their canonical include_router calls, including factory APIRouter prefixes and the Director try/None availability conditions. Join private gateway/Node/UI consumers separately.",
     ["Analytics3 /api/analytics paths", "Native analysis5 /api/analysis paths", "Director6 /api/director paths retain conditional availability", "Live/media training5 absolute paths unchanged", "Unavailable conditional factory remains unavailable rather than fake-mounted", "No model import, application startup or network during discovery"]),
    ("MAPPING-6", ["MAPPING-1"], "Retained legacy/unmounted sources", ["AI enhancements/socialMedia.ts", pdim_index],
     "Keep all84 source declarations and existing full-source work. Record canonical non-mount evidence and separately inspect any supported alternate runtime; retirement requires caller/import/packaging proof and a reviewed change, not deletion for coverage.",
     ["73 legacy social declarations remain traceable", "11 unmounted PDIM storage declarations remain traceable", "Canonical social router is never aliased to the different root legacy file", "No unmounted declaration is counted as a successful production endpoint"]),
    ("MAPPING-7", ["MAPPING-2", "MAPPING-3", "MAPPING-4", "MAPPING-5", "MAPPING-6"], "Full registry/plan/evidence reconciliation", ["tests/platform-acceptance-map.json", "scripts/testing/generate-platform-plan.py"],
     "Review semantic old-to-new identity relationships before regenerating the complete registry/80-page plan. Retain every section/dimension/control/backend/global work item; refresh only candidate hashes, then execute current-source exact cases and strict full gates.",
     ["All80 page aliases and2162 existing section identities retained", "All12972 section dimension steps retained", "Every old mapping work ID has an explicit retained/resolved relationship", "Every original required behavior check preserved or explicitly mapped one-to-many", "No old passing case is relabeled current by metadata regeneration", "100% line/statement/function/branch targets unchanged", "Passing source-resolution tests do not mark features or pages Green"]),
]
write("next-patch-spec.json", {"schemaVersion": 1, "status": "PLANNED_NOT_IMPLEMENTED", "productionReady": False,
      "scope": "Next narrow producer correction within the existing exhaustive plan; no production source changes were performed by this audit",
      "criticalPath": [row[0] for row in steps],
      "parallelization": "After MAPPING-1's identity/output contract is fixed, middleware, finite expressions/helper cases, Python mounts and retained-legacy classification may be implemented in disjoint owned files/tests; integrated registry/plan acceptance remains serialized.",
      "rollback": "Preserve the completed a160 master and current130-entry trace. Revert a producer regression without replacing historical evidence or weakening launch thresholds. Do not deploy, migrate or mutate provider state to test discovery.",
      "steps": [{"id": key, "dependencies": deps, "deliverable": title, "sourceTargets": targets,
                 "implementationTask": action, "validationCases": cases,
                 "productionAcceptance": "Current source-derived paths match controlled actual router topology; all existing behavior, coverage, accessibility and deployment gates still require their own passing evidence."}
                for key, deps, title, targets, action, cases in steps]})

# A source chain example establishes why zero direct registry associations do
# not mean a Python endpoint has no page consumer.
write("cross-process-example.json", {"schemaVersion": 1, "status": "STATIC_SOURCE_CHAIN_ONLY", "productionReady": False,
      "example": "Account analytics main Node → MaxCore Express gateway → canonical Python factory router",
      "sourceCitations": [cite("client/src/pages/analytics/AIDashboard.tsx", 37, 43), cite(main, 7762),
                          cite("server/routes/ai.ts", 808, 828), cite("server/services/accountAnalyticsService.ts", 166, 174),
                          cite(model, 1155, 1162), cite(max_app, 44), cite(max_index, 3, 10),
                          cite("external/maxcore/artifacts/ai-training-server/ai_model/analytics.py", 252, 268)],
      "requiredWork": "Trace configured transport base/auth and public main-app prefix plus the page's actual request, then link exact current owner-scoped browser/HTTP/SQL/Python cases. This static chain cannot replace those cases."})

matrix = ["# Every existing unresolved mapping", "", "All130 entries and existing work IDs are retained. Source traces are not behavioral PASS results.", "",
          "| Index | Existing work item | Source | Classification | Backend subjects / page associations |", "| --- | --- | --- | --- | --- |"]
for row in entries:
    original = row["originalUnknownEntry"]
    matrix.append(f"| {row['unknownIndex']} | `{row['existingWorkItemId']}` | `{original['file']}:{original['line']}` | {row['classification']} | {len(row['affectedBackendIds'])} / {len(row['affectedCurrentPageIds'])} |")
matrix += ["", "Each full root cause, source excerpt/hash, path candidate, dependency, execution order, risk and acceptance requirement is retained in [entries.json](entries.json).",
           "", "[Confirmed topology defects](confirmed-findings.json) and [ordered patch specification](next-patch-spec.json) remain separate from source classification. No warning is deleted or accepted by this report.", ""]
(OUT / "trace-matrix.md").write_text("\n".join(matrix))
write("source-hashes.json", {"sourceRevision": summary["sourceRevision"], "files": read_files,
      "meaning": "Exact selected source/report inputs read by this trace; this is not the master's complete source-input digest."})
