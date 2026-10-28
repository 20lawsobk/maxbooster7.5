#!/usr/bin/env python3
"""Extend, never replace, the exhaustive platform plan with launch decisions.

Static presence and a successful render are inventory observations, not evidence
of feature completion. This producer deliberately fails closed on missing,
changed, skipped or unmapped evidence. It performs no network or application
mutations and never changes the canonical register or plan.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REGISTER = "reports/test-verification/platform-register.json"
PLAN = "reports/test-verification/completion-plan.json"
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".json", ".toml", ".html", ".css", ".scss", ".sh", ".nix", ".yaml", ".yml", ".lock", ".mod", ".sum"}

# Every entry is an independently required observation. Linking one passing
# render or an HTTP 200 cannot implicitly satisfy another entry.
CRITERIA = {
    "frontend": {
        "ui-functionality": "Every section/control produces its intended visible result and exact handler/request; invalid/disabled actions do not mutate state.",
        "responsiveness": "Every section remains operable at supported mobile/tablet/desktop widths, 200% text and 400% zoom without loss or unintended two-dimensional scrolling.",
        "state-handling": "Real loading, empty, successful, stale, navigation/reload and cancellation/unmount states preserve correct user/account state.",
        "error-handling": "Actual validation, timeout and unavailable-dependency failures show actionable errors/retry without false success or duplicate mutation.",
        "performance": "Recorded representative cold/warm render and action timings meet a documented page budget on its declared target device/network; no invented universal latency budget.",
        "localization": "Supported language switching, long/missing translated text, RTL, Unicode, dates/numbers/currency and time zones preserve complete usable behavior.",
    },
    "backend": {
        "api-contracts": "Exact mounted process, method/path, status, content type and schema pass successful, empty and missing-record cases for every associated API.",
        "database-interactions": "Real applicable database reads/writes match source-of-truth records and transactions; declared non-applicability is proven against traced handlers, never assumed from a public page.",
        "authentication": "Anonymous, authenticated, expired and revoked sessions receive their exact declared outcomes without protected-data disclosure.",
        "authorization": "Owner, foreign owner, workspace/role/subscription and administrator boundaries pass both read and mutation attempts.",
        "data-integrity": "Durable readback/reopen, duplicate/replay/concurrent writes, rollback, delete/reference cleanup and interrupted recovery preserve ownership and invariants.",
        "edge-cases": "Actual path/query/body/file limits, malformed/excessive inputs, missing resources and dependency outages fail before unauthorized side effects.",
    },
    "integration": {
        "frontend-backend": "Actual browser user actions reach their traced backend and display validated real outcomes; fresh-session reload confirms resulting state.",
        "workflow-execution": "Every applicable worker/job/provider/payment workflow completes its actual lifecycle with durable identifiers, idempotency and terminal status; absent workflows require traced non-applicability proof.",
        "real-time-updates": "Applicable real subscriptions/polling deliver correct owner-scoped updates, reconnect/resume and cancellation without stale-account leakage; non-applicability requires source proof.",
        "failure-recovery": "Disconnect, timeout, restart, replay and partial failure recover within documented bounds without lost/duplicated accepted work or false readiness.",
    },
    "database": {
        "schema-deployment": "Required migrations, indexes and constraints exist on the verified target; current compatible writers and rollback limits are identified.",
        "backup-recovery": "A consistent owned SQL/PDIM/blob/job backup restores into fresh owners and passes byte/metadata/authorization invariants; actual deployed RTO/RPO/offsite evidence is separate and required.",
    },
    "ai": {
        "capability-routing": "Every applicable generation/analytics control reaches its actual capability and truthful dependency readiness; model-free public awareness does not depend on an obsolete trained checkpoint.",
        "input-provenance": "Public awareness uses only permitted publicly accessible live content with freshness/provenance; private account aggregates remain owner-scoped and outside public learning/retention.",
        "output-workflow": "Actual requested text/image/audio/video/statistical outputs satisfy explicit format/content/ownership/delivery contracts and error recovery; statistical/procedural output is not claimed as learned quality.",
    },
    "qa": {
        "functional": "All exact registered page/control/API checks pass from unchanged source, with no skipped required case and exact current case links.",
        "regression": "Required canonical unit, integration, cross-language, commerce and browser suites pass with authoritative assertions and owned fixture cleanup.",
        "end-to-end": "Every section's successful and adverse real browser/backend/durable journey passes, including exact route aliases and cross-user boundaries.",
        "load": "The documented realistic deployment topology meets its stated concurrency/throughput/error/p95 budgets in an isolated measured run; projected 90M figures are not simultaneous-client proof.",
        "security": "Applicable auth/tenant/CSRF/XSS/SSRF/upload/provider-replay/secret-redaction cases pass, supported dependency graphs have no unresolved launch-blocking advisory, and no production secrets are packaged.",
        "coverage": "Actual line, statement, function and branch counters meet the requested 100% target, with original source/map provenance and no threshold/exclusion substitution; cross-language coverage remains explicit.",
    },
    "accessibility": {
        "automated-wcag": "All section states have zero unwaived applicable WCAG 2.2 A/AA failures from the configured automated checks; automation alone does not establish conformance.",
        "keyboard-focus": "All controls work by keyboard; order, focus visibility/not obscured, dialog trapping/restoration, Escape, skip links and no keyboard trap pass manual real-browser review.",
        "screen-reader": "Documented browser/screen-reader review confirms names/roles/values, headings/landmarks, live errors/status, input instructions and meaningful reading order in all section states.",
        "visual-media": "Measured text/nontext contrast, reflow, zoom, target size, reduced motion, captions/transcripts and applicable audio/video alternatives meet WCAG 2.2 AA; non-applicability has an explicit source/behavior rationale.",
    },
    "deployment": {
        "target-identity": "Verified published HTTPS origin serves this exact release, secure callbacks/cookies/headers and child/private-port topology; the Replit editor URL is not deployment proof.",
        "release-startup": "Prepared current-source artifact passes integrity, offline copied-payload cold startup, truthful readiness, child supervision and cleanup with full before/after admitted inventories.",
        "operations": "Actual target monitoring, alert acceptance/delivery, rollback, recovery, capacity and required provider credentials/callbacks are verified without exposing secrets.",
    },
}

GLOBAL_GAPS = [
    ("source-evidence", "P0", "Evidence provenance", "Canonical register and focused cohorts are snapshots; later code/config/test changes invalidate blanket current-source claims.", "Freeze inputs, preserve failures, refresh discovery and exact candidate digests, then run canonical suites with unchanged inputs.", [], [REGISTER, "reports/test-verification/orchestration/source-inputs.json"], "Every required artifact and linked case matches the final admitted source; stale evidence remains historical."),
    ("assertion-oracles", "P0", "QA integrity", "Five canonical Python helpers previously recorded false conditions without raising under pytest; corrections and negative regression receipts exist and require final integration.", "Keep all real raises and upload isolation; run the canonical positive suites and exact expected-negative oracle regressions from frozen source.", ["source-evidence"], ["docs/testing/test-oracle-review.md", "reports/python-oracle-acceptance/2026-10-27/README.md"], "A false condition causes the expected AssertionError/exit 1; real positive suites and upload-integrity cleanup pass."),
    ("release-isolation", "P0", "Packaging and startup", "The concurrent release preparation observed generated API-bundle/runtime-upload drift and rejected its source guard; new narrow runtime-upload exclusion and isolated test fixtures require a new serialized rehearsal.", "After master completion, prepare with unchanged admitted inputs, codec/policy intact, full before/after inventories, then verify/cold-start/verify.", ["source-evidence", "assertion-oracles"], ["reports/release-rehearsal/2026-10-27-analytics-dependencies-final/", "reports/release-rehearsal/2026-10-27-runtime-upload-isolation/README.md"], "Actual preparation, both verifications and cold startup pass with unchanged admitted inputs; no fixture bypass or manifest rewriting."),
    ("exact-feature-evidence", "P0", "All page/backend journeys", "Thousands of inventoried checks have no exact passing current case; source presence, line coverage and 80 renders do not establish full behavior.", "Execute every retained section and registered check, reproduce/repair defects and link exact successful/adverse case bundles without deleting IDs.", ["source-evidence"], [REGISTER, PLAN, "docs/testing/acceptance-link-review.md"], "All exact required checks and every section dimension pass, with zero invalid links or unresolved mappings."),
    ("coverage", "P0", "Cross-language QA", "Measured JavaScript/TypeScript coverage remains far below the required 100% in all four metrics; native/Python and incompatible Node maps do not fill that denominator.", "Add meaningful successful/adverse behavior tests by the existing C0-C7 dependency order; merge only compatible measured original-source counters.", ["assertion-oracles", "source-evidence"], ["reports/test-verification/coverage/coverage-summary.json", "docs/testing/node-coverage-producer.md"], "All requested actual coverage counters reach 100% with verified provenance; no exclusions or threshold relaxation."),
    ("accessibility", "P0", "All page/section accessibility", "A complete current-source WCAG 2.2 AA automated and manual state-by-state conformance record is absent.", "Run automated checks plus keyboard/focus, screen-reader, contrast/reflow/target-size/motion/media review for every actual section/state and supported layout; repair each reproduced defect.", ["exact-feature-evidence"], ["docs/testing/platform-completion-plan.md"], "All four accessibility criteria pass per page/section with current evidence; no unreviewed manual item becomes green."),
    ("replit-origin", "P0", "Deployed identity", "Only the supplied Replit editor project URL is established; the actual published HTTPS origin serving this release has not been verified.", "Obtain the existing published application origin through authorized deployment metadata, verify release identity and real HTTPS journeys/callbacks.", ["release-isolation"], [".replit", "replit.nix"], "Target origin, release identity, cookies/headers and required public/provider paths are verified on the actual deployment."),
    ("neon-migration", "P0", "Database deployment", "The October 28 repeatable-read read-only Neon inspection found ten ORM schema drift entries across current fabric/media/migration metadata; isolated migration/recovery passes are not deployed schema proof.", "Use the retained read-only target inventory, prepare consistent writer-drained joint backup and concrete migrations 0096-0099/rollback plan, then perform authorized rollout and verify compatible writers/canary.", ["release-isolation"], ["reports/deployment-observations/2026-10-28/neon-schema-readonly.json", "docs/testing/current-storage-joint-recovery.md"], "Actual target schema and compatible writer behavior are verified after safe migration; restored backup and rollback limits are documented."),
    ("provider-delivery", "P0", "Payment/provider integrations", "Controlled transport/test fixtures do not prove all enabled deployed OAuth, payment, signed webhook, email, distribution and social delivery journeys.", "Use existing Replit configuration and owned sandbox identities to verify each exact enabled integration, callback, replay, ownership, durable receipt and recovery; do not repeat credential requests.", ["replit-origin", "neon-migration"], ["docs/testing/monitoring-alerts.md", "reports/email-acceptance/2026-10-27-sendgrid-alert/README.md"], "Each enabled provider's actual target journey and failure lifecycle has source-bound receipt/cleanup; test acceptance is not production delivery."),
    ("capacity", "P0", "Global scalability", "The last bounded source run exceeded its p95 budget while packaging contended for CPU; global multi-instance authority/routing and 90M simultaneous clients remain unproved.", "Run bounded load without build contention; establish realistic shared blob/queue/PDIM/job topology and measured regional/capacity/recovery budgets before global claims.", ["release-isolation", "neon-migration"], ["reports/test-verification/integration-browser/http-load/", "docs/testing/completion-execution-plan.md"], "Actual isolated target topology meets explicit request/error/p95 and recovery budgets; projections remain labeled projections."),
    ("native-clients", "P0", "Desktop/mobile", "Actual packaged desktop exposed ASAR module ancestry, TFJS inclusion and Sharp native-resource defects; Linux-only diagnostics do not prove every supported GUI/OS/device build.", "Finish narrow module/resource fixes with real artifact evidence, verify startup/config/privacy/sandbox and native clients on supported target OS/devices; retain CI billing lock as external prerequisite.", ["release-isolation", "replit-origin"], ["docs/testing/electron-asar-module-acceptance.md", "docs/testing/linux-desktop-feasibility-2026-10-27.md", "reports/ci-acceptance/2026-10-27-native-builds.json"], "Each supported client builds, installs, starts securely and passes actual target journeys; no product sandbox disable or packaged provider/database secrets."),
    ("vst-source", "P0", "Native Studio plugins", "Uploaded /VST3 material observed so far contains Windows binaries/build outputs; original JUCE/C++ source needed for equivalent Linux rebuild is not established.", "Locate actual original source/build descriptors and licensing; build Linux target and validate DAW hosting/automation/state/audio contracts independently from browser DSP.", [], ["VST3/", "docs/testing/platform-work-schedule.md"], "Original-source Linux plugin builds and actual supported DAW hosting pass; Windows binary metadata is not Linux source."),
    ("ai-workflows", "P0", "Generation and awareness", "Public-awareness ingestion/model-free dedicated rendering and account-statistical scopes have bounded proof; every semantic engine/output/deployed page binding and quality contract is not established.", "Trace each retained AI consumer to exact live public-awareness/capability/output workflow, verify fresh signals and real requested formats, ownership and dependency outage recovery.", ["exact-feature-evidence", "replit-origin"], ["server/services/generationAwareness.ts", "docs/testing/account-analytics.md", "reports/awareness-dependency-acceptance/2026-10-27/README.md"], "Every applicable AI criterion and actual page consumer passes without obsolete checkpoint requirements, fake generated output or private-data learning."),
    ("engagement-history", "P1", "Account analytics", "Daily engagement history has no established period-specific source; lifetime/current post counters cannot serve as historical observations.", "Trace an actual authorized daily source or keep explicit insufficient-history state; never fabricate trends/accuracy from lifetime counters.", ["provider-delivery"], ["docs/testing/account-analytics.md", "server/services/accountAnalyticsService.ts"], "Period-specific owned data is verified or the product clearly and correctly exposes unavailable history without claiming a completed historical feature."),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.is_file() else default


def load_register_module(root=ROOT):
    spec = importlib.util.spec_from_file_location("launch_platform_register", root / "scripts/testing/platform-register.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_plan_module():
    spec = importlib.util.spec_from_file_location("launch_platform_plan", ROOT / "scripts/testing/generate-platform-plan.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_inventory(register, plan, expected_pages=80):
    plan_module = load_plan_module()
    plan_module.validate_plan(register, plan)
    if plan.get("registryDigest") != plan_module.digest(register):
        raise ValueError("Completion plan register digest mismatch")
    pages = register.get("pages", [])
    ids = [page.get("id") for page in pages]
    if len(ids) != expected_pages or len(set(ids)) != expected_pages or None in ids:
        raise ValueError(f"Expected exactly {expected_pages} unique page declarations, received {len(ids)}")
    if set(ids) != set(plan.get("businessPageWork", {})):
        raise ValueError("Page business-work identity mismatch: refusing to drop or invent a page")
    if set(ids) != set(plan.get("entityIds", {}).get("pages", [])):
        raise ValueError("Plan/register page identity mismatch")
    section_ids = [(page_id, section["id"]) for page_id, page in plan["businessPageWork"].items()
                   for section in page.get("businessSections", [])]
    if len(section_ids) != len(set(section_ids)):
        raise ValueError("Duplicate business section identity")
    recorded = plan.get("summary", {}).get("businessSectionTasks")
    if recorded != len(section_ids):
        raise ValueError("Business-section denominator mismatch")
    if plan.get("summary", {}).get("businessDimensionSteps") != len(section_ids) * 6:
        raise ValueError("Business-dimension denominator mismatch")
    return ids, section_ids


def source_freshness(register, root=ROOT, source_paths=None, plan=None, repository_files=None):
    expected = register.get("sourceInputsSha256", {})
    changed, missing = [], []
    for name, wanted in expected.items():
        path = root / name
        if not path.is_file(): missing.append(name)
        elif sha(path) != wanted: changed.append(name)
    paths = source_paths if source_paths is not None else load_register_module(root).source_paths()
    current = {name for name in paths if Path(name).suffix in SOURCE_SUFFIXES or name == ".replit"}
    added, removed = sorted(current - set(expected)), sorted(set(expected) - current)
    stale_evidence = []
    for collection in ("pages", "interactions", "backendRoutes"):
        for subject in register.get(collection, []):
            for check in subject.get("requiredChecks", []):
                evidence = check.get("evidence", {})
                for case in evidence.get("cases", [evidence]):
                    if check.get("status") != "PASS": continue
                    name = case.get("testFile")
                    if not name or not (root / name).is_file() or sha(root / name) != case.get("testSha256"):
                        stale_evidence.append(check["id"])
    artifacts = [name for name, expected_sha in register.get("inputArtifactsSha256", {}).items()
                 if not (root / name).is_file() or sha(root / name) != expected_sha]
    computed_digest = hashlib.sha256(json.dumps(expected, sort_keys=True).encode()).hexdigest()
    digest_matches = computed_digest == register.get("platformSourceDigest")
    repository_drift = {"changedFiles": [], "addedFiles": [], "removedFiles": []}
    if plan is not None:
        recorded_files = {row["path"]: row["sha256"] for row in plan.get("repositoryFiles", [])}
        current_rows = repository_files if repository_files is not None else load_plan_module().repository_files(root)
        current_files = {row["path"]: row["sha256"] for row in current_rows}
        repository_drift = {"changedFiles": sorted(name for name in recorded_files.keys() & current_files.keys() if recorded_files[name] != current_files[name]),
                            "addedFiles": sorted(current_files.keys() - recorded_files.keys()), "removedFiles": sorted(recorded_files.keys() - current_files.keys())}
    return {"status": "PASS" if expected and digest_matches and not (changed or missing or added or removed or stale_evidence or artifacts or any(repository_drift.values())) else "STALE",
            "recordedPlatformDigest": register.get("platformSourceDigest"), "recordedSourceFiles": len(expected),
            "digestInternallyConsistent": digest_matches,
            "changedFiles": sorted(changed), "missingFiles": sorted(missing), "addedFiles": added, "removedFiles": removed,
            "stalePassingCheckIds": sorted(set(stale_evidence)), "changedEvidenceArtifacts": sorted(artifacts),
            "fullRepositorySourceDrift": repository_drift,
            "meaning": "Current bytes AND admitted source path set must match; changed evidence is historical, not a current pass."}


def evidence_status(checks, fresh):
    if not checks: return "UNVERIFIED"
    if any(row.get("status") == "FAIL" for row in checks): return "FAIL"
    if fresh and all(row.get("status") == "PASS" and row.get("evidence") for row in checks): return "PASS"
    return "UNVERIFIED" if fresh else "STALE"


def launch_decision(gates, *, source_current, checks_passed, unresolved=0, global_blockers=0):
    """No score/majority can override a missing or failed launch gate."""
    required = set(CRITERIA)
    if set(gates) != required:
        raise ValueError("Every required launch domain must be retained exactly once")
    green = source_current and checks_passed and not unresolved and not global_blockers and all(value == "PASS" for value in gates.values())
    if green: return "GREEN"
    return "RED" if not source_current or unresolved or global_blockers or any(value == "FAIL" for value in gates.values()) else "YELLOW"


def passing_cases(incoming, root=ROOT):
    result = {(row.get("group"), row.get("file"), row.get("name"))
              for row in read_json(incoming / "case-results.json", []) if row.get("status") == "passed"}
    browser = read_json(incoming / "integration-browser/browser-page80-summary.json", {}).get("browser", {})
    if browser.get("exitCode") == 0 and len(browser.get("files", [])) == len(browser.get("caseNames", [])):
        result.update(("browser", name, case) for name, case in zip(browser.get("files", []), browser.get("caseNames", [])))
    for run in read_json(incoming / "node/results.json", {}).get("runs", []):
        log = Path(run.get("log", ""))
        if not log.is_absolute(): log = root / log
        if not log.is_file() or not run.get("logSha256") or sha(log) != run["logSha256"]: continue
        for match in re.finditer(r"^ok \d+ - (.+?)(?: # (SKIP|TODO).*)?$", log.read_text(errors="replace"), re.M):
            if not match.group(2): result.add(("node", run.get("file"), match.group(1)))
    return result


def master_evidence_freshness(incoming, current):
    """A regenerated inventory cannot turn old execution into current proof."""
    recorded = read_json(incoming / "orchestration/source-inputs.json", {})
    result = read_json(incoming / "orchestration/results.json", {})
    files = recorded.get("files", {})
    calculated = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    required = {"browser", "checks", "commerce", "coverage", "http", "load", "node", "operations", "pages", "python", "root", "subsystems"}
    current_matches = bool(files) and files == current.get("files") and recorded.get("sha256") == current.get("sha256") == calculated
    receipt_matches = result.get("sourceInputsUnchanged") is True and result.get("sourceInputsSha256") == calculated and bool(result.get("finishedAt"))
    groups_complete = required <= set(result.get("selectedGroups", []))
    runs, post = result.get("runs", []), result.get("postprocessing", [])
    command_rows = runs + post
    commands_passed = (result.get("status") == "executed_groups_passed" and result.get("catalog", {}).get("exitCode") == 0
        and required <= {row.get("group") for row in runs}
        and {"summary", "platform", "remediation", "completion-plan", "final-summary"} <= {row.get("id") for row in post}
        and bool(command_rows) and all(row.get("exitCode") == 0 and row.get("status") == "passed"
            and not row.get("timedOut") and not row.get("coverageParseExclusions") for row in command_rows))
    return {"status": "PASS" if current_matches and receipt_matches and groups_complete else "STALE_OR_MISSING",
            "sourceInputsMatchCurrent": current_matches, "completedUnchangedReceiptMatches": receipt_matches,
            "allRequiredGroupsSelected": groups_complete, "allSelectedCommandsPassed": commands_passed,
            "producerAllTestsPassed": result.get("allTestsPassed"),
            "recordedSourceInputsSha256": recorded.get("sha256"), "currentSourceInputsSha256": current.get("sha256"),
            "meaning": "Matching current files, internally valid source digest, completed unchanged master and every required group are needed; inventory regeneration alone is not execution."}


def resolve_criteria_evidence(rows, register, incoming, root=ROOT, plan=None):
    """Use the canonical exact-case resolver, not a self-reported status flag."""
    module = load_register_module(root)
    inventory = read_json(incoming / "test-inventory.json", {})
    entries = inventory.get("entries", [])
    if isinstance(entries, list): entries = {row.get("path", row.get("file")): row for row in entries if row.get("category") == "test"}
    if not entries:
        # Inventory schema currently calls these files, not entries.
        entries = {row.get("path", row.get("file")): row for row in inventory.get("files", []) if row.get("category") == "test"}
    allowed = {f"{page['id']}/{domain}/{criterion}" for page in register["pages"]
               for domain, criteria in CRITERIA.items() for criterion in criteria}
    allowed.update(f"platform/{gap[0]}" for gap in GLOBAL_GAPS)
    if plan:
        allowed.update(item["id"] for item in plan.get("workItems", []))
        allowed.update(step["id"] for item in plan.get("workItems", []) for step in item.get("workSteps", []))
    resolved, invalid, seen = {}, [], set()
    cases = passing_cases(incoming, root)
    for row in rows:
        key = row.get("checkId") if isinstance(row, dict) else None
        proof = module.resolve_evidence_cases(row, check_ids=allowed,
                    platform_digest=register.get("platformSourceDigest"), test_entries=entries,
                    passed_cases=cases, root=root)
        if not proof or key in seen:
            invalid.append({"checkId": key, "reason": "Missing/duplicate/stale criterion or absent exact current passing case"})
            resolved.pop(key, None)
        else: resolved[key] = proof
        seen.add(key)
    return resolved, invalid


def dependencies(register, root=ROOT):
    paths = sorted(set(register.get("sourceInputsSha256", {})) | set(load_register_module(root).source_paths()))
    manifest_names = [name for name in paths if Path(name).name in ("package.json", "Cargo.toml", "go.mod", "pyproject.toml")
                      or (Path(name).name.startswith("requirements") and name.endswith(".txt"))]
    manifests = []
    for name in manifest_names:
        path = root / name
        if not path.is_file(): continue
        row = {"file": name, "sha256": sha(path), "scope": "declared-dependency-inventory-not-installation-proof",
               "consumerScope": "shared frontend/backend/build/native root graph" if name == "package.json" else
                                "imported local MaxCore" if name.startswith("external/maxcore/") else
                                "imported local PDIM" if name.startswith("external/pdim/") else "exact declaring directory; trace actual consumers before assigning a page"}
        if name.endswith("package.json"):
            doc = read_json(path, {})
            row["declarations"] = {kind: doc.get(kind, {}) for kind in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "engines")}
        else: row["declarations"] = path.read_text(errors="replace").splitlines()
        manifests.append(row)
    return {"manifests": manifests,
            "lockfiles": [{"file": name, "sha256": sha(root / name)} for name in paths
                          if Path(name).name in ("package-lock.json", "pnpm-lock.yaml", "Cargo.lock", "go.sum", "uv.lock", "poetry.lock") and (root / name).is_file()],
            "runtime": [{"name": name, "sources": sources, "acceptance": acceptance} for name, sources, acceptance in [
                ("Replit Linux / Node / npm / Nix", [".replit", "replit.nix", "package.json"], "Configured supported runtimes install, build and start the exact prepared application on the verified Replit target."),
                ("Neon PostgreSQL", ["server/db.ts", "migrations/", "shared/schema.ts"], "Actual required schema, compatible writers, private connectivity and consistent recovery pass."),
                ("Imported local MaxCore + PDIM", ["external/maxcore/", "external/pdim/", "server/services/maxcoreClient.ts"], "Private local children, scoped tokens, current capabilities, durable state and bounded supervision/recovery pass."),
                ("CPU Python / ffmpeg / media/native libraries", ["python_runtime/", "external/maxcore/artifacts/ai-training-server/", "scripts/verify-runtime-artifacts.mjs"], "Portable current-source runtime/artifact restore, actual media decode and native dependency loading pass."),
                ("Provider configuration", ["server/services/", "server/routes/"], "Existing configured keys are used without disclosure; actual enabled callback/delivery/replay/recovery journeys pass on the verified origin."),
                ("Desktop / mobile / native VST", ["electron/", "capacitor.config.ts", "VST3/"], "Original source, supported native builders/resources, safe configuration and target-device journeys pass.")]],
            "limits": ["Manifest declarations are exact static dependencies, not proof every installed consumer executes.",
                       "Per-page imported files and API candidates are retained separately; dynamic bindings and unresolved mappings require execution, not guesses.",
                       "No secrets or runtime environment values are read or written by this audit."]}


def make_report(register, plan, freshness, proofs=None, invalid=None):
    validate_inventory(register, plan)
    proofs, invalid = proofs or {}, invalid or []
    fresh = freshness["status"] == "PASS"
    global_requirements = [{"id": key, "status": "PASS" if fresh and proofs.get(f"platform/{key}") else "UNVERIFIED",
                            "acceptance": acceptance, "evidence": proofs.get(f"platform/{key}", []) if fresh else []}
                           for key, _, _, _, _, _, _, acceptance in GLOBAL_GAPS]
    global_blockers = [row["id"] for row in global_requirements if row["status"] != "PASS"]
    if freshness.get("masterLaunchGatePassed") is False:
        global_blockers.append("canonical-master-required-gates")
    by_id = {row["id"]: row for kind in ("pages", "interactions", "backendRoutes", "frontendContracts") for row in register.get(kind, [])}
    checks_by_id = {check["id"]: check for row in by_id.values() for check in row.get("requiredChecks", [])}
    work_passes = {}
    for item in plan.get("workItems", []):
        if item["kind"] == "registered-required-check":
            check = checks_by_id.get(item["id"], {})
            passed = fresh and check.get("status") == "PASS" and bool(check.get("evidence"))
        elif item["kind"] == "page-business-section":
            steps = item.get("workSteps", [])
            passed = fresh and len(steps) == 6 and all(proofs.get(step["id"]) for step in steps)
        else:
            passed = fresh and bool(proofs.get(item["id"]))
        work_passes[item["id"]] = bool(passed)
    page_owned_entities = {page["id"] for page in register["pages"]}
    page_owned_entities.update(key for page in register["pages"] for field in ("uiInteractionIds", "backendRouteIds", "frontendContractIds") for key in page.get(field, []))
    global_pending = [item["id"] for item in plan.get("workItems", [])
                      if item.get("entityId") not in page_owned_entities and not work_passes[item["id"]]]
    pages, feature_inventory, roadmap = [], [], []
    all_section_ids = []
    for ordinal, page in enumerate(register["pages"], 1):
        business = plan["businessPageWork"][page["id"]]
        ui = [by_id[key] for key in page.get("uiInteractionIds", []) if key in by_id]
        api = [by_id[key] for key in page.get("backendRouteIds", []) if key in by_id]
        calls = [by_id[key] for key in page.get("frontendContractIds", []) if key in by_id]
        checks = [check for subject in [page] + ui + api for check in subject.get("requiredChecks", [])]
        passed = [check for check in checks if fresh and check.get("status") == "PASS" and check.get("evidence")]
        criterion_rows, gates = [], {}
        for domain, criteria in CRITERIA.items():
            for key, acceptance in criteria.items():
                check_id = f"{page['id']}/{domain}/{key}"
                proof = proofs.get(check_id) if fresh else None
                criterion_rows.append({"id": check_id, "domain": domain, "criterion": key,
                    "status": "PASS" if proof else "UNVERIFIED", "passIf": acceptance,
                    "failIf": "Any required assertion fails, is skipped, lacks exact current evidence, or is claimed non-applicable without traced proof.",
                    "requiredMethod": "automated + manual actual screen-reader review" if key == "screen-reader" else
                                      "actual manual keyboard/browser review + regressions" if key == "keyboard-focus" else "actual behavior and current-source exact-case evidence",
                    "evidence": proof or []})
            gates[domain] = "PASS" if all(row["status"] == "PASS" for row in criterion_rows if row["domain"] == domain) else "UNVERIFIED"
        # Linked source checks remain an additional conjunctive requirement,
        # independent from page-level quality/capacity/deployment criteria.
        registered_status = evidence_status(checks, fresh)
        if registered_status == "FAIL": gates["qa"] = "FAIL"
        unresolved = sum(call.get("topologyStatus") != "matched" for call in calls)
        page_entity_ids = {page["id"]} | {row["id"] for row in ui + api + calls}
        page_work = [item for item in plan.get("workItems", []) if item.get("entityId") in page_entity_ids]
        page_pending = [item["id"] for item in page_work if not work_passes[item["id"]]]
        decision = launch_decision(gates, source_current=fresh,
                                   checks_passed=registered_status == "PASS" and not page_pending,
                                   unresolved=unresolved + len(invalid), global_blockers=len(global_blockers) + len(global_pending))
        sections = business.get("businessSections", [])
        for section_index, section in enumerate(sections):
            all_section_ids.append((page["id"], section["id"]))
            work_id = f"{page['id']}/{section['id']}"
            feature_inventory.append({"id": work_id, "pageId": page["id"], "sectionId": section["id"], "name": section["name"],
                "implementationStatus": "PRODUCTION_ACCEPTED" if decision == "GREEN" else "SOURCE_PRESENT_UNVERIFIED",
                "verifiedImplementationCompletionPercent": 100 if decision == "GREEN" else None,
                "sectionAcceptanceStatus": "PASS" if work_passes.get(work_id) else "UNVERIFIED",
                "verifiedDimensionSteps": sum(fresh and bool(proofs.get(f"{work_id}/{name}")) for name in
                    ("frontendWork", "backendWork", "validationPermissionsSecurity", "durableProviderGenerationJourneys", "failureAccessibilityMobileI18nPerformance", "evidenceNeeded")),
                "sourceFiles": section.get("sourceFiles", []), "controlCount": len(section.get("controls", [])),
                "controlIds": section.get("interactionIds", []), "frontendContractIds": section.get("frontendContractIds", []),
                "backendRouteIds": section.get("backendRouteIds", []), "apiBindingStatus": section.get("apiBindingStatus"),
                "requiredAction": "Execute every retained section dimension and applicable page criterion; reproduce actual missing/partial behavior before classifying it as implemented, partial or missing.",
                "existingPlanReference": {"file": PLAN, "pointer": f"/businessPageWork/{page['id']}/businessSections/{section_index}"}})
            dimensions = [("frontendWork", "frontend"), ("backendWork", "backend"),
                          ("validationPermissionsSecurity", "security"), ("durableProviderGenerationJourneys", "durability"),
                          ("failureAccessibilityMobileI18nPerformance", "failure-accessibility-localization-performance"), ("evidenceNeeded", "evidence")]
            roadmap.append({"level1Milestone": "M4-All-80-pages-and-shared-systems",
                "level2Deliverable": {"id": page["id"], "name": page.get("component"), "route": page.get("path")},
                "level3Feature": {"id": section["id"], "name": section["name"]},
                "level4Components": section.get("sourceFiles", []),
                "level5ImplementationTasks": [{"id": f"{work_id}/{name}", "existingDimension": name,
                    "actions": section.get(name, []), "dependencies": section.get("backendRouteIds", []) + section.get("frontendContractIds", [])}
                    for name, label in dimensions],
                "level6Validation": [row["id"] for row in criterion_rows],
                "level7ProductionAcceptance": "Every section dimension, associated exact required check and applicable page criterion passes from current source; no blocker/unknown can be replaced by a render, majority score or another route alias.",
                "rollback": "Use isolated reversible fixtures; preserve original failures. Review durable/schema/provider compatibility and consistent recovery before deployed mutation."})
        page_row = {"ordinal": ordinal, "id": page["id"], "pageName": page.get("component"), "route": page.get("path"),
            "source": page.get("source"), "implementationCompletionPercent": 100 if decision == "GREEN" else None,
            "completionPercentageMeaning": "Unknown until complete feature acceptance; static source presence is not an implementation percentage.",
            "verifiedAcceptanceCoveragePercent": round(len(passed) * 100 / len(checks), 4) if checks else 0,
            "requiredRegisteredChecks": len(checks), "verifiedRegisteredChecks": len(passed),
            "historicalPassingRegisteredChecks": sum(check.get("status") == "PASS" for check in checks),
            "frontendStatus": gates["frontend"], "backendStatus": gates["backend"], "apiStatus": evidence_status([c for subject in api for c in subject.get("requiredChecks", [])], fresh),
            "databaseStatus": gates["database"], "aiStatus": gates["ai"], "testingStatus": gates["qa"],
            "accessibilityStatus": gates["accessibility"], "productionReadinessStatus": decision,
            "launchReadinessScore": round(sum(value == "PASS" for value in gates.values()) * 100 / len(CRITERIA), 4),
            "launchReadinessScoreMeaning": f"Percent of {len(CRITERIA)} complete launch domains independently verified; every domain AND all exact source checks are required for Green.",
            "gates": gates, "criteria": criterion_rows, "businessSectionIds": [s["id"] for s in sections],
            "controlIds": page.get("uiInteractionIds", []), "frontendContractIds": page.get("frontendContractIds", []),
            "backendRouteIds": page.get("backendRouteIds", []), "reachableSourceFiles": page.get("reachableSourceFiles", []),
            "dependencies": {"frontend": page.get("reachableSourceFiles", []),
                             "backend": [{"id": row["id"], "source": row.get("source"), "method": row.get("method"), "path": row.get("path"), "processScope": row.get("processScope")} for row in api],
                             "integration": [{"id": row["id"], "method": row.get("method"), "path": row.get("path"), "backendRouteIds": row.get("backendRouteIds", []), "bindingStatus": row.get("topologyStatus")} for row in calls],
                             "ai": {"status": "REQUIRES_TRACE_OR_EXPLICIT_NON_APPLICABILITY", "candidateSourceFiles": [name for name in page.get("reachableSourceFiles", []) if re.search(r"(?:ai|awareness|generat|maxcore)", name, re.I)]},
                             "database": {"status": "REQUIRES_HANDLER_TO_SCHEMA_TRACE", "candidateSources": sorted({row.get("source", {}).get("file") for row in api if row.get("source", {}).get("file")})}},
            "unresolvedFrontendBindings": unresolved,
            "globalBlockerIds": global_blockers,
            "pendingExactPageWorkItemIds": page_pending, "requiredExactPageWorkItems": len(page_work),
            "verifiedExactPageWorkItems": len(page_work) - len(page_pending),
            "requiredSectionDimensionSteps": len(sections) * 6,
            "verifiedSectionDimensionSteps": sum(bool(proofs.get(f"{page['id']}/{section['id']}/{name}")) and fresh
                for section in sections for name in ("frontendWork", "backendWork", "validationPermissionsSecurity", "durableProviderGenerationJourneys", "failureAccessibilityMobileI18nPerformance", "evidenceNeeded")),
            "blockers": (["Current-source evidence is stale"] if not fresh else []) +
                        [f"{len(checks) - len(passed)} exact registered checks remain unverified", f"{len(criterion_rows) - sum(r['status'] == 'PASS' for r in criterion_rows)} launch criteria remain unverified"] +
                        ([f"{unresolved} frontend API candidates need binding resolution"] if unresolved else []),
            "requiredActions": [business.get("routeSpecificWork"), business.get("businessJourneyWork"),
                                "Execute every business section and all six dimensions; then every explicit pass/fail criterion retained in this row.",
                                "Resolve shared deployment, schema, provider, capacity, recovery and native prerequisites without converting unknown into pass."],
            "existingPageLedger": f"docs/testing/platform-pages/{ordinal:02d}-{page['id']}.md",
            "dependencyMeaning": "Static reachable files/contracts are candidates, not verified section/service/database/AI bindings."}
        pages.append(page_row)
    return {"schemaVersion": 1, "scope": "All 80 registered page declarations, every retained business section/dimension, every existing global work item and shared/native/deployment lane",
            "productionReady": all(page["productionReadinessStatus"] == "GREEN" for page in pages),
            "sourceRevision": register.get("sourceRevision"), "sourceFreshness": freshness,
            "globalRequirements": global_requirements,
            "pendingGlobalWorkItemIds": global_pending,
            "workItemAcceptanceStatus": {key: "PASS" if value else "UNVERIFIED" for key, value in work_passes.items()},
            "summary": {"pages": len(pages), "colors": dict(Counter(page["productionReadinessStatus"] for page in pages)),
                        "businessSections": len(all_section_ids), "businessDimensionSteps": len(all_section_ids) * 6,
                        "retainedExistingWorkItems": len(plan.get("workItems", [])), "criterionInstances": sum(len(page["criteria"]) for page in pages),
                        "greenPages": sum(page["productionReadinessStatus"] == "GREEN" for page in pages),
                        "verifiedImplementationPercentage": None},
            "pages": pages, "features": feature_inventory, "roadmap": roadmap, "invalidCriterionEvidence": invalid,
            "limits": ["Unknown implementation state is not a confirmed missing feature. No feature is marked complete merely because its source exists.",
                       "This extends the existing plan; its exact source checks, global work items and shared lanes retain their original IDs and denominators.",
                       "Static scanning cannot establish every hidden runtime dependency; all unresolved mappings remain explicit work, not a claim that unknowns do not exist.",
                       "No deployed operation, API credential readiness, provider side effect, manual accessibility conformance or global capacity is inferred from this producer."]}


def gap_records(register, plan, report):
    gaps = []
    for order, (key, risk, system, cause, fix, deps, refs, acceptance) in enumerate(GLOBAL_GAPS, 1):
        accepted = next(row["status"] for row in report["globalRequirements"] if row["id"] == key) == "PASS"
        gaps.append({"id": key, "kind": "cross-platform-launch-prerequisite", "status": "PASS" if accepted else "OPEN_REQUIRES_CURRENT_ACCEPTANCE",
            "rootCause": cause, "affectedSystems": [system], "requiredFixes": [fix], "dependencies": deps,
            "executionOrder": order, "risk": risk, "validationCriteria": acceptance, "productionAcceptanceCriteria": acceptance,
            "evidenceReferences": refs, "rollback": "Preserve failing receipts; use owned fixtures and source-control changes. Actual target schema/provider mutations require a concrete consistent backup/compatibility plan."})
    templates = register.get("checkTemplates", {})
    for item in plan.get("workItems", []):
        if report["workItemAcceptanceStatus"].get(item["id"]) == "PASS": state = "PASS_CURRENT_EXACT_EVIDENCE"
        else: state = "UNVERIFIED_OR_INCOMPLETE_NOT_ASSUMED_PRODUCT_DEFECT"
        gaps.append({"id": item["id"], "kind": item["kind"], "status": state,
            "rootCause": "Existing exact work item lacks complete current production acceptance; determine implementation versus evidence gap by executing its contract.",
            "affectedSystems": [item.get("entityCollection", item.get("subsystemId", "shared-platform")), item.get("entityId", item.get("file", ""))],
            "requiredFixes": ["Execute the retained work item's exact source behavior, reproduce any defect, implement the smallest complete fix, and retain successful/adverse proof."],
            "dependencies": ["source-evidence", "exact-feature-evidence"], "executionOrder": "M4 after shared prerequisites; dependency-specific order in original page/shared ledger",
            "risk": "UNASSESSED_UNTIL_CONTRACT_REVIEW", "validationCriteria": templates.get(item.get("template"),
                "All named original work-item assertions and corresponding launch criteria pass with actual owned fixtures, exact source/test hashes and cleanup."),
            "productionAcceptanceCriteria": "Current exact linked evidence, no required skip/unknown, all applicable page/shared/deployment gates pass.",
            "existingPlanReference": {"file": PLAN, "workItemId": item["id"]}})
    return gaps


def write_json(path, doc):
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")


def write_outputs(report, register, plan, output, root=ROOT, register_input=None, plan_input=None):
    output.mkdir(parents=True, exist_ok=True)
    report = dict(report)
    features, roadmap = report.pop("features"), report.pop("roadmap")
    report["artifacts"] = {"features": "features.json", "roadmap": "roadmap.json", "gaps": "gaps.json", "dependencies": "dependencies.json"}
    write_json(output / "status.json", report)
    write_json(output / "features.json", {"status": "SOURCE_PRESENT_UNVERIFIED", "items": features})
    write_json(output / "roadmap.json", {"levels": 7, "allPages": 80, "allSectionCount": len(roadmap), "items": roadmap,
               "retainedGlobalWorkItemIds": [item["id"] for item in plan.get("workItems", [])],
               "sharedSubsystems": plan.get("sharedSubsystems", []), "globalUnroutedEntityIds": plan.get("globalUnroutedEntityIds", {})})
    write_json(output / "gaps.json", {"items": gap_records(register, plan, report), "unknownMappings": register.get("unknownMappings", [])})
    write_json(output / "dependencies.json", dependencies(register, root))
    lines = ["# Launch status matrix — all 80 page declarations", "", "Generated by `scripts/testing/launch-readiness-audit.py`. No page is Green unless every independent launch domain and exact registered check passes against current source.", "",
        f"Implementation completion is **unknown** where not fully verified. The percentage below is verified exact acceptance coverage, not an estimate of implementation or a page-render pass rate. The launch score is the fraction of {len(CRITERIA)} complete independently verified launch domains.", "",
        f"Source evidence: **{report['sourceFreshness']['status']}**. Pages: {report['summary']['pages']}; Green: {report['summary']['greenPages']}; sections: {report['summary']['businessSections']}; dimension steps: {report['summary']['businessDimensionSteps']}; existing work items retained: {report['summary']['retainedExistingWorkItems']}.", "",
        "| # | Page / exact path | Implementation % | Verified acceptance % | Frontend | Backend | API | Database | AI | Testing | Accessibility | Launch | Score |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for page in report["pages"]:
        cell = f"{page['pageName']} `{page['route']}`".replace("|", "\\|")
        lines.append(f"| {page['ordinal']} | {cell} | Unknown | {page['verifiedAcceptanceCoveragePercent']} | {page['frontendStatus']} | {page['backendStatus']} | {page['apiStatus']} | {page['databaseStatus']} | {page['aiStatus']} | {page['testingStatus']} | {page['accessibilityStatus']} | {page['productionReadinessStatus']} | {page['launchReadinessScore']} |")
    lines += ["", "All per-page blockers, required actions, exact section/control/API/backend IDs, source dependencies and explicit criterion pass/fail conditions are in [status.json](status.json). Every feature, seven-level section roadmap and every original global work item remain in [features.json](features.json), [roadmap.json](roadmap.json) and [gaps.json](gaps.json). Declarations and runtime dependency prerequisites are in [dependencies.json](dependencies.json).", ""]
    for page in report["pages"]:
        lines += [f"## {page['ordinal']}. {page['pageName']} — `{page['route']}`", "", f"{len(page['businessSectionIds'])} sections; {len(page['controlIds'])} controls; {len(page['frontendContractIds'])} frontend API candidates; {len(page['backendRouteIds'])} backend declarations. Exact identities and all criterion outcomes: `status.json` → pages[{page['ordinal'] - 1}].", "", "Blockers:", ""]
        lines += [f"- {blocker}." for blocker in page["blockers"]]
        lines += ["", "Required actions:", ""] + [f"- {action}" for action in page["requiredActions"] if action] + [""]
    (output / "matrix.md").write_text("\n".join(lines))
    input_paths = [register_input or root / REGISTER, plan_input or root / PLAN]
    manifest = {"schemaVersion": 1, "inputs": {str(path.relative_to(root)) if path.is_relative_to(root) else str(path): sha(path) for path in input_paths},
                "artifacts": [{"path": path.name, "sha256": sha(path), "bytes": path.stat().st_size}
                              for path in sorted(output.iterdir()) if path.is_file() and path.name != "manifest.json"],
                "productionReady": report["productionReady"]}
    write_json(output / "manifest.json", manifest)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--register", type=Path, default=ROOT / REGISTER)
    parser.add_argument("--plan", type=Path, default=ROOT / PLAN)
    parser.add_argument("--output", type=Path, default=ROOT / "reports/launch-readiness/current")
    parser.add_argument("--criterion-evidence", type=Path, help="Optional exact-case map; no evidence means unverified, not a pass")
    parser.add_argument("--require-green", action="store_true", help="Return 1 until every page and launch gate is Green")
    args = parser.parse_args(argv)
    register, plan = read_json(args.register), read_json(args.plan)
    if not register or not plan: parser.error("Both actual register and exhaustive plan are required")
    freshness = source_freshness(register, plan=plan)
    common_spec = importlib.util.spec_from_file_location("launch_test_common", ROOT / "scripts/testing/common.py")
    common = importlib.util.module_from_spec(common_spec)
    common_spec.loader.exec_module(common)
    master_freshness = master_evidence_freshness(args.register.parent, common.source_inputs())
    freshness["canonicalMasterEvidence"] = master_freshness
    freshness["masterLaunchGatePassed"] = master_freshness["status"] == "PASS" and master_freshness["allSelectedCommandsPassed"]
    if master_freshness["status"] != "PASS": freshness["status"] = "STALE"
    mappings = read_json(args.criterion_evidence, {}).get("checks", []) if args.criterion_evidence else []
    proofs, invalid = resolve_criteria_evidence(mappings, register, args.register.parent, plan=plan) if mappings else ({}, [])
    report = make_report(register, plan, freshness, proofs, invalid)
    write_outputs(report, register, plan, args.output, register_input=args.register.resolve(), plan_input=args.plan.resolve())
    print(json.dumps({"output": str(args.output), "sourceFreshness": freshness["status"], **report["summary"], "productionReady": report["productionReady"]}))
    return 1 if args.require_green and not report["productionReady"] else 0


if __name__ == "__main__":
    sys.exit(main())
