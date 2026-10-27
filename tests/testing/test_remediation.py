"""Pure-data contracts for the master verification's repair guide."""
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('maxbooster_remediation', ROOT / 'scripts/testing/remediation.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write(base, name, data):
    file = base / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data))
    return file


def reports(base, cases):
    write(base, 'test-inventory.json', {'entries': [{'path': 'tests/example.test.ts', 'category': 'test',
        'command': 'node --test tests/example.test.ts', 'cwd': '.', 'prerequisites': []}]})
    write(base, 'summary.json', {'status': 'failed'})
    write(base, 'case-results.json', cases)
    write(base, 'file-status.json', [])


def test_empty_or_malformed_evidence_cannot_produce_a_closed_strict_run():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        guide = MODULE.Guide(base)
        guide.collect()
        assert any(item['kind'] == 'missing_evidence' for item in guide.items)
        write(base, 'case-results.json', [])
        (base / 'case-results.json').write_text('{interrupted reporter output')
        guide = MODULE.Guide(base)
        guide.collect()
        assert any(item['kind'] == 'invalid_evidence' for item in guide.items)
        write(base, 'case-results.json', {'wrong': 'collection shape'})
        guide = MODULE.Guide(base)
        guide.collect()
        assert any(item['kind'] == 'invalid_evidence' for item in guide.items)
        output = base / 'guide'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/testing/remediation.py'),
                                 '--input', str(base), '--output', str(output), '--strict'],
                                text=True, capture_output=True, timeout=20)
        assert result.returncode == 1, result.stderr
        assert json.loads((output / 'remediation.json').read_text())['status'] == 'needs_work'


def test_unrecognized_assertion_retains_exact_source_case_and_unconfirmed_cause():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        reports(base, [{'group': 'root-unit', 'file': 'tests/example.test.ts', 'name': 'balance journal edge',
                        'status': 'failed', 'message': 'expected 42 to equal 5', 'junit': 'case.xml'}])
        guide = MODULE.Guide(base)
        guide.collect()
        item = next(item for item in guide.items if item['case'] == 'balance journal edge')
        assert item['observed'] == 'expected 42 to equal 5'
        assert item['file'] == 'tests/example.test.ts'
        assert item['diagnosis']['confidence'] == 'needs_verification'
        assert item['reproduce']['command'] == 'node --test tests/example.test.ts'
        assert any('do not suppress' in action for action in item['actions'])


def test_managed_browser_policy_has_a_supported_remedy_without_an_override():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        reports(base, [{'group': 'node', 'file': 'tests/patent-pdf-runtime.test.mjs', 'name': 'actual PDF render',
                        'status': 'failed', 'message': 'net::ERR_BLOCKED_BY_ADMINISTRATOR', 'junit': 'pdf.xml'}])
        guide = MODULE.Guide(base)
        guide.collect()
        item = next(item for item in guide.items if item['case'] == 'actual PDF render')
        assert item['diagnosis']['confidence'] == 'confirmed'
        assert any('Do not disable browser policy' in action for action in item['actions'])
        assert any('approved host/browser profile' in action for action in item['actions'])
        assert '--disable' not in item['reproduce']['command']


def test_new_successful_master_audit_supersedes_its_older_failed_snapshot():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        reports(base, [{'group': 'root-unit', 'file': 'tests/example.test.ts', 'name': 'fixture case',
                        'status': 'passed', 'junit': 'fixture.xml'}])
        old = write(base, 'root/dependency-audit.json', {'exitCode': 1, 'result': {
            'vulnerabilities': {'historical-package': {'severity': 'high', 'range': '<2'}}}})
        os.utime(old, (1, 1))
        write(base, 'orchestration/results.json', {'runs': [{'id': 'audit', 'exitCode': 0,
            'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}]})
        write(base, 'final-checks/orchestration/results.json', {'runs': [{'id': 'audit', 'exitCode': 1}]})
        guide = MODULE.Guide(base)
        guide.collect()
        assert not any(item['kind'] == 'dependency_vulnerability' for item in guide.items)
        assert not any(item['case'] == 'audit' and item['kind'] == 'command_failure' for item in guide.items)
        write(base, 'orchestration/results.json', {'runs': [{'id': 'audit', 'exitCode': 1,
            'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}]})
        guide = MODULE.Guide(base)
        guide.collect()
        assert any(item['case'] == 'audit' and item['kind'] == 'command_failure' for item in guide.items)


def test_istanbul_gaps_retain_statement_function_and_branch_locations():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        reports(base, [{'group': 'root-unit', 'file': 'tests/example.test.ts', 'name': 'fixture case',
                        'status': 'passed', 'junit': 'fixture.xml'}])
        source = str(ROOT / 'server/fixture.ts')
        write(base, 'coverage/coverage-final.json', {source: {'path': source,
            's': {'0': 0}, 'statementMap': {'0': {'start': {'line': 10}}},
            'f': {'0': 0}, 'fnMap': {'0': {'name': 'settle', 'loc': {'start': {'line': 23}}}},
            'b': {'0': [1, 0]}, 'branchMap': {'0': {'line': 34}}}})
        guide = MODULE.Guide(base)
        guide.collect()
        item = next(item for item in guide.items if item['kind'] == 'coverage_gap')
        assert item['file'] == 'server/fixture.ts'
        assert item['uncovered']['statementLines'] == [10]
        assert item['uncovered']['functions'] == [{'name': 'settle', 'line': 23}]
        assert item['uncovered']['branches'] == [{'id': '0', 'line': 34, 'uncoveredArms': [1]}]


def test_one_case_diagnosis_does_not_borrow_another_cases_junit_error():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        junit = base / 'combined.xml'
        junit.write_text('<testsuites><testsuite><testcase name="owner session">'
                         '<failure message="expected 401 to be 200">owner session unauthorized</failure>'
                         '</testcase><testcase name="readiness healthy">'
                         '<failure message="expected 503 to be 200">model_loaded false</failure>'
                         '</testcase></testsuite></testsuites>')
        reports(base, [{'group': 'http', 'file': 'tests/auth-flows.test.ts', 'name': 'owner session',
                        'status': 'failed', 'message': 'expected 401 to be 200', 'junit': str(junit)},
                       {'group': 'http', 'file': 'tests/health.test.ts', 'name': 'readiness healthy',
                        'status': 'failed', 'message': 'expected 503 to be 200', 'junit': str(junit)}])
        guide = MODULE.Guide(base)
        guide.collect()
        owner = next(item for item in guide.items if item['case'] == 'owner session')
        health = next(item for item in guide.items if item['case'] == 'readiness healthy')
        assert owner['diagnosis']['description'].startswith('Authorization/session setup')
        assert health['diagnosis']['description'].startswith('A required capability/readiness')
