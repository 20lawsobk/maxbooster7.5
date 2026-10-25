import ast
from contextvars import copy_context
from concurrent.futures import ThreadPoolExecutor
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.generation.live_serving import LiveLearningLoop, LiveServingModel, LiveModelUnavailable
from ai_model.awareness.engine import Engine
from ai_model.awareness.test_engine import MemoryStore, sources


def release(identity):
    adapter = Mock(runtime_only=False, inference_backend_exclusive=True)
    adapter.generate.side_effect = lambda *args, **kwargs: identity
    return adapter, {"checkpoint_sha256": identity, "active": "reviewed-live-awareness"}


class LiveServingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.model = LiveServingModel()
        self.engine = Engine(sources=sources(), store=MemoryStore(), timeout=1)
        self.engine.refresh()
        self.now = 1000
        self.trainer = Mock(return_value={"status": "candidate_trained_unreviewed", "run_id": "live-test"})
        self.loader = Mock(return_value=(None, {}))

    def loop(self, **kwargs):
        return LiveLearningLoop(lambda: self.engine, self.model, Path(self.temp.name),
                                peak_content=False, interval=60, poll=1, trainer=self.trainer, loader=self.loader,
                                clock=lambda: self.now, **kwargs)

    def test_fresh_observations_train_but_cannot_promote_themselves(self):
        loop = self.loop()
        result = loop.tick()
        self.assertEqual(result["training"], "candidate_trained_unreviewed")
        pinned, steps = self.trainer.call_args.args
        self.assertTrue(pinned.training_observations()["records"])
        self.assertEqual(self.trainer.call_args.kwargs["context_tokens"], 1024)
        self.assertFalse(self.model.available)
        with self.assertRaises(LiveModelUnavailable):
            self.model.generate("prompt")
        self.assertNotIn('"text"', (Path(self.temp.name) / "live-learning.json").read_text())

    def test_selected_release_activates_even_while_training_is_on_cooldown(self):
        loop = self.loop()
        loop.tick()
        self.loader.return_value = release("accepted")
        loop.tick()
        self.assertEqual(self.model.generate("prompt"), "accepted")
        self.assertEqual(self.trainer.call_count, 1)

    def test_restart_and_timestamp_only_refresh_do_not_retrain_same_content(self):
        self.loop().tick()
        self.now += 61
        self.engine.refresh()
        result = self.loop().tick()
        self.assertEqual(result["training"], "unchanged_observations")
        self.assertEqual(self.trainer.call_count, 1)

    def test_restart_reports_retained_candidate_while_cooling_down(self):
        self.loop().tick()
        status = self.loop().tick()
        self.assertEqual(status["training"], "candidate_trained_unreviewed")
        self.assertEqual(status["last_run_id"], "live-test")
        self.assertEqual(self.trainer.call_count, 1)

    def test_interrupted_attempt_cannot_be_reported_as_success_after_restart(self):
        path = Path(self.temp.name) / "live-learning.json"
        path.write_text(json.dumps({"last_result": "running", "next_training_at": self.now + 60}))
        status = self.loop().tick()
        self.assertEqual(status["training"], "cooldown_after_interruption")
        self.trainer.assert_not_called()

    def test_blocked_training_rights_remains_honest_across_restart_and_cooldown(self):
        from ai_model.training.live_learning import Blocked
        self.trainer.side_effect = Blocked("blocked_training_rights", "Fixture rights not approved")
        self.assertEqual(self.loop().tick()["training"], "blocked_training_rights")
        state = json.loads((Path(self.temp.name) / "live-learning.json").read_text())
        self.assertEqual(state["last_result"], "blocked_training_rights")
        self.assertIsNone(state["last_run_id"])
        self.assertNotIn("trained_content_sha256", state)
        self.now += 10
        self.assertEqual(self.loop().tick()["training"], "blocked_training_rights")
        self.assertEqual(self.trainer.call_count, 1)
        self.assertFalse(self.model.available)

    def test_failed_worker_keeps_durable_cooldown_and_retries_later(self):
        self.trainer.return_value = {"status": "failed_training", "run_id": "live-failed"}
        self.loop().tick()
        self.loop().tick()
        self.assertEqual(self.trainer.call_count, 1)
        self.now += 61
        self.loop().tick()
        self.assertEqual(self.trainer.call_count, 2)

    def test_bad_selected_update_retains_the_previous_verified_model(self):
        self.model.install(*release("previous"))
        self.loader.side_effect = ValueError("Signature mismatch")
        status = self.loop().tick()
        self.assertEqual(status["release_error"], "ValueError")
        self.assertEqual(self.model.generate("prompt"), "previous")

    def test_observation_failure_does_not_stop_loading_reviewed_releases(self):
        self.loader.return_value = release("accepted")
        self.engine.training_observations = Mock(side_effect=RuntimeError("store offline"))
        status = self.loop().tick()
        self.assertEqual(status["training"], "blocked_execution")
        self.assertEqual(self.model.generate("prompt"), "accepted")
        self.trainer.assert_not_called()

    def test_two_owners_cannot_train_concurrently(self):
        entered, finish = threading.Event(), threading.Event()
        def training(*args, **kwargs):
            entered.set()
            self.assertTrue(finish.wait(5))
            return {"status": "candidate_trained_unreviewed", "run_id": "live-test"}
        self.trainer.side_effect = training
        first, second = self.loop(), self.loop()
        thread = threading.Thread(target=first.tick)
        thread.start()
        try:
            self.assertTrue(entered.wait(5))
            self.assertEqual(second.tick()["training"], "another_owner")
        finally:
            finish.set()
            thread.join(5)
        self.assertEqual(self.trainer.call_count, 1)

    def test_stop_prevents_new_training_and_activation(self):
        loop = self.loop()
        loop.stop()
        loop.tick()
        self.trainer.assert_not_called()
        self.loader.assert_not_called()

    def test_inflight_requests_and_executor_threads_pin_the_old_release(self):
        self.model.install(*release("old"))
        with self.model.pin() as status:
            self.model.install(*release("new"))
            self.assertEqual(status["checkpoint_sha256"], "old")
            self.assertEqual(self.model.generate("prompt"), "old")
            with ThreadPoolExecutor(max_workers=1) as pool:
                self.assertEqual(pool.submit(copy_context().run, self.model.generate, "prompt").result(), "old")
        self.assertEqual(self.model.generate("prompt"), "new")
        with self.assertRaisesRegex(LiveModelUnavailable, "different model"):
            with self.model.pin("old"):
                pass

    def test_runtime_only_adapter_is_never_activated(self):
        adapter, status = release("smoke")
        adapter.runtime_only = True
        with self.assertRaises(ValueError):
            self.model.install(adapter, status)
        self.assertFalse(self.model.available)

    def test_default_startup_uses_live_pipeline_without_legacy_checkpoint(self):
        tree = ast.parse((ROOT / "server.py").read_text())
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_init_ai_model")
        live = Mock()
        scope = {"os": os, "_init_live_awareness_model": live,
                 "_init_legacy_ai_model": Mock(side_effect=AssertionError("Legacy must stay unused"))}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "startup", "exec"), scope)
        with patch.dict(os.environ, {}, clear=True):
            scope["_init_ai_model"]()
        live.assert_called_once()
        scope["_init_legacy_ai_model"].assert_not_called()

    def test_expanded_context_is_stored_loaded_and_used_without_truncation(self):
        import torch
        from ai_model.model.candidate_model import CandidateModel, CandidateTransformer
        model = CandidateTransformer(context=256)
        archive = io.BytesIO()
        torch.save({"architecture": model.architecture, "smoke_only": True,
                    "context_tokens": 256, "state_dict": model.state_dict()}, archive)
        archive.seek(0)
        restored = CandidateModel.load_candidate(archive)
        self.assertEqual(restored.context, 256)
        result = restored.generate("a" * 200, max_new_tokens=1)
        self.assertIn("text", result)
        with self.assertRaisesRegex(ValueError, "exceeds"):
            restored.generate("a" * 256, max_new_tokens=1)

    def test_expanded_context_real_manual_training_survives_reload(self):
        from ai_model.training import candidate_lifecycle as lifecycle
        from ai_model.training.candidate_corpus import build_manifest
        from ai_model.model.candidate_model import CandidateModel
        manifest = build_manifest([{
            "text": "The observatory shares original music notes and measures audience response. " * 3,
            "license": "CC0-1.0", "private": False, "source": "authored:test",
            "author": "test author", "purpose": "smoke-only",
        }], [], smoke_only=True)
        with patch.object(lifecycle, "CANDIDATES", Path(self.temp.name) / "candidates"):
            report = lifecycle.train_validated("context-test", 1, 1729, "transformer", manifest,
                                               manual_backward=True, context_tokens=256)
            model = CandidateModel.load_candidate(lifecycle.CANDIDATES / "context-test/candidate.pt")
        self.assertEqual(model.context, 256)
        self.assertEqual(report["context_tokens"], 256)
        self.assertGreater(report["candidate_dispatch_counts"]["transformer_backward"], 0)
        self.assertTrue(report["protected_unchanged"])


if __name__ == "__main__":
    unittest.main()
