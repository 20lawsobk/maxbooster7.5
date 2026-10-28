"""Explicit feature proofs require every exact current passing case."""
import copy
import hashlib
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("platform_register", ROOT / "scripts/testing/platform-register.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


@pytest.fixture
def proof(tmp_path):
    cases = []
    for file, name in [("owner.test.ts", "owner receives only own records"),
                       ("foreign.test.ts", "foreign owner receives no protected records")]:
        (tmp_path / file).write_text(f"// exact behavior: {name}\n")
        cases.append({"testFile": file, "testSha256": hashlib.sha256((tmp_path / file).read_bytes()).hexdigest(),
                      "caseName": name, "group": "http"})
    mapping = {"checkId": "api-owned/access-policy", "platformSourceDigest": "current-platform", "cases": cases}
    context = {"check_ids": {mapping["checkId"]}, "platform_digest": "current-platform",
               "test_entries": {case["testFile"]: {} for case in cases},
               "passed_cases": {(case["group"], case["testFile"], case["caseName"]) for case in cases}, "root": tmp_path}
    return mapping, context


def test_complete_explicit_bundle_preserves_all_exact_case_identities(proof):
    mapping, context = proof
    assert MODULE.resolve_evidence_cases(mapping, **context) == mapping["cases"]


def test_legacy_single_exact_case_remains_supported(proof):
    mapping, context = proof
    single = {key: value for key, value in mapping.items() if key != "cases"}
    single.update(mapping["cases"][0])
    assert MODULE.resolve_evidence_cases(single, **context) == [mapping["cases"][0]]


@pytest.mark.parametrize("status", ["missing", "skipped", "failed"])
def test_one_nonpassing_required_case_rejects_the_entire_bundle(proof, status):
    mapping, context = proof
    missing = mapping["cases"][1]
    context["passed_cases"].remove((missing["group"], missing["testFile"], missing["caseName"]))
    # Only exact PASS records enter this set. A status label cannot substitute.
    missing["status"] = status
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_changed_platform_source_rejects_otherwise_passing_cases(proof):
    mapping, context = proof
    context["platform_digest"] = "new-runtime-source"
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_changed_test_bytes_reject_old_passing_receipt(proof):
    mapping, context = proof
    (context["root"] / mapping["cases"][1]["testFile"]).write_text("// changed assertion\n")
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_deleted_test_cannot_be_a_current_proof(proof):
    mapping, context = proof
    (context["root"] / mapping["cases"][1]["testFile"]).unlink()
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


@pytest.mark.parametrize("field,replacement", [("group", "unit"), ("caseName", "similar owner test"),
                                               ("testFile", "unregistered.test.ts"), ("testSha256", "old-hash")])
def test_static_or_approximate_associations_do_not_close_a_check(proof, field, replacement):
    mapping, context = proof
    mapping["cases"][1][field] = replacement
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


@pytest.mark.parametrize("cases", [[], None, "all tests", {}, [None], [{"testFile": "owner.test.ts"}]])
def test_malformed_or_empty_bundle_cannot_prove_acceptance(proof, cases):
    mapping, context = proof
    mapping["cases"] = cases
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_mixed_legacy_and_bundle_identities_are_ambiguous_and_rejected(proof):
    mapping, context = proof
    mapping.update(mapping["cases"][0])
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_duplicate_case_does_not_count_as_two_independent_required_cases(proof):
    mapping, context = proof
    mapping["cases"].append(copy.deepcopy(mapping["cases"][0]))
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


@pytest.mark.parametrize("check", ["api-unknown/access-policy", [], None])
def test_unknown_or_malformed_check_never_becomes_verified(proof, check):
    mapping, context = proof
    mapping["checkId"] = check
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_unregistered_test_cannot_borrow_an_existing_exact_passing_identity(proof):
    mapping, context = proof
    del context["test_entries"][mapping["cases"][1]["testFile"]]
    assert MODULE.resolve_evidence_cases(mapping, **context) is None


def test_validator_does_not_mutate_the_declared_proof(proof):
    mapping, context = proof
    before = copy.deepcopy(mapping)
    MODULE.resolve_evidence_cases(mapping, **context)
    assert mapping == before


def test_generator_refuses_old_execution_even_when_candidate_digest_is_rewritten(proof, monkeypatch, tmp_path):
    """Exercise the actual main linker, not a replacement of its acceptance rule."""
    import json
    import sys
    from types import SimpleNamespace

    mapping, context = proof
    incoming = tmp_path / "reports/current"
    incoming.mkdir(parents=True)
    (tmp_path / "reports/endpoint-audit.json").write_text(json.dumps({"backendRoutes": [{
        "file": "server/routes.ts", "line": 1, "method": "GET", "fullPath": "/owned",
        "processScope": "fixture-app", "confidence": "high"}]}))
    (incoming / "test-inventory.json").write_text(json.dumps({"entries": [
        {"path": case["testFile"], "category": "test"} for case in mapping["cases"]]}))
    (incoming / "case-results.json").write_text(json.dumps([
        {"group": case["group"], "file": case["testFile"], "name": case["caseName"], "status": "passed"}
        for case in mapping["cases"]]))
    mapping["checkId"] = MODULE.identifier("api", "server/routes.ts", 1, "GET", "/owned") + "/access-policy"
    # Updating this editable candidate field must never re-bind old execution.
    mapping["platformSourceDigest"] = hashlib.sha256(json.dumps({}, sort_keys=True).encode()).hexdigest()
    acceptance = tmp_path / "acceptance.json"
    acceptance.write_text(json.dumps({"checks": [mapping]}))
    monkeypatch.syspath_prepend(str(ROOT / "scripts/testing"))
    monkeypatch.setattr(MODULE, "ROOT", tmp_path)
    resolver = MODULE.resolve_evidence_cases
    monkeypatch.setattr(MODULE, "resolve_evidence_cases", lambda mapping, **kwargs: resolver(mapping, root=tmp_path, **kwargs))
    monkeypatch.setattr(MODULE, "source_paths", lambda: [])
    parsed = {key: [] for key in ["files", "pages", "interactions", "routes", "mounts", "unknown"]}
    monkeypatch.setattr(MODULE.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=0, stdout=json.dumps(parsed)))
    monkeypatch.setattr(MODULE.subprocess, "check_output", lambda *a, **k: "fixture-head\n" if k.get("text") else b"fixture-head\n")
    monkeypatch.setattr(sys, "argv", ["platform-register.py", "--input", str(incoming), "--acceptance-map", str(acceptance)])
    assert MODULE.main() == 0
    report = json.loads((incoming / "platform-register.json").read_text())
    check = next(row for row in report["backendRoutes"][0]["requiredChecks"] if row["template"] == "access-policy")
    assert check["status"] == "UNVERIFIED"


