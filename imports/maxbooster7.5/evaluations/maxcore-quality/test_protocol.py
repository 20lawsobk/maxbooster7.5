"""Fast evaluator-contract tests: no model import or inference."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("quality_runner", ROOT / "scripts/evaluate-maxcore-quality.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ProtocolTests(unittest.TestCase):
    def test_connected_runner_protects_checkpoint_and_generated_files(self):
        spec = importlib.util.spec_from_file_location(
            "aware_runner", ROOT / "scripts/evaluate-maxcore-aware-serving.py")
        aware = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(aware)
        checkpoint = aware.MODEL / "ai_model/weights/model.pt"
        aware.protect_evaluation_files("open", (checkpoint, "r", os.O_RDONLY))
        with self.assertRaises(PermissionError):
            aware.protect_evaluation_files("open", (checkpoint, "w", os.O_WRONLY | os.O_TRUNC))
        for path in (checkpoint, aware.MODEL / "uploads/example.wav", Path("/tmp/maxbooster_jobs/example.json")):
            with self.assertRaises(PermissionError):
                aware.protect_evaluation_files("os.remove", (path, -1))
        with self.assertRaises(PermissionError):
            aware.protect_evaluation_files("os.rename", ("temporary.pt", checkpoint, -1, -1))
        aware.protect_evaluation_files("open", (ROOT / "reports/test.json", "w", os.O_WRONLY))

    def test_fixed_cases_and_seeds(self):
        fixture = json.loads(runner.FIXTURE.read_text())
        self.assertEqual(len(fixture["cases"]), 10)
        self.assertEqual(len({c["id"] for c in fixture["cases"]}), 10)
        self.assertEqual(fixture["seeds"], [23101, 23102])
        for case in fixture["cases"]:
            self.assertTrue(case["criteria"])
            self.assertTrue(case["category"])
            self.assertTrue(case["prompt"])

    def test_overlap_is_detected_without_corpus_leakage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "training").mkdir()
            corpus = root / "training/example.txt"
            text = "one two three four five six seven eight nine ten eleven twelve thirteen"
            corpus.write_text("private prefix " + text.upper() + " private suffix")
            with patch.object(runner, "MODEL_ROOT", root), patch.object(runner, "ROOT", root):
                result = runner.contamination_check([{"id": "test", "prompt": text}])
                clean = runner.contamination_check([{"id": "different", "prompt": "unrelated case"}])
            self.assertEqual(result["matches"][0]["case_id"], "test")
            self.assertNotIn("private prefix", json.dumps(result))
            self.assertEqual(clean["matches"], [])

    def test_digest_and_normalization(self):
        self.assertEqual(runner.normalized(" A \n B "), "a b")
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "checkpoint"
            path.write_bytes(b"abc")
            self.assertEqual(runner.digest(path), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
            self.assertEqual(path.read_bytes(), b"abc")


if __name__ == "__main__":
    unittest.main()