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
