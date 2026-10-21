"""Operational admission executes real agent guards without training fixtures."""
from unittest.mock import Mock
import unittest
from ai_model.generation.capability import verify_text_capability
from ai_model.generation.plan import active_plan
from ai_model.generation.release import load_selected_release
import json
from pathlib import Path
import tempfile


class GenerationCapabilityTests(unittest.TestCase):
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
