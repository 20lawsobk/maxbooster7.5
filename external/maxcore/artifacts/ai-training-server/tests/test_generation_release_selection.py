"""Startup selection tests, with no model initialization/training or server start."""
import ast
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock
from types import SimpleNamespace, MethodType

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.generation.release import load_selected_release
from ai_model.model.candidate_serving import CandidateServingAdapter


class ReleaseSelectionTests(unittest.TestCase):
    def test_default_and_no_selection_leave_explicit_legacy_release(self):
        factory = Mock(side_effect=AssertionError("No candidate must be loaded"))
        adapter, status = load_selected_release(factory=factory)
        self.assertIsNone(adapter)
        with tempfile.TemporaryDirectory() as directory:
            adapter, status = load_selected_release("reviewed-candidate", registry=directory, factory=factory)
        self.assertIsNone(adapter)
        self.assertEqual(status["candidate_quality"], "no_selected_candidate")
        factory.assert_not_called()

    def test_selected_adapter_always_requires_review_and_exclusive_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            pointer = Path(directory) / "selected.json"
            pointer.write_text(json.dumps({"schema": 1, "scope": "candidate-only-not-production",
                                           "fingerprints": {"checkpoint_sha256": "abc"}}))
            factory = Mock(side_effect=ValueError("Exclusive backend unavailable"))
            with self.assertRaisesRegex(ValueError, "Exclusive backend"):
                load_selected_release("reviewed-candidate", registry=directory, factory=factory)
            factory.assert_called_once_with(runtime_only=False, require_exclusive_backend=True)
            pointer.write_text("{tampered")
            with self.assertRaises(ValueError):
                load_selected_release("reviewed-candidate", registry=directory, factory=factory)
            self.assertEqual(factory.call_count, 1)

    def test_invalid_selected_startup_never_falls_back_and_fails_readiness(self):
        tree = ast.parse((ROOT / "server.py").read_text())
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_init_ai_model")
        legacy = Mock(side_effect=AssertionError("Fallback prohibited"))
        scope = {"os": os, "_init_legacy_ai_model": legacy, "_model_ready": True}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "server.py", "exec"), scope)
        with patch.dict(os.environ, {"MAXCORE_SERVING_RELEASE": "reviewed-candidate"}):
            with patch("ai_model.generation.release.load_selected_release", side_effect=ValueError("Tampered reviewed candidate")):
                scope["_init_ai_model"]()
        legacy.assert_not_called()
        self.assertFalse(scope["_model_ready"])
        self.assertIsNone(scope["_serving_release_status"]["active"])
        self.assertEqual(scope["_serving_release_status"]["candidate_quality"], "blocked")
        self.assertIn("Tampered", scope["_model_init_error"])

    def test_release_metadata_comes_from_current_adapter_not_greedy_constants(self):
        model = SimpleNamespace(architecture="byte-causal-transformer-v1",
                                tokenizer=None, context=128)
        adapter = CandidateServingAdapter(model, runtime_only=False, training_exclusive=True)
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "selected.json").write_text(json.dumps({
                "schema": 1, "scope": "candidate-only-not-production",
                "fingerprints": {"checkpoint_sha256": "reviewed-test-identity"}}))
            serving, status = load_selected_release(
                "reviewed-candidate", registry=directory, factory=lambda **kwargs: adapter)
        self.assertEqual(status["sampling_defaults"]["top_p"], .92)
        self.assertIn("seed", status["supported_sampling"])
        self.assertEqual(status["context_tokens"], 128)
        self.assertTrue(status["inference_backend_exclusive"])
        self.assertTrue(status["training_backend_exclusive"])
        self.assertEqual(status["agent_pipeline"], "adapter_validated_no_fallback")

    def test_adapter_preserves_current_stochastic_sampling_parameters(self):
        model = Mock()
        model.generate.return_value = {"text": "continuation"}
        adapter = CandidateServingAdapter(model, runtime_only=False)
        output = adapter.generate("prompt", max_new_tokens=12, temperature=.8,
                                  top_p=.92, top_k=20, repetition_penalty=1.1,
                                  min_length=3, seed=42)
        self.assertEqual(output, "promptcontinuation")
        model.generate.assert_called_once_with(
            "prompt", 12, temperature=.8, top_p=.92, top_k=20,
            repetition_penalty=1.1, min_length=3, seed=42)
        with self.assertRaises(TypeError):
            adapter.generate("prompt", unsupported_sampling=True)

    def test_actual_context_limit_rejects_full_prompt_without_compute(self):
        from ai_model.model.candidate_model import CandidateModel
        from ai_model.model.candidate_tokenizer import CandidateByteTokenizer
        model = SimpleNamespace(context=128, tokenizer=CandidateByteTokenizer(),
                                architecture="byte-causal-transformer-v1", backend=Mock())
        model.generate = MethodType(CandidateModel.generate, model)
        adapter = CandidateServingAdapter(model, runtime_only=False)
        with self.assertRaisesRegex(ValueError, "no prompt truncation"):
            adapter.generate("x" * 129, max_new_tokens=1, temperature=.8, top_p=.92)
        model.backend.dispatch.assert_not_called()

    def test_blocked_selected_release_health_returns_503(self):
        import time
        tree = ast.parse((ROOT / "server.py").read_text())
        node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "health")
        node.decorator_list = []
        scope = {"time": time, "_serving_release_status": {"candidate_quality": "blocked"},
                 "_model_ready": False, "_start_time": time.time(), "_warm_status": {},
                 "_get_storage_mode": lambda: "offline"}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "server.py", "exec"), scope)
        response = asyncio.run(scope["health"]())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.body)["status"], "unready")


if __name__ == "__main__":
    unittest.main()