@pytest.fixture
def actual_execution(tmp_path):
    """Produce real bounded credential-free test artifacts, never app readiness."""
    import datetime
    import json
    import sys

    def produce(group="python", multifile=False):
        base = tmp_path / group
        incoming = base / "reports/incoming"
        (incoming / "orchestration").mkdir(parents=True)
        relative = "tests/test_owned_producer.py" if group == "python" else "tests/owned-producer.test.mjs"
        source = base / relative
        source.parent.mkdir()
        if group == "python":
            source.write_text("def test_owned_producer():\n    assert 2 + 2 == 4\n")
            artifact = incoming / "python/owned.xml"
            artifact.parent.mkdir()
            command = [sys.executable, "-m", "pytest", "-q", relative, "--junitxml=" + str(artifact)]
            name = "test_owned_producer"
        else:
            source.write_text("import {test} from 'node:test'; import assert from 'node:assert/strict';\n"
                              "test('owned fixture passes',()=>assert.equal(2+2,4));\n"
                              "test('skipped fixture is not proof',{skip:true},()=>assert.fail());\n")
            command = [str(ROOT.parent / ".cloud-tools/node_modules/.bin/node") if (ROOT.parent / ".cloud-tools/node_modules/.bin/node").is_file() else "node",
                       "--test", "--test-reporter=tap", relative]
            name = "owned fixture passes"
        additional = "tests/second-owned-producer.test.mjs" if multifile else None
        if additional:
            (base / additional).write_text("import {test} from 'node:test'; import assert from 'node:assert/strict'; test('second fixture passes',()=>assert.equal(3+3,6));")
            command.append(additional)
        spec = importlib.util.spec_from_file_location("owned_producer_common", ROOT / "scripts/testing/common.py")
        common = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(common)
        common.ROOT = base
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        run = common.run_command(command, incoming / "orchestration" / (group + ".txt"), cwd=base,
                                 timeout=15, extra_env={"PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1"})
        assert run["exitCode"] == 0, (incoming / "orchestration" / (group + ".txt")).read_text()
        run.update(group=group, id=group)
        files = {relative: hashlib.sha256(source.read_bytes()).hexdigest()}
        if additional: files[additional] = hashlib.sha256((base / additional).read_bytes()).hexdigest()
        source_digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        current = {"sha256": source_digest, "files": files}
        master = {"sourceRevision": "fixture-source", "startedAt": started, "sourceInputsSha256": source_digest,
                  "sourceInputsUnchanged": True, "changedSourceInputs": [], "selectedGroups": [group], "runs": [run],
                  "status": "failed", "allTestsPassed": False}
        (incoming / "orchestration/source-inputs.json").write_text(json.dumps(current))
        (incoming / "orchestration/results.json").write_text(json.dumps(master))
        cases = []
        if group == "python":
            cases = [{"group": group, "file": relative, "name": name, "status": "passed", "junit": str(artifact)}]
            (incoming / "python/results.json").write_text(json.dumps({"suites": [{"file": relative,
                "sourceSha256": files[relative], "junit": "owned.xml", "exitCode": 0,
                "command": __import__("shlex").join(command)}]}))
        elif group == "node":
            (incoming / "node").mkdir()
            (incoming / "node/results.json").write_text(json.dumps({"group": "node", "runs": [{**run, "file": relative}]}))
        else:
            (incoming / "integration-browser").mkdir()
            (incoming / "integration-browser/browser-page80-summary.json").write_text(json.dumps({"browser": {
                "files": [relative] + ([additional] if additional else []),
                "caseNames": [name] + (["second fixture passes"] if additional else []),
                "exitCode": 0, "log": "../orchestration/browser.txt"}}))
        (incoming / "case-results.json").write_text(json.dumps(cases))
        return {"root": base, "incoming": incoming, "current": current, "master": master,
                "expected": {(group, relative, name)}, "caseFile": relative, "source": source,
                "junit": artifact if group == "python" else None}
    return produce


