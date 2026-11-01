"""Offline, lightweight contract tests for the original quality runner."""

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

RUNNER = Path(__file__).resolve().parents[1] / "scripts" / "run-maxcore-original-quality.py"
spec = importlib.util.spec_from_file_location("original_quality_runner", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerContractTests(unittest.TestCase):
    def test_local_origin_only(self):
        self.assertEqual(runner.loopback_origin("http://127.0.0.1:9878"), ("127.0.0.1", 9878))
        for origin in ("https://127.0.0.1:9878", "http://remote:9878",
                       "http://127.0.0.1:9878/path", "http://user:pass@127.0.0.1:9878",
                       "http://127.0.0.1:0"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                runner.loopback_origin(origin)

    def test_hashes_match_unchanged_sources(self):
        # Hashing contract is independent of a locally installed checkpoint.
        # Synthetic files are fixtures, never a serving release or quality proof.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in runner.FILES:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(name.encode())
            with patch.object(runner, "ROOT", root):
                before = runner.hashes()
                self.assertEqual(before, runner.hashes())
                self.assertEqual(set(before), set(runner.FILES))
                changed = root / runner.FILES[0]
                changed.write_bytes(b"different source")
                self.assertNotEqual(before[runner.FILES[0]], runner.hashes()[runner.FILES[0]])
                (root / "ai_model/weights/model.pt").unlink()
                with self.assertRaises(FileNotFoundError):
                    runner.hashes()

    def test_counters_exclude_text_and_do_not_subtract_booleans(self):
        before = {"ops": 1, "available": True, "token": "sensitive", "nested": {"hits": 2}}
        after = {"ops": 4, "available": False, "token": "changed", "nested": {"hits": 3}}
        self.assertEqual(runner._counters(before),
                         {"ops": 1, "available": True, "nested": {"hits": 2}})
        self.assertEqual(runner._delta(before, after),
                         {"ops": 3, "nested": {"hits": 1}})

    def test_subprocess_failure_and_timeout_are_recorded(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory)
            failed = runner.suite("failure", [sys.executable, "-c", "raise RuntimeError('test')"],
                                  3, report, {})
            self.assertNotEqual(failed["exit_code"], 0)
            self.assertFalse(failed["timed_out"])
            self.assertIn(b"RuntimeError", (report / "failure.log").read_bytes())
            timeout = runner.suite("timeout", [sys.executable, "-c", "import time; time.sleep(2)"],
                                   1, report, {})
            self.assertTrue(timeout["timed_out"])
            self.assertIsNone(timeout["exit_code"])
            self.assertTrue((report / "timeout.log").exists())


if __name__ == "__main__":
    unittest.main()
