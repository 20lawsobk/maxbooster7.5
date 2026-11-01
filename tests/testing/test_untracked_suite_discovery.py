"""Exercise suite discovery against real Git indexes and working trees."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/testing"))


class SuiteDiscovery(unittest.TestCase):
    def check_discovery(self, script, extension, body, python=False, catalog=False, directory="tests"):
        spec = importlib.util.spec_from_file_location("discovery_candidate", ROOT / "scripts/testing" / script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix="suite-discovery-") as temporary:
            fixture = Path(temporary)
            subprocess.run(["git", "init", "-q", str(fixture)], check=True)
            (fixture / directory).mkdir(parents=True)
            names = [f"{directory}/test_{name}{extension}" for name in ("tracked", "new", "ignored")]
            for name in names:
                (fixture / name).write_text(body)
            (fixture / ".gitignore").write_text(names[2] + "\n")
            subprocess.run(["git", "add", names[0]], cwd=fixture, check=True)
            module.ROOT = fixture
            if catalog:
                selected = [name for name in module.input_paths() if name.endswith(extension)]
            else:
                result = module.discover()
                selected = [suite["file"] for suite in result[0]] if python else result
            self.assertEqual(sorted(selected), sorted(names[:2]))
            self.assertEqual(len(selected), len(set(selected)))

    def test_node_includes_untracked_and_respects_ignored_files(self):
        self.check_discovery("run-node-suites.py", ".test.mjs",
                             'import test from "node:test"; test("case", () => {});\n')

    def test_python_includes_untracked_and_respects_ignored_files(self):
        self.check_discovery("run-python-suites.py", ".py",
                             "def test_case():\n    assert True\n", python=True)

    def test_catalog_includes_new_nested_first_party_tests(self):
        self.check_discovery("generate-catalog.py", ".py",
                             "def test_case():\n    assert True\n", catalog=True,
                             directory="external/maxcore/artifacts/ai-training-server/tests")


if __name__ == "__main__":
    unittest.main()