def collect_actual(proof):
    return MODULE.collect_current_passing_cases(proof["incoming"], proof["current"], root=proof["root"])


def rewrite_artifact(proof, relative, mutate, *, replace=False):
    import json
    file = proof["incoming"] / relative
    value = json.loads(file.read_text())
    updated = mutate(value)
    file.write_text(json.dumps(value if updated is None and not replace else updated))


@pytest.mark.parametrize("group", ["python", "node", "browser"])
def test_actual_selected_producer_can_prove_only_its_exact_current_cases(actual_execution, group):
    proof = actual_execution(group)
    passed, state = collect_actual(proof)
    assert passed == proof["expected"]
    assert state["sourceInputsMatchCurrent"] is True
    assert state["selectedExecutedGroups"] == [group]
    assert state["status"] == "CURRENT"
    assert (group, proof["caseFile"], "skipped fixture is not proof") not in passed
    assert "finishedAt" not in proof["master"]
    assert proof["master"]["status"] == "failed"  # A global failure is not a leaf failure.


@pytest.mark.parametrize("change", ["missing-ledger", "missing-inputs", "source-changed", "digest-relabelled",
                                   "unchanged-false", "changed-inputs", "missing-run", "unselected-group", "missing-log-hash", "changed-log"])
def test_execution_metadata_cannot_be_relabelled_as_current_proof(actual_execution, change):
    proof = actual_execution()
    incoming = proof["incoming"]
    if change == "missing-ledger": (incoming / "orchestration/results.json").unlink()
    elif change == "missing-inputs": (incoming / "orchestration/source-inputs.json").unlink()
    elif change == "source-changed": proof["current"] = {"files": {proof["caseFile"]: "changed"}, "sha256": "changed"}
    elif change == "digest-relabelled": rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(sourceInputsSha256="new-candidate-digest"))
    elif change == "unchanged-false": rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(sourceInputsUnchanged=False))
    elif change == "changed-inputs": rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(changedSourceInputs=[proof["caseFile"]]))
    elif change == "missing-run": rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(runs=[]))
    elif change == "unselected-group": rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(selectedGroups=["http"]))
    elif change == "missing-log-hash": rewrite_artifact(proof, "orchestration/results.json", lambda x: x["runs"][0].pop("logSha256"))
    elif change == "changed-log": (incoming / "orchestration/python.txt").write_text("old output substituted\n")
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("group", ["python", "node", "browser"])
def test_refreshing_case_results_does_not_refresh_stale_underlying_artifacts(actual_execution, group):
    import os
    import datetime
    proof = actual_execution(group)
    artifact = proof["junit"] or proof["incoming"] / ("node/results.json" if group == "node" else "integration-browser/browser-page80-summary.json")
    stale = datetime.datetime.fromisoformat(proof["master"]["startedAt"]).timestamp() - 10
    os.utime(artifact, (stale, stale))
    rewrite_artifact(proof, "case-results.json", lambda rows: rows)
    assert collect_actual(proof)[0] == set()


