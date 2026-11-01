"""Execute the real state-reporting function without starting live services."""
import ast
from pathlib import Path
import threading
import unittest

SERVER = Path(__file__).resolve().parents[1] / "server.py"


class ModelStateProvenance(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(SERVER.read_text())
        function = next(node for node in tree.body
                        if isinstance(node, ast.FunctionDef) and node.name == "_api_model_state")
        self.state = {
            "_training_lock": threading.Lock(),
            "_model_lock": threading.Lock(),
            "_training_state": {"sessions_done": 7, "loss": 0.25},
            "_model_ready": False,
            "_model_config": {"dim": 384, "layers": 5, "vocab_size": 256},
            "_serving_release_status": {},
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SERVER), "exec"), self.state)

    def test_all_domains_report_unavailable_without_fabricated_provenance(self):
        for domain in ("social", "advertising", "content", "engagement"):
            with self.subTest(domain=domain):
                result = self.state["_api_model_state"](domain)
                self.assertEqual(result["domain"], domain)
                self.assertIsNone(result["trained_at"])
                self.assertIsNone(result["checkpoint_sha256"])
                self.assertEqual(result["session_count"], 7)
                self.assertEqual(result["loss"], 0.25)
                self.assertEqual(result["weights"], {
                    "ready": False, "embed_dim": None, "n_layers": None, "vocab_size": None,
                })

    def test_ready_model_reports_only_recorded_architecture_and_provenance(self):
        self.state["_model_ready"] = True
        self.state["_serving_release_status"] = {
            "checkpoint_sha256": "a" * 64, "trained_at": "2026-01-01T00:00:00Z",
        }
        result = self.state["_api_model_state"]("social")
        self.assertEqual(result["weights"], {
            "ready": True, "embed_dim": 384, "n_layers": 5, "vocab_size": 256,
        })
        self.assertEqual(result["checkpoint_sha256"], "a" * 64)
        self.assertEqual(result["trained_at"], "2026-01-01T00:00:00Z")

    def test_ready_release_without_metadata_does_not_invent_missing_values(self):
        self.state["_model_ready"] = True
        self.state["_model_config"] = {"release": "live-awareness"}
        result = self.state["_api_model_state"]("social")
        self.assertTrue(result["weights"]["ready"])
        self.assertIsNone(result["trained_at"])
        self.assertIsNone(result["weights"]["embed_dim"])
        self.assertIsNone(result["weights"]["vocab_size"])


if __name__ == "__main__":
    unittest.main()
