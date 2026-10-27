"""Exhaustive ledger preserves aliases, unresolved work and exact evidence states."""
import copy
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("platform_plan", ROOT / "scripts/testing/generate-platform-plan.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture():
    return {
        "sourceRevision": "fixture", "checkTemplates": {"page-states": "Exercise real page states", "control-behavior": "Operate exact control", "response-contract": "Assert actual response"},
        "pages": [{"id": "page-a", "path": "/one", "component": "SameComponent", "uiInteractionIds": ["ui-a"], "frontendContractIds": ["call-a"], "backendRouteIds": ["api-a"], "requiredChecks": [{"id": "page-a/page-states", "template": "page-states", "status": "UNVERIFIED"}]},
                  {"id": "page-alias", "path": "/alias", "component": "SameComponent", "uiInteractionIds": ["ui-a"], "frontendContractIds": [], "backendRouteIds": [], "requiredChecks": []}],
        "interactions": [{"id": "ui-a", "tag": "button", "labels": {"aria-label": "Save"}, "requiredChecks": [{"id": "ui-a/control-behavior", "template": "control-behavior", "status": "UNVERIFIED", "evidence": {"reason": "not executed"}}]},
                         {"id": "ui-unrouted", "tag": "input", "requiredChecks": []}],
        "backendRoutes": [{"id": "api-a", "method": "POST", "path": "/api/save", "processScope": "main", "requiredChecks": [{"id": "api-a/response-contract", "template": "response-contract", "status": "UNVERIFIED"}]},
                          {"id": "api-standalone", "method": "GET", "path": "/health", "processScope": "standalone:worker", "mountResolved": False, "requiredChecks": []}],
        "frontendContracts": [{"id": "call-a", "method": "POST", "path": "/api/save", "backendRouteIds": ["api-a"], "behavioralAcceptance": "UNVERIFIED"},
                              {"id": "call-unknown", "method": "UNKNOWN", "path": "dynamic", "backendRouteIds": [], "topologyStatus": "unmatched", "behavioralAcceptance": "UNVERIFIED"}],
        "sourceCoverage": [{"file": "server/save.ts", "statements": {"total": 10, "covered": 1}, "uncoveredStatementLines": [2, 3], "uncoveredFunctions": [{"line": 2, "name": "save"}]}],
        "unknownMappings": [{"kind": "dynamic", "file": "worker.ts", "line": 8}, {"kind": "dynamic", "file": "worker.ts", "line": 8}],
        "limits": ["Static scan is not execution proof"], "evidenceLinking": {"approvalOrSignatureRequired": False}}


def test_preserves_all_details_aliases_unrouted_entities_and_original_statuses():
    registry = fixture()
    plan = MODULE.build_plan(registry, expected_pages=2)
    assert plan["registry"] == registry
    assert plan["summary"]["pageDeclarations"] == 2
    assert plan["globalUnroutedEntityIds"]["interactions"] == ["ui-unrouted"]
    assert plan["globalUnroutedEntityIds"]["backendRoutes"] == ["api-standalone"]
    assert plan["globalUnroutedEntityIds"]["frontendContracts"] == ["call-unknown"]
    assert len(set(plan["entityIds"]["unknownMappings"])) == 2
    assert all(row["setEquality"] for row in plan["planningCompleteness"]["entitySetEquality"].values())
    assert plan["planningCompleteness"]["requiredCheckCount"] == 3
    assert len([w for w in plan["workItems"] if w["kind"] == "measured-coverage"]) == 4
    assert plan["productionReady"] is False
    assert all(w["status"] == "UNVERIFIED" for w in plan["workItems"])
    assert MODULE.build_plan(registry, expected_pages=2) == plan


def test_missing_reference_or_template_and_page_deduplication_fail_closed():
    registry = fixture()
    registry["pages"][0]["uiInteractionIds"].append("ui-missing")
    with pytest.raises(ValueError, match="missing ui-missing"):
        MODULE.build_plan(registry, expected_pages=2)
    registry = fixture()
    del registry["checkTemplates"]["response-contract"]
    with pytest.raises(ValueError, match="Missing check template"):
        MODULE.build_plan(registry, expected_pages=2)
    with pytest.raises(ValueError, match="aliases must not be deduplicated"):
        MODULE.build_plan(fixture(), expected_pages=1)


def test_emitted_work_validator_detects_lost_details_and_missing_tasks():
    registry = fixture()
    plan = MODULE.build_plan(registry, expected_pages=2)
    damaged = copy.deepcopy(plan)
    damaged["registry"]["interactions"].pop()
    with pytest.raises(ValueError, match="Lost or altered interactions"):
        MODULE.validate_plan(registry, damaged)
    damaged = copy.deepcopy(plan)
    damaged["registry"]["interactions"][0]["requiredChecks"][0]["evidence"] = {"status": "PASS"}
    with pytest.raises(ValueError, match="Lost or altered interactions"):
        MODULE.validate_plan(registry, damaged)
    damaged = copy.deepcopy(plan)
    damaged["workItems"] = [w for w in damaged["workItems"] if w["id"] != "ui-a/control-behavior"]
    with pytest.raises(ValueError, match="Required-check work item set"):
        MODULE.validate_plan(registry, damaged)
    damaged = copy.deepcopy(plan)
    damaged["workItems"] = [w for w in damaged["workItems"] if w["kind"] != "measured-coverage"]
    with pytest.raises(ValueError, match="exhaustive entity/section/coverage/file/lane work"):
        MODULE.validate_plan(registry, damaged)


def test_business_sections_bind_exact_pages_and_reject_invented_references():
    registry = fixture()
    supplemental = {"schemaVersion": 1, "pages": [{"id": "page-a", "path": "/one", "businessSections": [{"name": "Editor", "interactionIds": ["ui-a"], "frontendWork": "Operate Save and reload persisted value"}]}]}
    with pytest.raises(ValueError, match="Missing business-section page supplements"):
        MODULE.build_plan(registry, [supplemental], expected_pages=2, require_page_work=True)
    plan = MODULE.build_plan(registry, [supplemental], expected_pages=2)
    assert plan["businessPageWork"]["page-a"]["businessSections"][0]["frontendWork"].startswith("Operate Save")
    supplemental["pages"][0]["businessSections"][0]["interactionIds"] = ["ui-invented"]
    with pytest.raises(ValueError, match="missing ui-invented"):
        MODULE.build_plan(registry, [supplemental], expected_pages=2)


def test_human_output_contains_all_aliases_controls_contracts_and_global_unknowns():
    plan = MODULE.build_plan(fixture(), expected_pages=2)
    docs = MODULE.render_docs(plan)
    index = docs["platform-completion-plan.md"]
    assert "/one" in index and "/alias" in index
    page = docs["platform-pages/01-page-a.md"]
    for identity in ["ui-a", "call-a", "api-a", "page-a/page-states"]:
        assert identity in page
    assert "ui-unrouted" in docs["platform-pages/_interactions.md"]
    assert "standalone:worker" in docs["platform-pages/_backendRoutes.md"]
    assert "call-unknown" in docs["platform-pages/_frontendContracts.md"]
    assert '"line": 8' in docs["platform-pages/_unknownMappings.md"]
    assert "Static scan is not execution proof" in plan["registry"]["limits"]


def test_all_page_sections_and_exact_work_dimensions_become_distinct_actions():
    registry = fixture()
    supplemental = {"pages": [{"id": p["id"], "path": p["path"], "businessSections": [{"id": "same-source-section", "name": "Save form", "frontendWork": ["Submit valid and invalid forms"], "backendWork": ["Read back stored state"], "evidenceNeeded": ["Exact passing case and current source hash"]}]} for p in registry["pages"]]}
    plan = MODULE.build_plan(registry, [supplemental], expected_pages=2, require_page_work=True)
    actions = [w for w in plan["workItems"] if w["kind"] == "page-business-section"]
    assert len(actions) == 2
    assert len({w["id"] for w in actions}) == 2
    assert plan["summary"]["businessDimensionSteps"] == 6
    assert {s["field"] for s in actions[0]["workSteps"]} == {"frontendWork", "backendWork", "evidenceNeeded"}
    for action in actions:
        for step in action["workSteps"]:
            target = plan
            for part in step["exactInstructionsPointer"].strip("/").split("/"):
                target = target[int(part)] if isinstance(target, list) else target[part]
            assert target
    actions[0]["workSteps"].pop()
    with pytest.raises(ValueError, match="Missing exact business-section work dimensions"):
        MODULE.validate_plan(registry, plan)


def test_both_supplement_source_inventory_schemas_detect_stale_analysis():
    registry = fixture()
    files = [{"id": "file-1", "path": "one.tsx", "sha256": "current", "acceptance": "Execute actual UI", "category": "typescript-ui"}]
    for field in ("inspectedJsxSourceFiles", "inspectedSourceFiles", "inspectedFiles"):
        supplemental = {"pages": [{"id": p["id"], "path": p["path"], "businessSections": [{"name": "Form", "frontendWork": "Submit"}],
                                  "coverageOfSource": {field: [{"file": "one.tsx", "sha256": "old"}]}} for p in registry["pages"]]}
        with pytest.raises(ValueError, match="Stale business analysis source"):
            MODULE.build_plan(registry, [supplemental], files, expected_pages=2, require_page_work=True)
        for page in supplemental["pages"]:
            page["coverageOfSource"][field][0]["sha256"] = "current"
        plan = MODULE.build_plan(registry, [supplemental], files, expected_pages=2, require_page_work=True)
        assert all(p["analysisSourceFreshness"]["status"] == "SOURCE_HASHES_MATCH" for p in plan["businessPageWork"].values())
