#!/usr/bin/env python3
"""Generate the exhaustive work ledger; inventory completeness is not readiness."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
COLLECTIONS = ("pages", "interactions", "backendRoutes", "frontendContracts", "sourceCoverage", "unknownMappings")
REFERENCE_FIELDS = {"uiInteractionIds": "interactions", "frontendContractIds": "frontendContracts", "backendRouteIds": "backendRoutes"}
EXCLUDED_FILE_ROOTS = {".git", "node_modules", ".prepared-release", ".local", "reports", "docs", "coverage", "test-results", "playwright-report"}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def encoded(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def stable_id(prefix, value):
    return prefix + "-" + digest(value)[:16]


def entity_ids(rows, collection):
    ids = []
    seen = set()
    occurrences = {}
    for row in rows:
        if collection == "sourceCoverage":
            identity = stable_id("coverage", row["file"])
        elif collection == "unknownMappings":
            base = stable_id("mapping", row)
            occurrences[base] = occurrences.get(base, 0) + 1
            identity = base + "-" + str(occurrences[base])
        else:
            identity = row["id"]
        if identity in seen:
            raise ValueError(f"Duplicate {collection} identity: {identity}")
        ids.append(identity)
        seen.add(identity)
    return ids


def validate_plan(registry, plan):
    """Validate emitted collections/tasks, not a count inferred from input alone."""
    result = {}
    errors = []
    for key in COLLECTIONS:
        expected = entity_ids(registry[key], key)
        actual = entity_ids(plan.get("registry", {}).get(key, []), key)
        missing, extra = sorted(set(expected) - set(actual)), sorted(set(actual) - set(expected))
        result[key] = {"expected": len(expected), "planned": len(actual), "missingIds": missing, "extraIds": extra,
                       "setEquality": not missing and not extra}
        if missing or extra or canonical(plan["registry"].get(key)) != canonical(registry[key]):
            errors.append(f"Lost or altered {key} inventory details: missing={missing}, extra={extra}")
        if plan.get("entityIds", {}).get(key) != actual:
            errors.append(f"Incorrect emitted {key} identity index")
    actual_work = [item["id"] for item in plan.get("workItems", [])]
    if len(actual_work) != len(set(actual_work)):
        errors.append("Duplicate emitted work identity")
    expected_checks = {check["id"] for key in ("pages", "interactions", "backendRoutes") for row in registry[key] for check in row.get("requiredChecks", [])}
    actual_checks = {item["id"] for item in plan.get("workItems", []) if item.get("kind") == "registered-required-check"}
    if expected_checks != actual_checks:
        errors.append("Required-check work item set differs from original register")
    expected_work = set(expected_checks)
    expected_work.update(row["id"] + "/consumer-contract" for row in registry["frontendContracts"])
    expected_work.update(identity + "/" + metric for identity in plan["entityIds"]["sourceCoverage"] for metric in ("statements", "functions", "branches", "lines"))
    expected_work.update(identity + "/resolve" for identity in plan["entityIds"]["unknownMappings"])
    expected_work.update(row["id"] + "/contract" for row in plan.get("repositoryFiles", []))
    expected_work.update(task["id"] for lane in plan.get("sharedSubsystems", []) for task in lane["requiredWork"])
    expected_work.update(page_id + "/" + section.get("id", stable_id("section", section)) for page_id, page in plan.get("businessPageWork", {}).items() for section in page.get("businessSections", []))
    if expected_work != set(actual_work):
        errors.append("Generated work item set differs from exhaustive entity/section/coverage/file/lane work")
    available_entities = {key: set(value) for key, value in plan.get("entityIds", {}).items()}
    for key in ("repositoryFiles", "sharedSubsystems"):
        available_entities[key] = {row["id"] for row in plan.get(key, [])}
    for item in plan.get("workItems", []):
        key = item["entityCollection"]
        if item["entityId"] not in available_entities.get(key, set()):
            errors.append(f"Missing work entity {key}/{item['entityId']}")
        if item.get("kind") == "page-business-section":
            page = plan["businessPageWork"][item["entityId"]]
            section = next((s for s in page["businessSections"] if s.get("id", stable_id("section", s)) == item["sectionId"]), None)
            expected_fields = {key for key in section if key.endswith("Work") or key in {"validationPermissionsSecurity", "durableProviderGenerationJourneys", "failureAccessibilityMobileI18nPerformance", "evidenceNeeded"}}
            if expected_fields != {step["field"] for step in item.get("workSteps", [])}:
                errors.append(f"Missing exact business-section work dimensions: {item['id']}")
    if errors:
        raise ValueError("Completion plan lost required work:\n" + "\n".join(errors))
    return result


def repository_files(root):
    """All Git-visible non-generated source/config/assets, not just JS coverage."""
    run = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=root,
                         check=True, capture_output=True)
    result = []
    for name in sorted(set(os.fsdecode(part) for part in run.stdout.split(b"\0") if part)):
        parts = Path(name).parts
        if not parts or parts[0] in EXCLUDED_FILE_ROOTS or any(p in {"node_modules", "__pycache__", "target"} for p in parts):
            continue
        if parts[0] == "dist" and name != "dist/pdim-restore.mjs":
            continue
        path = root / name
        if not path.exists() and not path.is_symlink():
            continue
        if path.is_symlink():
            value = hashlib.sha256(("link:" + os.readlink(path)).encode()).hexdigest()
            kind = "symlink"
        elif path.is_file():
            with path.open("rb") as stream:
                value = hashlib.file_digest(stream, "sha256").hexdigest()
            kind = "file"
        else:
            continue
        suffix = path.suffix.lower()
        category = ({".py": "python", ".go": "go", ".rs": "rust", ".cpp": "cpp", ".cc": "cpp", ".c": "native-c",
                     ".h": "native-header", ".hpp": "native-header", ".sql": "database", ".sh": "shell", ".nix": "nix",
                     ".yaml": "configuration", ".yml": "configuration", ".json": "data-configuration-translation",
                     ".css": "styles", ".html": "markup", ".ts": "typescript", ".tsx": "typescript-ui",
                     ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript"}.get(suffix, "asset-or-other-source"))
        result.append({"id": stable_id("file", name), "path": name, "kind": kind, "category": category, "sha256": value,
                       "status": "UNVERIFIED", "acceptance": "Review this exact file's callers and input/output contract; implement missing behavior, add appropriate execution/format/configuration checks and link current evidence. Binary assets require decode, integrity, licensing/availability and consumer checks; test count alone is not source coverage."})
    return result


SHARED_WORK = [
    ("auth", "Authentication, sessions, authorization and tenant isolation", "auth|session|csrf|permission|security", [
        "Exercise registration, verification, login/logout, password recovery, session rotation/expiry, MFA and role changes through real HTTP and the UI.",
        "Prove anonymous, owner, foreign-owner and administrator policies on every protected resource; reject CSRF, replay and privilege changes before mutation.",
        "Verify atomic rate admission, lockout/recovery, cookie/proxy settings and dependency-outage behavior across concurrent workers."]),
    ("database", "Neon schema, migrations and transaction authority", "schema|migration|database|/db", [
        "Apply every ordered migration on disposable PostgreSQL; assert constraints, rollback limits, concurrency and durable readback using independent connections.",
        "Compare deployed schema read-only; coordinate writer drain, verified backup, migration, canary and rollback before production changes.",
        "Prove connection limits, pooled transaction semantics, timeout handling and schema compatibility for old/new workers."]),
    ("storage", "PDIM, hybrid bytes, uploads, deletion and backup/recovery", "pdim|hybrid|storage|upload|backup|restore|fabric", [
        "Verify exact bytes, hashes, manifests, owner/public access and chunk references through upload, delivery, deduplication, deletion and interrupted retries.",
        "Exercise multiworker SQL metadata and byte authority, generation fences, pending journals and orphan cleanup without cross-owner deletion.",
        "Restore a jointly consistent current SQL-and-blob backup after a genuine restart; keep legacy-format proof separate."]),
    ("awareness", "Public live awareness ingestion, refresh and provenance", "awareness|sources.py|learning", [
        "Read only eligible public sources; test public/private boundary, empty/malformed content, recency, relevance and provenance retention.",
        "Verify refresh ownership, bounded source failure, stale snapshot rejection and automatic recovery without fabricated observations.",
        "Execute live snapshot creation and every consuming request; distinguish ingestion, snapshot readiness and output quality."]),
    ("generation", "MaxCore text, image, audio and video generation", "maxcore|generation|renderer|model|creative", [
        "Trace each generation UI/action to the actual capability route and awareness endpoint; cover every declared consumer and modality.",
        "Generate and decode real text/image/audio/video outputs with valid controls, content/format constraints, ownership, durable delivery and cancellation.",
        "Test invalid inputs, stale signals, unavailable engines, timeouts, capacity limits and recovery; acknowledge 503 until the required capability actually works.",
        "Assess semantic/creative quality using explicit reviewed criteria; procedural rendering and live context alone cannot certify best-in-world output."]),
    ("beat-loop", "Beat creation, listing, licensing, sale and royalty loop", "beat|royalt|marketplace|license|settlement", [
        "Generate real instrumental audio and artwork, decode and persist them, list with valid ownership/rights and retrieve from another authenticated request.",
        "Execute browse/cart/license/checkout/webhook/entitlement/download/royalty/settlement flows with exact durable balances and replay-safe delivery.",
        "Test failed generation, orphaned assets, duplicate payments, refunds, payout blocks and interrupted retry without invented income or rights."]),
    ("studio", "DAW, DSP instruments/effects and native VST3", "studio|daw|dsp|plugin|vst|juce", [
        "Operate every studio transport, track, clip, recording, automation, MIDI, instrument/effect, preset, routing, save/load and export control.",
        "Measure audio output, boundaries, DSP lifecycle, parameter extremes, latency, clipping/NaN and cleanup through the browser audio graph.",
        "Locate original JUCE/C++ source and rebuild native plugins for Linux and supported operating systems; imported Windows binaries do not establish Linux compatibility.",
        "Verify discovery, parameter/state restoration, plugin failure isolation, sandboxing and DAW integration separately for native and browser implementations."]),
    ("commerce", "Subscriptions, billing, payments, tax, Connect and payouts", "stripe|billing|payment|subscription|tax|payout|connect", [
        "Verify current-provider/customer authority, subscription changes, invoices, receipts, lifetime tiers and entitlement readback through the application.",
        "Prove signed callbacks, duplicate/reordered events, refund/dispute/retry behavior and transaction/accounting invariants.",
        "Execute deployed checkout and signed delivery plus configured Tax/Connect onboarding, transfer and payout capabilities; API keys alone do not prove account capability."]),
    ("providers", "External social, music, distribution, email and analytics providers", "provider|social|spotify|youtube|distribution|oauth|email|analytics", [
        "Inventory every enabled adapter and credential/capability prerequisite; exercise OAuth/state/refresh/revocation and intended account permissions.",
        "Run publish/distribute/read/import/export journeys with actual receipts, provider IDs and durable application state; never substitute a mock receipt for delivery.",
        "Verify provider throttling, errors, retries, idempotency, cancellation and redaction; keep live sandbox and production evidence distinct."]),
    ("queues", "Workers, schedules, automation and durable media jobs", "queue|worker|job|scheduler|autopilot|automation|bull", [
        "Verify admission before acknowledgement, shared job polling, owner/family scope, leases, heartbeats, stale-worker fencing and conditional completion.",
        "Exercise retry/backoff, deduplication, cancellation, expiration, restart, dead-letter recovery and staged artifact cleanup.",
        "Prove schedules execute exactly their intended actions with consent, quiet hours and provider receipts across worker topology."]),
    ("notifications", "Notifications, administrators, audit and security response", "notification|admin|audit|selfHealing|security", [
        "Deliver to actual authorized recipients, persist and read acknowledgement/preferences and exclude ordinary users from administrator data.",
        "Test alert delivery failure, no-recipient cases, threat history, mitigation/recovery, metrics and redaction without false success.",
        "Verify privileged UI actions, exports, moderation and audit trails through both authorized and denied journeys."]),
    ("accessibility", "Accessibility, responsive layouts and all page states", "client/src|css|ui/", [
        "For every declared page and control verify accessible names, semantics, keyboard operation, focus order/traps, announcements and contrast.",
        "Exercise mobile/touch/zoom layouts, reduced motion, loading/empty/error/retry states, cancellation and duplicate submission.",
        "Use browser assertions and assistive-technology review; shell rendering does not close individual control or business contracts."]),
    ("languages", "All configured languages, localization and bidirectional content", "i18n|locale|translation|language|client/src", [
        "Enumerate every configured locale and translation key; verify missing/fallback/plural/interpolation behavior and safe user-generated content.",
        "Exercise every page and critical journey in each supported locale, including RTL, dates, numbers, currency and long labels.",
        "Verify backend validation, generated content language, provider limitations and persisted language preferences; a locale declaration is not a passing journey."]),
    ("offline-mobile", "Offline synchronization, PWA and mobile platforms", "offline|service-worker|manifest|pwa|android|ios|capacitor|mobile", [
        "Test installation, service-worker upgrades, cache invalidation, offline drafts/queues, reconnection and authoritative conflict resolution.",
        "Prove account isolation, logout cleanup, retry/deduplication and recovery after process/device interruption.",
        "Build and exercise configured Android/iOS targets, permissions, deep links, notifications, media capture and store packaging where implemented."]),
    ("desktop", "Electron desktop, operating-system installers and updates", "electron|desktop|installer|portable|builder", [
        "Build and launch each configured desktop OS/architecture target; verify signed/notarized installer/update requirements and native dependencies.",
        "Test sandbox/context isolation, IPC authorization, navigation/deep links, filesystem/media permissions, persistence and shutdown.",
        "Exercise installation, upgrade, rollback/uninstall and native plugin discovery; web browser passage does not certify desktop artifacts."]),
    ("hardware", "Native hardware, accelerators and optional execution backends", r"hardware|cuda|gpu|\.cu|native|simd", [
        "Inventory required hardware/toolchains and original sources; build the actual native modules and verify ABI/runtime compatibility.",
        "Run genuine device/backend behavior, numerical equivalence, resource bounds, fallback/fault recovery and concurrency on the stated hardware.",
        "Keep absent hardware or missing source explicitly BLOCKED/UNVERIFIED; software emulation and projected metrics are separate evidence."]),
    ("security", "Platform security and dependency supply chain", "security|auth|package|lock|sanitize|upload|api", [
        "Review all trust boundaries and test injection, XSS, SSRF, traversal, upload MIME/size, secret redaction and tenant isolation on reachable paths.",
        "Run dependency/security checks on all locked ecosystems and built artifacts; remediate demonstrated findings and retain exact advisory scope.",
        "Verify credentials, public/private source boundaries, transport, encryption, key rotation and abuse response without printing secrets."]),
    ("capacity", "Performance, global concurrency and realistic topology", "load|stress|scale|performance|pdim|queue|deployment", [
        "Measure actual concurrent clients, throughput, latency percentiles, errors and resource use for representative authenticated/generation/payment/storage workloads.",
        "Establish common SQL/blob/queue/job authority, staging and failure domains for the intended multi-instance/region topology.",
        "Test saturation, backpressure, failover and recovery; retain 90M projections as projections and report only executed concurrency as measured capacity."]),
    ("deployment", "Replit Nix, release build, cold startup and deployed identity", r"replit|\.nix|release|deploy|build.sh|start.sh|docker", [
        "Verify exact Node/npm/Nix toolchain, locked dependency installation, source identity, capsule integrity and clean publishing payload.",
        "Build and cold-start the actual Replit image with local MaxCore/PDIM; measure real Nix closure and VM/image allocation.",
        "Identify and probe the published HTTPS origin, readiness and all enabled application journeys; an editor URL or portable local payload is insufficient.",
        "Run controlled migration/deploy/canary/rollback and restart against reviewed state and provider configuration; no false readiness for unavailable capabilities."]),
    ("operations", "CI, observability, incident response and recovery", r"\.github|observ|metric|logging|monitor|health|readiness|backup|recovery", [
        "Run all test/lint/type/build/audit jobs from stable source, preserve actual exits and source provenance and reject omitted or unmappable coverage.",
        "Verify structured redacted logs, metrics, alert routing, tracing, dashboards, actionable failure diagnostics and retention.",
        "Rehearse dependency/process/data-loss incidents, backup restore, rollback, worker restart and cleanup with bounded recovery objectives."]),
]


def build_plan(registry, page_work=(), files=(), expected_pages=80, require_page_work=False, registry_file_sha256=None):
    import re
    for key in COLLECTIONS:
        if not isinstance(registry.get(key), list):
            raise ValueError(f"Missing or invalid collection: {key}")
    if len(registry["pages"]) != expected_pages:
        raise ValueError(f"Expected {expected_pages} page declarations, found {len(registry['pages'])}; aliases must not be deduplicated")
    ids = {key: entity_ids(registry[key], key) for key in COLLECTIONS}
    indexes = {key: dict(zip(ids[key], registry[key])) for key in COLLECTIONS}
    errors = []
    for collection in ("pages", "frontendContracts"):
        for row in registry[collection]:
            for field, target in REFERENCE_FIELDS.items():
                for reference in row.get(field, []):
                    if reference not in indexes[target]:
                        errors.append(f"{collection}/{row['id']}/{field}: missing {reference}")
    work = []
    check_ids = []
    for collection in ("pages", "interactions", "backendRoutes"):
        for row in registry[collection]:
            for check in row.get("requiredChecks", []):
                if check["template"] not in registry.get("checkTemplates", {}):
                    errors.append(f"Missing check template: {check['template']}")
                check_ids.append(check["id"])
                work.append({"id": check["id"], "entityCollection": collection, "entityId": row["id"],
                             "kind": "registered-required-check", "status": check.get("status", "UNVERIFIED"),
                             "template": check["template"]})
    if len(check_ids) != len(set(check_ids)):
        errors.append("Duplicate required-check identities")
    supplemental = {}
    supplement_info = []
    file_hashes = {row["path"]: row["sha256"] for row in files}
    supplement_freshness = []
    for supplement in page_work:
        supplement_info.append({k: copy.deepcopy(v) for k, v in supplement.items() if k != "pages"})
        recorded_digest = supplement.get("sourceRegisterSha256", supplement.get("sourceRegisterDigest"))
        supplement_freshness.append({"recordedRegisterDigest": recorded_digest, "currentRegisterFileSha256": registry_file_sha256,
                                     "registerFileMatches": recorded_digest == registry_file_sha256 if registry_file_sha256 else None,
                                     "meaning": "A changed register digest is planning-provenance drift, not execution passage. Per-page inspected-source hashes below identify actual source analysis requiring refresh."})
        for page in supplement.get("pages", []):
            identity = page["id"]
            if identity not in indexes["pages"]:
                errors.append(f"Supplement references missing page: {identity}")
                continue
            if identity in supplemental:
                errors.append(f"Duplicate supplement page: {identity}")
            if page.get("path") != indexes["pages"][identity].get("path"):
                errors.append(f"Supplement route mismatch: {identity}")
            for section in page.get("businessSections", []):
                for field, target in {"interactionIds": "interactions", "frontendContractIds": "frontendContracts", "backendRouteIds": "backendRoutes"}.items():
                    for reference in section.get(field, []):
                        if reference not in indexes[target]:
                            errors.append(f"Supplement {identity}/{field}: missing {reference}")
            supplemental[identity] = copy.deepcopy(page)
            coverage_source = page.get("coverageOfSource", {})
            inspected = (coverage_source.get("inspectedJsxSourceFiles") or coverage_source.get("inspectedSourceFiles")
                         or coverage_source.get("inspectedFiles") or [])
            stale = [row["file"] for row in inspected if row.get("file") in file_hashes and row.get("sha256") != file_hashes[row["file"]]]
            missing = [row["file"] for row in inspected if row.get("file") not in file_hashes]
            supplemental[identity]["analysisSourceFreshness"] = {"status": "STALE" if stale else "UNVERIFIED" if missing or not inspected else "SOURCE_HASHES_MATCH",
                                                               "checkedFiles": len(inspected), "staleSourceFiles": stale, "unavailableSourceFiles": missing,
                                                               "meaning": "Source-analysis freshness only; not behavioral execution evidence."}
            if require_page_work and stale:
                errors.append(f"Stale business analysis source for {identity}: {stale}")
            if require_page_work and not page.get("businessSections"):
                errors.append(f"Missing actual business sections for {identity}")
            for section_index, section in enumerate(page.get("businessSections", [])):
                section_id = section.get("id", stable_id("section", section))
                work_fields = [key for key in section if key.endswith("Work") or key in {"validationPermissionsSecurity", "durableProviderGenerationJourneys", "failureAccessibilityMobileI18nPerformance", "evidenceNeeded"}]
                work.append({"id": identity + "/" + section_id, "entityCollection": "pages", "entityId": identity,
                             "kind": "page-business-section", "sectionId": section_id, "status": "UNVERIFIED",
                             "requiredWorkFields": work_fields,
                             "workSteps": [{"id": identity + "/" + section_id + "/" + field, "field": field, "status": "UNVERIFIED",
                                            "exactInstructionsPointer": f"/businessPageWork/{identity}/businessSections/{section_index}/{field}"} for field in work_fields],
                             "acceptance": "Complete every work field in this exact businessPageWork section and all referenced controls/API/backend checks; link current behavioral, durable, failure and applicable deployed/provider evidence. Source section enumeration is not implementation completion."})
    missing_supplements = sorted(set(ids["pages"]) - set(supplemental))
    if require_page_work and missing_supplements:
        errors.append("Missing business-section page supplements: " + ", ".join(missing_supplements))
    for row in registry["frontendContracts"]:
        work.append({"id": row["id"] + "/consumer-contract", "entityCollection": "frontendContracts", "entityId": row["id"],
                     "kind": "frontend-consumer-journey", "status": row.get("behavioralAcceptance", "UNVERIFIED"),
                     "acceptance": "Resolve this exact caller/method/path to its deployed process and handler; execute the real consuming UI flow, exact response/error contract, authorization and durable side effect. Unmatched/dynamic topology requires trace evidence before closure."})
    for identity, row in indexes["sourceCoverage"].items():
        for metric in ("statements", "functions", "branches", "lines"):
            work.append({"id": identity + "/" + metric, "entityCollection": "sourceCoverage", "entityId": identity,
                         "kind": "measured-coverage", "metric": metric, "targetPercent": 100, "status": "UNVERIFIED",
                         "observed": copy.deepcopy(row.get(metric)),
                         "acceptance": "Execute meaningful successful/adverse behavior for every missing counter in this exact source revision; retain valid source maps and real counters. No import-only tests, exclusions or fabricated hits. A complete counter is not business acceptance."})
    for identity in ids["unknownMappings"]:
        work.append({"id": identity + "/resolve", "entityCollection": "unknownMappings", "entityId": identity,
                     "kind": "mapping-resolution", "status": "UNVERIFIED", "acceptance": "Trace the dynamic/unresolved registration or consumer to its actual process, mount, method and path, or document unreachable/decommissioned code with caller evidence; verify the resulting live contract."})
    for row in files:
        work.append({"id": row["id"] + "/contract", "entityCollection": "repositoryFiles", "entityId": row["id"],
                     "kind": "source-config-asset-contract", "status": "UNVERIFIED", "acceptance": row["acceptance"]})
    lanes = []
    for identity, title, pattern, acceptance in SHARED_WORK:
        lane = {"id": "shared-" + identity, "title": title, "status": "UNVERIFIED", "sourcePaths": [f["path"] for f in files if re.search(pattern, f["path"], re.I)],
                "requiredWork": [{"id": "shared-" + identity + "/" + str(i + 1), "status": "UNVERIFIED", "acceptance": text} for i, text in enumerate(acceptance)],
                "closure": "Require current source-linked execution, deployment/provider/device evidence where applicable, and exact failure/recovery assertions. Missing prerequisites remain BLOCKED or UNVERIFIED, never PASS."}
        lanes.append(lane)
        work.extend({**task, "entityCollection": "sharedSubsystems", "entityId": lane["id"], "kind": "shared-subsystem-contract"} for task in lane["requiredWork"])
    if errors:
        raise ValueError("Invalid completion-plan references:\n" + "\n".join(errors))
    used = {target: set() for target in REFERENCE_FIELDS.values()}
    for page in registry["pages"]:
        for field, target in REFERENCE_FIELDS.items():
            used[target].update(page.get(field, []))
    preservation = {}
    for collection in COLLECTIONS:
        actual = entity_ids(copy.deepcopy(registry[collection]), collection)
        preservation[collection] = {"expected": len(ids[collection]), "planned": len(actual), "missingIds": sorted(set(ids[collection]) - set(actual)), "extraIds": sorted(set(actual) - set(ids[collection])), "setEquality": set(ids[collection]) == set(actual)}
    work_ids = [row["id"] for row in work]
    if len(work_ids) != len(set(work_ids)):
        raise ValueError("Duplicate generated work item identity")
    registry_copy = copy.deepcopy(registry)
    plan = {"schemaVersion": 1, "scope": "Entire platform: every declared page/alias, control, frontend contract, backend registration/process, coverage file, unresolved mapping, canonical source/config/asset file and shared web/mobile/desktop/native/operations lane.",
            "registryDigest": digest(registry), "sourceRevision": registry.get("sourceRevision"),
            "planningCompleteness": {"status": "PASS", "meaning": "Every supplied registry identity and required check is retained; this is inventory validation, not execution or launch readiness.", "entitySetEquality": preservation,
                                     "requiredCheckCount": len(check_ids), "requiredCheckIds": sorted(check_ids), "missingReferences": [], "missingBusinessSectionPageIds": missing_supplements},
            "productionReady": False, "executionStatus": "UNVERIFIED", "registry": registry_copy,
            "entityIds": ids, "businessPageWork": supplemental, "businessSupplementProvenance": supplement_info,
            "businessSupplementFreshness": supplement_freshness,
            "globalUnroutedEntityIds": {key: sorted(set(ids[key]) - used[key]) for key in used},
            "repositoryFiles": list(files), "repositoryFilePolicy": {"discovery": "git ls-files -co --exclude-standard; stable exact paths and SHA256; symlinks bind target text", "excludedRoots": sorted(EXCLUDED_FILE_ROOTS), "additionalExclusions": ["node_modules/", "__pycache__/", "target/", "generated dist except canonical dist/pdim-restore.mjs"], "meaning": "Registry source coverage is separately retained in full; this inventory adds other languages, scripts, configuration, tests, translations and binary assets. Excluded generated reports/docs are evidence outputs rather than implementation source."},
            "sharedSubsystems": lanes, "workItems": work,
            "summary": {"pageDeclarations": len(ids["pages"]), "controls": len(ids["interactions"]), "backendRegistrations": len(ids["backendRoutes"]), "frontendContracts": len(ids["frontendContracts"]), "sourceCoverageFiles": len(ids["sourceCoverage"]), "unknownMappings": len(ids["unknownMappings"]), "repositoryFiles": len(files), "sharedSubsystems": len(lanes), "workItems": len(work), "businessSectionPages": len(supplemental), "businessSectionTasks": sum(1 for row in work if row["kind"] == "page-business-section"), "businessDimensionSteps": sum(len(row.get("workSteps", [])) for row in work)}}
    plan["planningCompleteness"]["entitySetEquality"] = validate_plan(registry, plan)
    return plan


def cell(value):
    if not isinstance(value, str):
        value = canonical(value)
    return value.replace("|", "&#124;").replace("\n", "<br>").replace("\r", "")


def table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"] + ["| " + " | ".join(cell(c) for c in row) + " |" for row in rows]) + "\n"


def location(row):
    source = row.get("source", {})
    return str(source.get("file", row.get("file", ""))) + (":" + str(source["line"]) if source.get("line") else "")


def checks(row):
    return "; ".join(check["id"] + "=" + check.get("status", "UNVERIFIED") for check in row.get("requiredChecks", []))


def render_docs(plan):
    registry = plan["registry"]
    indexes = {key: dict(zip(plan["entityIds"][key], registry[key])) for key in COLLECTIONS}
    docs = {}
    index_rows = []
    for number, page in enumerate(registry["pages"], 1):
        name = f"{number:02d}-{page['id']}.md"
        index_rows.append([number, page["id"], page["path"], page.get("component", ""), page.get("status", "UNVERIFIED"), len(page.get("uiInteractionIds", [])), len(page.get("frontendContractIds", [])), len(page.get("backendRouteIds", [])), f"[All work](platform-pages/{name})"])
        lines = [f"# {number:02d}. {page['path']} — {page.get('component', '')}", "", "Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.", "",
                 f"Declaration `{page['id']}`; source `{location(page)}`; registration `{cell(page.get('registration', {}))}`; status **{page.get('status', 'UNVERIFIED')}**.", "", "## Page acceptance", "", table(["Check", "Status", "Exact acceptance"], [[c["id"], c.get("status", "UNVERIFIED"), registry["checkTemplates"][c["template"]]] for c in page.get("requiredChecks", [])]),
                 "Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.", "", "## All business sections", ""]
        supplemental = plan["businessPageWork"].get(page["id"])
        if supplemental:
            lines.append(table(["Page work/provenance field", "Required detail"], [[key, value] for key, value in supplemental.items() if key not in {"businessSections", "knownApiContracts", "allRegisteredInteractionIds", "allRegisteredFrontendContractIds", "allRegisteredBackendRouteIds"}]))
            for section in supplemental.get("businessSections", []):
                lines.extend(["### " + str(section.get("name", "Unnamed source section")), ""])
                lines.append(table(["Work field", "Required detail"], [[key, value] for key, value in section.items() if key != "name"]))
        else:
            lines.append("**UNVERIFIED:** source-derived business-section analysis is missing. Inventory tables below still retain every declaration; do not treat their presence as implementation completion.\n")
        lines.extend(["## Every control", "", table(["ID", "Source", "Tag/labels", "Handlers", "Status", "Required checks"], [[row["id"], location(row), {"tag": row.get("tag"), "labels": row.get("labels")}, row.get("eventBindings", []), row.get("status", "UNVERIFIED"), checks(row)] for row in (indexes["interactions"][i] for i in page.get("uiInteractionIds", []))]),
                      "For every control execute its control-behavior and control-failure acceptance from the global required-check ledger; cover keyboard/mobile, input validation, loading/error/retry, authorization and the real side effect.", "", "## Every frontend API contract", "", table(["ID", "Method/path", "Source", "Topology", "Backend IDs", "Behavior acceptance"], [[r["id"], r.get("method", "") + " " + r.get("path", ""), location(r), r.get("topologyStatus", "unknown"), r.get("backendRouteIds", []), r.get("behavioralAcceptance", "UNVERIFIED")] for r in (indexes["frontendContracts"][i] for i in page.get("frontendContractIds", []))]),
                      "Trace each request to its actual process/mount, assert exact response/error/permission behavior and prove persistence after reload or another worker.", "", "## Every mapped backend registration", "", table(["ID", "Method/path", "Source", "Process/mount", "Status", "Required checks"], [[r["id"], r.get("method", "") + " " + r.get("path", ""), location(r), {"scope": r.get("processScope"), "resolved": r.get("mountResolved")}, r.get("status", "UNVERIFIED"), checks(r)] for r in (indexes["backendRoutes"][i] for i in page.get("backendRouteIds", []))]),
                      "Exercise successful/adverse HTTP contracts, cross-owner denial, input boundaries, dependency failure, durable mutation/deletion and callback/artifact/readiness checks exactly as assigned. Standalone or unresolved processes need their own harness.", "", "## Exact source reachability and test instructions", "", "```json", encoded({"reachableSourceFiles": page.get("reachableSourceFiles", []), "addTest": page.get("addTest"), "testCandidates": page.get("testCandidates", [])}).rstrip(), "```", "", "The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).", ""])
        docs["platform-pages/" + name] = "\n".join(lines)
    common = ["# Entire-platform completion work ledger", "", "Generated from the complete source register and page business-section analyses. **100% is the required target, not a measured result.** Planning inventory validation is separate from implemented/tested/deployed readiness. No page, alias, unmapped registration or shared subsystem is silently dropped.", "", "## Execution order", "", "1. Fix demonstrated reachable defects and preserve failure receipts; partition independent owned changes by source file.", "2. Execute every named page section, control and API contract; implement missing behavior and add successful/adverse assertions with exact persistence/authorization evidence.", "3. Close shared subsystem and non-JS/native/configuration lanes in parallel where dependencies allow. Keep device/provider/deployment prerequisites explicit.", "4. Freeze all implementation/config/test inputs; run the full master and valid source-mapped coverage for all four 100% metrics, plus separate Python/Go/Rust/native proof.", "5. Reconcile every remaining counter and feature check, actual Replit image/deployment, migration/backup/recovery, provider delivery and measured topology/capacity. Commit and normally push current evidence; main promotion requires the actual release gates.", "", "## Every page declaration and alias", "", table(["#", "ID", "Route", "Component", "Status", "Controls", "API calls", "Backend registrations", "Work"], index_rows), "", "## Complete global ledgers", ""]
    for key, title in [("interactions", "All controls, including unrouted controls"), ("backendRoutes", "All backend registrations, including standalone/unresolved mounts"), ("frontendContracts", "All frontend contracts, including unmatched/dynamic calls"), ("sourceCoverage", "Every measured source file and exact missing counters"), ("unknownMappings", "Every unresolved mapping"), ("repositoryFiles", "All canonical language/configuration/asset files"), ("sharedSubsystems", "All shared and cross-platform work lanes"), ("required-checks", "Every original required check and exact acceptance")]:
        common.append(f"- [{title}](platform-pages/_{key}.md)")
    common.extend(["", "## Inventory validation and counts", "", "```json", encoded({"summary": plan["summary"], "planningCompleteness": {k: v for k, v in plan["planningCompleteness"].items() if k != "requiredCheckIds"}, "productionReady": False}).rstrip(), "```", "", "The JSON completion-plan retains every original register detail, check template, fixture command, candidate association, evidence limitation and status. It never upgrades source reachability, a rendered shell or a passing count to business acceptance. Business supplements require refresh after relevant source changes. All execution and external gates retain their actual evidence status.", ""])
    docs["platform-completion-plan.md"] = "\n".join(common)
    for key in COLLECTIONS[1:]:
        rows = registry[key]
        docs[f"platform-pages/_{key}.md"] = f"# Complete {key} ledger\n\nEvery original entry and detail is preserved below, including unmounted/unrouted or unresolved declarations. Original statuses are not promoted by this plan.\n\n" + "\n\n".join(f"## {identity}\n\n```json\n{encoded(row).rstrip()}\n```" for identity, row in zip(plan["entityIds"][key], rows)) + "\n"
    docs["platform-pages/_repositoryFiles.md"] = "# Canonical source, configuration and asset work\n\nEvery listed file requires its own contract review and appropriate execution/format checks. This is not JS coverage.\n\n" + table(["ID", "Path", "Category", "SHA256", "Status", "Acceptance"], [[r[k] for k in ("id", "path", "category", "sha256", "status", "acceptance")] for r in plan["repositoryFiles"]])
    docs["platform-pages/_sharedSubsystems.md"] = "# Shared and cross-platform work\n\nExternal prerequisites remain unverified until actual execution evidence exists.\n\n" + "\n\n".join("## " + lane["title"] + "\n\n```json\n" + encoded(lane).rstrip() + "\n```" for lane in plan["sharedSubsystems"]) + "\n"
    rows = []
    for key in ("pages", "interactions", "backendRoutes"):
        for row in registry[key]:
            for check in row.get("requiredChecks", []):
                rows.append([check["id"], row["id"], check.get("status", "UNVERIFIED"), registry["checkTemplates"][check["template"]], {k: v for k, v in check.items() if k not in {"id", "status", "template"}}])
    docs["platform-pages/_required-checks.md"] = "# Every required registered check\n\nExecute each exact check and retain its full evidence linkage. Nothing here is passed merely because it is listed.\n\n" + table(["Check ID", "Entity ID", "Status", "Exact acceptance", "Evidence/details"], rows)
    return docs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "reports/test-verification/platform-register.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/test-verification/completion-plan.json")
    parser.add_argument("--docs-root", type=Path, default=ROOT / "docs/testing")
    parser.add_argument("--page-work", type=Path, action="append")
    parser.add_argument("--expected-pages", type=int, default=80)
    parser.add_argument("--require-page-work", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        registry_bytes = args.input.read_bytes()
        registry = json.loads(registry_bytes)
        supplemental_paths = args.page_work if args.page_work is not None else [p for p in (args.docs_root / "platform-page-work-01-40.json", args.docs_root / "platform-page-work-41-80.json") if p.exists()]
        supplements = [json.loads(p.read_text()) for p in supplemental_paths]
        plan = build_plan(registry, supplements, repository_files(ROOT), args.expected_pages, args.require_page_work,
                          hashlib.sha256(registry_bytes).hexdigest())
        machine_text = encoded(plan)
        if len(machine_text.encode()) >= 95 * 1024 ** 2:
            # Preserve every value while remaining below GitHub's per-file cap.
            machine_text = canonical(plan) + "\n"
        outputs = {args.output: machine_text, **{args.docs_root / path: value for path, value in render_docs(plan).items()}}
        mismatches = []
        for path, text in outputs.items():
            if args.check:
                if not path.exists() or path.read_text() != text:
                    mismatches.append(str(path))
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text)
        if args.check:
            page_root = args.docs_root / "platform-pages"
            if page_root.exists():
                mismatches.extend(str(p) for p in page_root.glob("*.md") if p not in outputs)
        if mismatches:
            print("Completion plan is stale: " + ", ".join(mismatches), file=sys.stderr)
            return 1
        print(json.dumps({"status": "inventory_complete", "productionReady": False, **plan["summary"]}))
        return 0
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Completion plan rejected: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
