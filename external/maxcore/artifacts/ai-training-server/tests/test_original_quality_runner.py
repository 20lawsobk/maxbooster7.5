"""Offline, lightweight contract tests for the original quality runner."""

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

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
        self.assertEqual(runner.hashes(), runner.hashes())
        self.assertEqual(set(runner.hashes()), set(runner.FILES))

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