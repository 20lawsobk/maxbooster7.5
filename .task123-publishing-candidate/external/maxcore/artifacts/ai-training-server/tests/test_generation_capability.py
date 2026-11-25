"""Operational admission executes real agent guards without training fixtures."""
from unittest.mock import Mock, patch
import unittest
from ai_model.generation.capability import verify_text_capability
from ai_model.generation.plan import active_plan
from ai_model.generation.release import load_selected_release
import json
from pathlib import Path
import tempfile


class GenerationCapabilityTests(unittest.TestCase):
    def setUp(self):
        from ai_model.awareness import bind
        from test_generation_route_bindings import snapshot
        self.snapshot = snapshot()
        self.enterContext(bind(self.snapshot))

    def test_missing_awareness_is_retryable_and_never_probes_an_unconditioned_model(self):
        from ai_model.awareness import AwarenessUnavailable
        adapter = Mock()
        with patch("ai_model.awareness.current_snapshot", return_value=None):
            with self.assertRaises(AwarenessUnavailable):
                verify_text_capability(adapter)
        adapter.generate.assert_not_called()
        self.assertIsNone(active_plan.get())

    def test_rejects_empty_garble_metadata_and_missing_sections(self):
        for output in ("", "Artist: example\nStream now.", "a b c", "x" * 70,
                       "Here is a short hook. This is an actual music announcement."):
            with self.subTest(output=output):
                adapter = Mock()
                adapter.generate.return_value = output
                with self.assertRaisesRegex(ValueError, "operational text generation"):
                    verify_text_capability(adapter)
                self.assertIsNone(active_plan.get())

    def test_real_agent_accepts_complete_generated_sections_and_preserves_context(self):
        adapter = Mock()
        adapter.generate.return_value = (
            "<STAGE_HOOK>Hear the next chapter of my music."
            "<STAGE_BODY>A new single arrives this Friday with a fresh sound."
            "<STAGE_CTA>Save the release and share it with your friends.")
        result = verify_text_capability(adapter)
        self.assertTrue(result["passed"])
        self.assertEqual(result["cases"], 2)
        self.assertEqual(adapter.generate.call_count, 2)
        self.assertEqual(result["awareness"]["snapshot_id"], self.snapshot.id)
        for call in adapter.generate.call_args_list:
            self.assertEqual(call.kwargs["snapshot_hash"], self.snapshot.id)
        self.assertIsNone(active_plan.get())

    def test_unusable_public_selected_model_cannot_report_active_release(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "selected.json").write_text(json.dumps({
                "schema": 1, "scope": "candidate-only-not-production",
                "eligibility_policy": "certified-public-live-v1",
                "fingerprints": {"run": "/runs/live-fixture", "checkpoint_sha256": "abc"}}))
            adapter = Mock(runtime_only=False, backend_exclusive=True)
            adapter.generate.return_value = "Artist: fixture"
            with self.assertRaisesRegex(ValueError, "operational text generation"):
                load_selected_release("live-awareness", registry=directory,
                                      factory=lambda **kwargs: adapter)

    def test_a_scan_refresh_between_cases_cannot_change_the_pinned_probe(self):
        from ai_model.awareness import bound_snapshot
        from test_generation_route_bindings import snapshot
        changed = snapshot("new-scan")
        observed = []
        adapter = Mock()
        def generate(*args, **kwargs):
            observed.append((bound_snapshot().id, active_plan.get().snapshot_hash, kwargs['snapshot_hash']))
            return ("<STAGE_HOOK>Hear the next chapter of my music."
                    "<STAGE_BODY>A new single arrives this Friday with a fresh sound."
                    "<STAGE_CTA>Save the release and share it with your friends.")
        adapter.generate.side_effect = generate
        with patch('ai_model.awareness.engine.get_engine') as engine:
            engine.return_value.current_snapshot.return_value = changed
            result = verify_text_capability(adapter, snapshot=self.snapshot)
        self.assertEqual(observed, [(self.snapshot.id,) * 3] * 2)
        self.assertEqual(result['awareness']['snapshot_id'], self.snapshot.id)
        self.assertIsNone(active_plan.get())
