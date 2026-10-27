"""Retain every case in mixed Node/Vitest JUnit layouts without double counts."""
import importlib.util
from pathlib import Path
import sys
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/testing'))
import common
SPEC = importlib.util.spec_from_file_location('maxbooster_summary', ROOT / 'scripts/testing/summarize-results.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_mixed_root_cases_and_nested_suites_keep_skips_and_each_case_once():
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / 'cases.xml'
        path.write_text('<testsuites><testcase name="root pass"/>'
                        '<testsuite name="outer"><testcase name="outer pass"/>'
                        '<testsuite name="inner"><testcase name="inner fail">'
                        '<failure message="actual failure"/></testcase></testsuite></testsuite>'
                        '<testcase name="root skip"><skipped/></testcase></testsuites>')
        cases = MODULE.xml_cases(path, 'commerce', 'tests/fixture.mjs')
        assert [(case['name'], case['status']) for case in cases] == [
            ('root pass', 'passed'), ('outer pass', 'passed'),
            ('inner fail', 'failed'), ('root skip', 'skipped')]
        assert {case['file'] for case in cases} == {'tests/fixture.mjs'}
        assert cases[2]['message'] == 'actual failure'


def test_suite_names_and_explicit_file_survive_without_default_file():
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / 'cases.xml'
        path.write_text('<testsuite name="tests/group.test.ts">'
                        '<testcase name="inherits suite"/>'
                        '<testcase name="runtime error" file="tests/explicit.test.ts">'
                        '<error message="cannot import fixture"/></testcase></testsuite>')
        cases = MODULE.xml_cases(path, 'http')
        assert [(case['file'], case['status']) for case in cases] == [
            ('tests/group.test.ts', 'passed'), ('tests/explicit.test.ts', 'failed')]
        assert cases[1]['message'] == 'cannot import fixture'


def test_master_plan_keeps_sandbox_mutations_opt_in_and_builds_before_http_load():
    command = [sys.executable, str(ROOT / 'scripts/testing/run-all.py')]
    default = subprocess.run([*command, '--plan'], cwd=ROOT, capture_output=True, text=True, check=True)
    assert not any(job['group'] == 'providers' for job in json.loads(default.stdout))
    invalid = subprocess.run([*command, '--plan', '--group', 'providers'], cwd=ROOT, capture_output=True, text=True)
    assert invalid.returncode == 2
    allowed = subprocess.run([*command, '--plan', '--group', 'providers', '--stripe-test-api'], cwd=ROOT, capture_output=True, text=True, check=True)
    jobs = json.loads(allowed.stdout)
    assert len(jobs) == 1 and jobs[0]['id'] == 'stripe-test-api'
    load = subprocess.run([*command, '--plan', '--group', 'load'], cwd=ROOT, capture_output=True, text=True, check=True)
    assert [job['id'] for job in json.loads(load.stdout)] == ['frontend-build', 'bounded-http-load']


def test_source_identity_detects_new_code_changes_and_excludes_generated_private_state(monkeypatch):
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        (root / '.gitignore').write_text('secret.json\n')
        (root / 'server').mkdir()
        code = root / 'server/new.ts'
        code.write_text('export const result = 1;\n')
        (root / 'docs').mkdir()
        (root / 'docs/result.json').write_text('{"generated":1}')
        (root / 'coverage').mkdir()
        (root / 'coverage/coverage-final.json').write_text('{"generated":1}')
        (root / 'tests/coverage').mkdir(parents=True)
        contract = root / 'tests/coverage/storage.test.ts'
        contract.write_text('export const databaseContract = 1;\n')
        (root / 'secret.json').write_text('{"private":"fixture-only"}')
        monkeypatch.setattr(common, 'ROOT', root)
        first = common.source_inputs()
        assert set(first['files']) == {'server/new.ts', 'tests/coverage/storage.test.ts'}
        (root / 'docs/result.json').write_text('{"generated":2}')
        assert common.source_inputs()['sha256'] == first['sha256']
        code.write_text('export const result = 2;\n')
        assert common.source_inputs()['sha256'] != first['sha256']
        second = common.source_inputs()
        contract.write_text('export const databaseContract = 2;\n')
        assert common.source_inputs()['sha256'] != second['sha256']


def test_provider_parse_exclusions_cannot_be_mistaken_for_complete_coverage():
    log = ('Tests passed\nFailed to parse file:///owned/Studio Loader.tsx. Excluding it from coverage.\n'
           'Failed to parse file:///owned/Studio Loader.tsx. Excluding it from coverage.\n'
           'Coverage for lines: 95%\n')
    assert common.coverage_parse_exclusions(log) == ['file:///owned/Studio Loader.tsx']
    assert common.coverage_parse_exclusions('Tests passed\nCoverage report from v8\n') == []


def test_coverage_only_database_cases_are_retained_without_repeating_ordinary_units():
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / 'cases.xml'
        path.write_text('<testsuites><testsuite name="tests/unit/normal.test.ts">'
                        '<testcase name="ordinary unit"/></testsuite>'
                        '<testsuite name="tests/coverage/storage.test.ts">'
                        '<testcase name="actual database outcome"/>'
                        '<testcase name="database failure"><failure message="actual failure"/></testcase>'
                        '</testsuite></testsuites>')
        cases = MODULE.coverage_contract_cases(path)
        assert [(case['file'], case['name'], case['status']) for case in cases] == [
            ('tests/coverage/storage.test.ts', 'actual database outcome', 'passed'),
            ('tests/coverage/storage.test.ts', 'database failure', 'failed')]