def test_case_results_must_match_actual_bound_passing_xml(actual_execution):
    proof = actual_execution()
    rewrite_artifact(proof, "case-results.json", lambda rows: rows[0].update(name="a case that was never run"))
    passed, state = collect_actual(proof)
    assert passed == set()
    assert state["rejectedEvidence"]["case-not-passed-in-bound-xml"] == 1


def test_failed_or_skipped_xml_cannot_borrow_a_pass_label(actual_execution):
    import xml.etree.ElementTree as ET
    proof = actual_execution()
    tree = ET.parse(proof["junit"])
    ET.SubElement(next(tree.getroot().iter("testcase")), "skipped")
    tree.write(proof["junit"])
    assert collect_actual(proof)[0] == set()


def test_changed_python_source_hash_cannot_borrow_default_file_identity(actual_execution):
    proof = actual_execution()
    rewrite_artifact(proof, "python/results.json", lambda x: x["suites"][0].update(sourceSha256="wrong-source"))
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("value", [None, {}, "all cases"])
def test_malformed_case_results_fail_closed(actual_execution, value):
    proof = actual_execution()
    rewrite_artifact(proof, "case-results.json", lambda _: value, replace=True)
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("change", ["missing-hash", "changed-log", "wrong-command", "failed", "missing-run"])
def test_supplemental_node_cases_need_the_actual_current_successful_file_run(actual_execution, change):
    proof = actual_execution("node")
    if change == "missing-hash": rewrite_artifact(proof, "node/results.json", lambda x: x["runs"][0].pop("logSha256"))
    elif change == "changed-log": (proof["incoming"] / "orchestration/node.txt").write_text("ok 1 - old borrowed pass\n")
    elif change == "wrong-command": rewrite_artifact(proof, "node/results.json", lambda x: x["runs"][0].update(command=["node", "other.test.mjs"]))
    elif change == "failed": rewrite_artifact(proof, "node/results.json", lambda x: x["runs"][0].update(exitCode=1, status="failed"))
    else: rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(runs=[]))
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("value", [None, [], {"runs": None}, {"runs": [None, {"file": []}]}])
def test_malformed_supplemental_node_reports_fail_closed(actual_execution, value):
    proof = actual_execution("node")
    rewrite_artifact(proof, "node/results.json", lambda _: value, replace=True)
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("value", [None, [], {"browser": None}, {"browser": {"files": [[]], "caseNames": ["borrowed"], "exitCode": 0}}])
def test_malformed_supplemental_browser_reports_fail_closed(actual_execution, value):
    proof = actual_execution("browser")
    rewrite_artifact(proof, "integration-browser/browser-page80-summary.json", lambda _: value, replace=True)
    assert collect_actual(proof)[0] == set()


