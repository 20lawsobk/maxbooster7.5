"""Real pytest must reject false checks in canonical custom assertion helpers.

Only each actual helper's AST is compiled; full model modules, upload state,
network transports and their import-time initialization are not admitted here.
The child probes are test-oracle regressions, not product acceptance cases.
"""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

import pytest

ROOT = Path(__file__).resolve().parents[2]
MAXCORE = "external/maxcore/artifacts/ai-training-server/ai_model/"
HELPERS = (
    MAXCORE + "retrieval/test_pipeline.py",
    MAXCORE + "retrieval/test_phase4.py",
    MAXCORE + "retrieval/test_rcgs.py",
    MAXCORE + "retrieval/test_retrieval.py",
    MAXCORE + "rta/test_render_contracts.py",
)
MARKER = "intentional-false-oracle-condition-must-fail-pytest"


def run_exact_helper(tmp_path, relative, condition):
    source = (ROOT / relative).read_text()
    helpers = [node for node in ast.parse(source).body
               if isinstance(node, ast.FunctionDef) and node.name == "_check"]
    assert len(helpers) == 1, "The canonical assertion helper must resolve uniquely"
    # Preserve the exact source body and original traceback location. No source
    # module imports, substituted check implementation or production state.
    helper_source = "\n" * (helpers[0].lineno - 1) + ast.get_source_segment(source, helpers[0])
    probe = tmp_path / "test_exact_helper.py"
    probe.write_text(
        "import json\n"
        f"HELPER_SOURCE = {helper_source!r}\n"
        f"ORIGINAL_PATH = {str(ROOT / relative)!r}\n"
        f"MARKER = {MARKER!r}\n"
        "def test_exact_helper():\n"
        "    namespace = {'_FAILS': [], '_failures': 0}\n"
        "    exec(compile(HELPER_SOURCE, ORIGINAL_PATH, 'exec'), namespace)\n"
        "    try:\n"
        f"        namespace['_check'](MARKER, {condition!r})\n"
        "    finally:\n"
        "        print('ORACLE_BOOKKEEPING=' + json.dumps({\n"
        "            'failures': namespace['_FAILS'],\n"
        "            'failureCount': namespace['_failures']}))\n"
    )
    report = tmp_path / "exact-helper.xml"
    environment = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(tmp_path), "TMPDIR": str(tmp_path), "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1", "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    }
    if os.environ.get("LD_LIBRARY_PATH"):
        environment["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH"]
    command = [sys.executable, "-m", "pytest", "-q", "-s", "-p", "no:cacheprovider",
               str(probe), "--junitxml=" + str(report)]
    result = subprocess.run(command, cwd=tmp_path, env=environment,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=30, start_new_session=True)
    assert report.is_file(), "A child import/collection error cannot stand in for the intended test outcome: " + result.stdout
    cases = list(ET.parse(report).getroot().iter("testcase"))
    assert len(cases) == 1 and cases[0].get("name") == "test_exact_helper", result.stdout
    assert cases[0].find("error") is None and cases[0].find("skipped") is None, result.stdout
    records = [line.split("ORACLE_BOOKKEEPING=", 1)[1] for line in result.stdout.splitlines()
               if line.startswith("ORACLE_BOOKKEEPING=")]
    assert len(records) == 1, "The exact helper body must execute: " + result.stdout
    return result, cases[0], json.loads(records[0])


@pytest.mark.parametrize("relative", HELPERS)
def test_false_condition_is_one_real_pytest_assertion_failure(tmp_path, relative):
    result, case, bookkeeping = run_exact_helper(tmp_path, relative, False)
    assert result.returncode == 1, "A false check must fail pytest: " + result.stdout
    failures = case.findall("failure")
    assert len(failures) == 1, result.stdout
    failure = failures[0]
    assert "AssertionError" in failure.get("message", "") and MARKER in failure.get("message", ""), result.stdout
    assert "AssertionError" in (failure.text or "") and MARKER in (failure.text or ""), result.stdout
    assert "NameError" not in (failure.text or "") and "ImportError" not in (failure.text or ""), result.stdout
    assert bookkeeping in ({"failures": [MARKER], "failureCount": 0},
                            {"failures": [], "failureCount": 1}), bookkeeping


@pytest.mark.parametrize("relative", HELPERS)
def test_true_condition_passes_without_recording_a_failure(tmp_path, relative):
    result, case, bookkeeping = run_exact_helper(tmp_path, relative, True)
    assert result.returncode == 0 and case.find("failure") is None, result.stdout
    assert bookkeeping == {"failures": [], "failureCount": 0}
