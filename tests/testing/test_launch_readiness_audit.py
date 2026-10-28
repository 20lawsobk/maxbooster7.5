"""Fail-closed launch decisions and exact inventory/provenance regressions."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("launch_audit", ROOT / "scripts/testing/launch-readiness-audit.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def fixture():
    register = {name: [] for name in ("pages", "interactions", "backendRoutes", "frontendContracts", "sourceCoverage", "unknownMappings")}
    register.update(sourceRevision="fixture-only", platformSourceDigest="fixture-digest", sourceInputsSha256={}, checkTemplates={"page-states": "Actual page states"})
    sections = []
    for index in range(80):
        identity = f"page-{index}"
        # All share the component intentionally: aliases remain declarations.
        register["pages"].append({"id": identity, "component": "AliasComponent", "path": f"/alias-{index}",
            "requiredChecks": [{"id": identity + "/page-states", "template": "page-states", "status": "PASS", "evidence": {"testFile": "tests/fixture.py", "testSha256": "fixture"}}]})
        section = {"id": f"section-{index}", "name": "Exact source section", "sourceFiles": [{"file": "client/page.tsx", "line": 1}],
                   **{key: ["Perform actual assertions"] for key in ("frontendWork", "backendWork", "validationPermissionsSecurity", "durableProviderGenerationJourneys", "failureAccessibilityMobileI18nPerformance", "evidenceNeeded")}}
        sections.append({"id": identity, "path": f"/alias-{index}", "businessSections": [section]})
    plan = AUDIT.load_plan_module().build_plan(register, [{"pages": sections}], expected_pages=80, require_page_work=True)
    return register, plan


@pytest.mark.parametrize("missing_domain", list(AUDIT.CRITERIA))
def test_missing_quality_domain_is_rejected(missing_domain):
    gates = {domain: "PASS" for domain in AUDIT.CRITERIA if domain != missing_domain}
    with pytest.raises(ValueError, match="Every required launch domain"):
        AUDIT.launch_decision(gates, source_current=True, checks_passed=True)


@pytest.mark.parametrize("state", ["UNVERIFIED", "SKIP", "BLOCKED", "FAIL", "STALE", None])
def test_any_nonpassing_domain_prevents_green(state):
    gates = {domain: "PASS" for domain in AUDIT.CRITERIA}
    gates["accessibility"] = state
    assert AUDIT.launch_decision(gates, source_current=True, checks_passed=True) != "GREEN"


@pytest.mark.parametrize("change", ["stale", "missing-check", "unknown-binding", "global-blocker"])
def test_full_page_domain_score_cannot_override_production_blocker(change):
    args = dict(source_current=True, checks_passed=True, unresolved=0, global_blockers=0)
    args.update({"stale": {"source_current": False}, "missing-check": {"checks_passed": False},
                 "unknown-binding": {"unresolved": 1}, "global-blocker": {"global_blockers": 1}}[change])
    assert AUDIT.launch_decision({domain: "PASS" for domain in AUDIT.CRITERIA}, **args) != "GREEN"


def test_only_complete_conjunction_can_green():
    assert AUDIT.launch_decision({domain: "PASS" for domain in AUDIT.CRITERIA}, source_current=True, checks_passed=True) == "GREEN"


def test_all_80_alias_declarations_and_every_section_dimension_retained():
    register, plan = fixture()
    report = AUDIT.make_report(register, plan, {"status": "PASS"})
    assert report["summary"]["pages"] == 80
    assert len({page["route"] for page in report["pages"]}) == 80
    assert report["summary"]["businessSections"] == 80
    assert report["summary"]["businessDimensionSteps"] == 480
    assert len(report["roadmap"]) == 80
    assert all(len(row["level5ImplementationTasks"]) == 6 for row in report["roadmap"])
    original_steps = {step["id"] for item in plan["workItems"] for step in item.get("workSteps", [])}
    emitted_steps = {step["id"] for item in report["roadmap"] for step in item["level5ImplementationTasks"]}
    assert original_steps == emitted_steps
    assert report["summary"]["greenPages"] == 0
    assert all(page["implementationCompletionPercent"] is None for page in report["pages"])
    assert all(page["requiredSectionDimensionSteps"] == 6 for page in report["pages"])


@pytest.mark.parametrize("change", ["missing-page", "duplicate-page", "missing-check", "missing-shared-work", "altered-registry", "bad-digest", "missing-section-dimension"])
def test_inventory_loss_or_corruption_is_rejected(change):
    register, plan = fixture()
    if change == "missing-page": register["pages"].pop()
    elif change == "duplicate-page": register["pages"][-1] = copy.deepcopy(register["pages"][0])
    elif change == "missing-check": plan["workItems"] = [row for row in plan["workItems"] if row["id"] != "page-0/page-states"]
    elif change == "missing-shared-work": plan["workItems"] = [row for row in plan["workItems"] if row["id"] != "shared-auth/1"]
    elif change == "altered-registry": plan["registry"]["pages"][0]["path"] = "/wrong"
    elif change == "bad-digest": plan["registryDigest"] = "forged"
    else: next(row for row in plan["workItems"] if row["kind"] == "page-business-section")["workSteps"].pop()
    with pytest.raises(ValueError): AUDIT.validate_inventory(register, plan)


def test_empty_evidence_never_green_even_when_all_source_checks_pass():
    register, plan = fixture()
    report = AUDIT.make_report(register, plan, {"status": "PASS"})
    page = report["pages"][0]
    assert page["verifiedAcceptanceCoveragePercent"] == 100
    assert page["implementationCompletionPercent"] is None
    assert page["launchReadinessScore"] == 0
    assert page["verifiedSectionDimensionSteps"] == 0
    assert not report["productionReady"]
    assert page["productionReadinessStatus"] == "RED"


def test_full_page_criteria_and_global_gap_proofs_do_not_close_missing_exact_section_work():
    register, plan = fixture()
    proofs = {f"{page['id']}/{domain}/{criterion}": [{"caseName": "fixture-only"}]
              for page in register["pages"] for domain, criteria in AUDIT.CRITERIA.items() for criterion in criteria}
    proofs.update({f"platform/{gap[0]}": [{"caseName": "fixture-only"}] for gap in AUDIT.GLOBAL_GAPS})
    report = AUDIT.make_report(register, plan, {"status": "PASS"}, proofs)
    assert all(page["launchReadinessScore"] == 100 for page in report["pages"])
    assert report["pendingGlobalWorkItemIds"]
    assert report["summary"]["greenPages"] == 0
    assert all(page["pendingExactPageWorkItemIds"] for page in report["pages"])


def all_proofs(register, plan):
    proof = [{"caseName": "synthetic proof only for gate regression, not production evidence"}]
    result = {f"{page['id']}/{domain}/{criterion}": proof for page in register["pages"]
              for domain, criteria in AUDIT.CRITERIA.items() for criterion in criteria}
    result.update({f"platform/{gap[0]}": proof for gap in AUDIT.GLOBAL_GAPS})
    result.update({item["id"]: proof for item in plan["workItems"]})
    result.update({step["id"]: proof for item in plan["workItems"] for step in item.get("workSteps", [])})
    return result


def test_full_producer_can_green_only_with_every_retained_requirement_and_dimension():
    register, plan = fixture()
    proofs = all_proofs(register, plan)
    report = AUDIT.make_report(register, plan, {"status": "PASS"}, proofs)
    assert report["productionReady"]
    assert report["summary"]["greenPages"] == 80
    assert not report["pendingGlobalWorkItemIds"]
    assert all(feature["sectionAcceptanceStatus"] == "PASS" and feature["verifiedDimensionSteps"] == 6 for feature in report["features"])
    proofs.pop("page-0/section-0/frontendWork")
    changed = AUDIT.make_report(register, plan, {"status": "PASS"}, proofs)
    assert not changed["productionReady"]
    assert changed["pages"][0]["productionReadinessStatus"] != "GREEN"
    assert changed["features"][0]["sectionAcceptanceStatus"] == "UNVERIFIED"


def test_unrouted_backend_and_consumer_work_cannot_disappear_from_green_conjunction():
    register, plan = fixture()
    register["backendRoutes"].append({"id": "api-unrouted", "requiredChecks": [{"id": "api-unrouted/page-states", "template": "page-states", "status": "UNVERIFIED"}]})
    register["frontendContracts"].append({"id": "call-unrouted", "behavioralAcceptance": "UNVERIFIED"})
    supplements = [{"pages": list(plan["businessPageWork"].values())}]
    plan = AUDIT.load_plan_module().build_plan(register, supplements, expected_pages=80, require_page_work=True)
    proofs = all_proofs(register, plan)
    proofs.pop("call-unrouted/consumer-contract")
    report = AUDIT.make_report(register, plan, {"status": "PASS"}, proofs)
    assert not report["productionReady"]
    assert "api-unrouted/page-states" in report["pendingGlobalWorkItemIds"]
    assert "call-unrouted/consumer-contract" in report["pendingGlobalWorkItemIds"]
    assert all(page["productionReadinessStatus"] != "GREEN" for page in report["pages"])


def test_stale_evidence_cannot_contribute_to_verified_percentage():
    register, plan = fixture()
    report = AUDIT.make_report(register, plan, {"status": "STALE"})
    assert all(page["verifiedAcceptanceCoveragePercent"] == 0 for page in report["pages"])
    assert all(page["historicalPassingRegisteredChecks"] == 1 for page in report["pages"])
    assert all(page["productionReadinessStatus"] == "RED" for page in report["pages"])


def test_current_source_hash_paths_digest_and_test_provenance_all_required(tmp_path):
    (tmp_path / "server.ts").write_text("export const actual = 1;\n")
    (tmp_path / "README.txt").write_text("Not in platform digest suffix policy\n")
    source = {"server.ts": AUDIT.sha(tmp_path / "server.ts")}
    register = {"sourceInputsSha256": source, "platformSourceDigest": hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()}
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts", "README.txt"])["status"] == "PASS"
    (tmp_path / "new.py").write_text("actual = True\n")
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts", "new.py"])["addedFiles"] == ["new.py"]
    register["platformSourceDigest"] = "forged"
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts"])["status"] == "STALE"
    register["platformSourceDigest"] = hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()
    (tmp_path / "server.ts").write_text("export const actual = 2;\n")
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts"])["changedFiles"] == ["server.ts"]


def test_passing_test_hash_change_invalidates_source_snapshot(tmp_path):
    (tmp_path / "server.ts").write_text("actual\n")
    (tmp_path / "test.py").write_text("assert True\n")
    source = {"server.ts": AUDIT.sha(tmp_path / "server.ts")}
    register = {"sourceInputsSha256": source, "platformSourceDigest": hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest(),
        "pages": [{"requiredChecks": [{"id": "actual/check", "status": "PASS", "evidence": {"testFile": "test.py", "testSha256": AUDIT.sha(tmp_path / "test.py")}}]}]}
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts"])["status"] == "PASS"
    (tmp_path / "test.py").write_text("assert False\n")
    result = AUDIT.source_freshness(register, tmp_path, ["server.ts"])
    assert result["status"] == "STALE"
    assert result["stalePassingCheckIds"] == ["actual/check"]


def test_full_repository_manifest_changes_in_sql_and_tests_invalidate_old_proof(tmp_path):
    (tmp_path / "server.ts").write_text("actual\n")
    source = {"server.ts": AUDIT.sha(tmp_path / "server.ts")}
    register = {"sourceInputsSha256": source, "platformSourceDigest": hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()}
    plan = {"repositoryFiles": [{"path": "migrations/required.sql", "sha256": "original"}, {"path": "tests/acceptance.py", "sha256": "original"}]}
    unchanged = copy.deepcopy(plan["repositoryFiles"])
    assert AUDIT.source_freshness(register, tmp_path, ["server.ts"], plan, unchanged)["status"] == "PASS"
    changed = [{"path": "migrations/required.sql", "sha256": "changed"}, {"path": "tests/new.py", "sha256": "new"}]
    result = AUDIT.source_freshness(register, tmp_path, ["server.ts"], plan, changed)
    assert result["status"] == "STALE"
    assert result["fullRepositorySourceDrift"] == {"changedFiles": ["migrations/required.sql"], "addedFiles": ["tests/new.py"], "removedFiles": ["tests/acceptance.py"]}


def test_regenerated_inventory_does_not_relabel_historical_master_execution(tmp_path):
    source = {"server.ts": "actual-source-hash", "tests/case.py": "actual-test-hash"}
    current = {"files": source, "sha256": hashlib.sha256(json.dumps(source, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
    directory = tmp_path / "orchestration"
    directory.mkdir()
    assert AUDIT.master_evidence_freshness(tmp_path, current)["status"] == "STALE_OR_MISSING"
    (directory / "source-inputs.json").write_text(json.dumps(current))
    result = {"sourceInputsUnchanged": True, "sourceInputsSha256": current["sha256"], "finishedAt": "recorded-fixture-time", "allTestsPassed": None,
              "selectedGroups": ["browser", "checks", "commerce", "coverage", "http", "load", "node", "operations", "pages", "python", "root", "subsystems"]}
    result.update(status="executed_groups_passed", catalog={"exitCode": 0},
        runs=[{"group": group, "exitCode": 0, "status": "passed"} for group in result["selectedGroups"]],
        postprocessing=[{"id": name, "exitCode": 0, "status": "passed"} for name in ("summary", "platform", "remediation", "completion-plan", "final-summary")])
    (directory / "results.json").write_text(json.dumps(result))
    assert AUDIT.master_evidence_freshness(tmp_path, current)["status"] == "PASS"
    assert AUDIT.master_evidence_freshness(tmp_path, current)["allSelectedCommandsPassed"]
    result["runs"][0]["exitCode"] = 1
    (directory / "results.json").write_text(json.dumps(result))
    assert not AUDIT.master_evidence_freshness(tmp_path, current)["allSelectedCommandsPassed"]
    result["runs"][0]["exitCode"] = 0
    changed = copy.deepcopy(current)
    changed["files"]["server.ts"] = "new-code"
    assert AUDIT.master_evidence_freshness(tmp_path, changed)["status"] == "STALE_OR_MISSING"
    result["selectedGroups"].remove("load")
    (directory / "results.json").write_text(json.dumps(result))
    assert AUDIT.master_evidence_freshness(tmp_path, current)["status"] == "STALE_OR_MISSING"


def test_custom_input_manifest_binds_selected_actual_files(tmp_path, monkeypatch):
    register, plan = fixture()
    report = AUDIT.make_report(register, plan, {"status": "PASS"})
    selected = tmp_path / "selected"
    selected.mkdir()
    register_input, plan_input = selected / "register.json", selected / "plan.json"
    register_input.write_text(json.dumps(register))
    plan_input.write_text(json.dumps(plan))
    monkeypatch.setattr(AUDIT, "dependencies", lambda register, root: {"manifests": [], "scope": "test fixture only"})
    output = tmp_path / "out"
    AUDIT.write_outputs(report, register, plan, output, tmp_path, register_input, plan_input)
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["inputs"] == {"selected/register.json": AUDIT.sha(register_input), "selected/plan.json": AUDIT.sha(plan_input)}
    assert not (tmp_path / AUDIT.REGISTER).exists()


@pytest.mark.parametrize("status,category,hash_good,expected", [("passed", "test", True, True), ("skipped", "test", True, False), ("failed", "test", True, False), ("passed", "support", True, False), ("passed", "test", False, False)])
def test_criterion_requires_exact_actual_passing_current_test(status, category, hash_good, expected, tmp_path, monkeypatch):
    test = tmp_path / "tests/case.py"
    test.parent.mkdir()
    test.write_text("assert True\n")
    incoming = tmp_path / "evidence"
    incoming.mkdir()
    (incoming / "test-inventory.json").write_text(json.dumps({"entries": [{"path": "tests/case.py", "category": category}]}))
    (incoming / "case-results.json").write_text(json.dumps([{"group": "python", "file": "tests/case.py", "name": "actual case", "status": status}]))
    module = AUDIT.load_register_module()
    monkeypatch.setattr(AUDIT, "load_register_module", lambda root: module)
    register = {"pages": [{"id": "page-actual"}], "platformSourceDigest": "actual-digest"}
    key = "page-actual/accessibility/screen-reader"
    row = {"checkId": key, "platformSourceDigest": "actual-digest", "testFile": "tests/case.py", "testSha256": AUDIT.sha(test) if hash_good else "stale", "caseName": "actual case", "group": "python"}
    proofs, invalid = AUDIT.resolve_criteria_evidence([row], register, incoming, tmp_path)
    assert (key in proofs) == expected
    assert bool(invalid) != expected