def test_postprocessing_ledger_updates_preserve_exact_stable_execution_binding(actual_execution):
    proof = actual_execution()
    before, original = collect_actual(proof)
    rewrite_artifact(proof, "orchestration/results.json", lambda x: x.update(
        finishedAt="2026-10-28T13:00:00+00:00", postprocessing=[{"id": "platform", "exitCode": 1}], status="failed"))
    after, final = collect_actual(proof)
    assert before == after == proof["expected"]
    assert original["executionBinding"] == final["executionBinding"]
    assert original["executionBindingSha256"] == final["executionBindingSha256"]
    assert str(proof["incoming"] / "orchestration/results.json") not in final["inputArtifactsSha256"]


@pytest.mark.parametrize("status", ["passed", "failed", "skipped"])
def test_duplicate_xml_identity_is_ambiguous_even_if_one_occurrence_passes(actual_execution, status):
    import xml.etree.ElementTree as ET
    proof = actual_execution()
    tree = ET.parse(proof["junit"])
    suite = next(tree.getroot().iter("testsuite"))
    duplicate = copy.deepcopy(next(suite.iter("testcase")))
    if status != "passed": ET.SubElement(duplicate, "failure" if status == "failed" else "skipped")
    suite.append(duplicate)
    tree.write(proof["junit"])
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("change", ["source-map-digest", "timeout", "duplicate-run", "outside-artifact"])
def test_partial_or_ambiguous_producer_bindings_never_become_leaf_proof(actual_execution, change):
    proof = actual_execution()
    if change == "source-map-digest": rewrite_artifact(proof, "orchestration/source-inputs.json", lambda x: x.update(sha256="wrong"))
    elif change == "timeout": rewrite_artifact(proof, "orchestration/results.json", lambda x: x["runs"][0].update(timedOut=True))
    elif change == "duplicate-run": rewrite_artifact(proof, "orchestration/results.json", lambda x: x["runs"].append(copy.deepcopy(x["runs"][0])))
    else:
        external = proof["root"] / "outside.xml"
        external.write_bytes(proof["junit"].read_bytes())
        rewrite_artifact(proof, "case-results.json", lambda x: x[0].update(junit=str(external)))
    assert collect_actual(proof)[0] == set()


@pytest.mark.parametrize("swap", [False, True])
def test_aggregate_browser_tap_cannot_assign_cases_to_files(actual_execution, swap):
    proof = actual_execution("browser", multifile=True)
    if swap:
        rewrite_artifact(proof, "integration-browser/browser-page80-summary.json", lambda x: x["browser"]["files"].reverse())
    passed, state = collect_actual(proof)
    assert passed == set()
    assert state["rejectedEvidence"]["unbound-browser-artifact"] == 1


@pytest.mark.parametrize("change", ["wrong-source-command", "false-exit", "command-prefix-only"])
def test_default_file_producer_requires_exact_command_and_numeric_success(actual_execution, change):
    proof = actual_execution()
    def mutate(value):
        entry = value["suites"][0]
        if change == "false-exit": entry["exitCode"] = False
        else: entry["command"] = "python runner.py " + ("another.py" if change == "wrong-source-command" else proof["caseFile"] + ".backup")
    rewrite_artifact(proof, "python/results.json", mutate)
    assert collect_actual(proof)[0] == set()
