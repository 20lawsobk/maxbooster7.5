"""Checkpoint lifecycle tests, not evidence of learned visual quality."""
import tempfile
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import torch
from ai_model.video.diffusion import maxcore_diffusion as md
from ai_model.training.storage import diffusion_root
from ai_model.training.media_learning import media_learning_preflight


class DiffusionCheckpointTests(unittest.TestCase):
    def test_diffusion_honors_model_state_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": str(root)}):
                self.assertEqual(diffusion_root("/service"), root / "diffusion")
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": ""}):
                self.assertEqual(diffusion_root("/service"), Path("/service/uploads/diffusion"))
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": "relative/path"}):
                with self.assertRaises(ValueError):
                    diffusion_root("/service")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # Small genuine tensor modules isolate persistence from expensive inference.
        for name in ("MusicVAE", "TemporalDiT", "AwarenessConditioner"):
            p = patch.object(md, name, side_effect=lambda *a, **kw: torch.nn.Linear(2, 2))
            p.start()
            self.addCleanup(p.stop)
        p = patch.object(md, "CHECKPOINT_DIR", str(self.root))
        p.start()
        self.addCleanup(p.stop)
        for name in ("_pipeline", "_pipeline_source_signature"):
            p = patch.object(md, name, None)
            p.start()
            self.addCleanup(p.stop)

    def bundle(self):
        model = md.MaxCoreDiffusionPipeline(for_training=True)
        model.save_checkpoints()
        return model

    def test_absent_checkpoints_block_inference_without_allocating_models(self):
        with self.assertRaisesRegex(RuntimeError, "checkpoints missing"):
            md.MaxCoreDiffusionPipeline()
        md.MusicVAE.assert_not_called()

    def test_training_initialization_cannot_generate(self):
        model = md.MaxCoreDiffusionPipeline(for_training=True)
        with self.assertRaisesRegex(RuntimeError, "requires loaded"):
            model.generate("idea", "tiktok", "calm", "")

    def test_serving_refreshes_published_weights_without_mutating_old_requests(self):
        training = self.bundle()
        first = md._get_pipeline()
        original = first.vae.weight.detach().clone()
        with torch.no_grad():
            training.vae.weight.add_(1)
        training.save_checkpoints()
        second = md._get_pipeline()
        self.assertIsNot(first, second)
        self.assertTrue(torch.equal(first.vae.weight, original))
        self.assertTrue(torch.equal(second.vae.weight, training.vae.weight))
        self.assertIs(md._get_pipeline(), second)
        path = self.root / "diffusion.pt"
        invalid = torch.load(path, weights_only=True)
        del invalid["components"]["dit"]["bias"]
        torch.save(invalid, path)
        with self.assertRaises(RuntimeError):
            md._get_pipeline()

    def test_continuously_changing_checkpoints_never_publish_a_mixed_snapshot(self):
        self.bundle()
        with patch.object(md, "_checkpoint_signature", side_effect=range(6)):
            with self.assertRaisesRegex(RuntimeError, "changed repeatedly"):
                md._get_pipeline()
        self.assertIsNone(md._pipeline)

    def test_readiness_distinguishes_bundle_presence_from_training_evidence(self):
        state_root = self.root / "private"
        target = state_root / "diffusion"
        target.mkdir(parents=True)
        (target / "diffusion.pt").write_bytes(b"not a qualified model")
        with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": str(state_root)}):
            report = media_learning_preflight("video")
        self.assertTrue(all(c["present"] for c in report["checkpoints"]))
        self.assertTrue(all(c["storage_format"] == "atomic_bundle" for c in report["checkpoints"]))
        self.assertFalse(any(c["structure_verified"] for c in report["checkpoints"]))
        self.assertFalse(report["training_ready"])
        self.assertFalse(report["learned_generation_verified"])

    def test_atomic_bundle_roundtrip_preserves_all_components_and_eval_mode(self):
        original = self.bundle()
        restored = md.MaxCoreDiffusionPipeline()
        for name in ("vae", "dit", "conditioner"):
            self.assertFalse(getattr(restored, name).training)
            for key, value in getattr(original, name).state_dict().items():
                self.assertTrue(torch.equal(value, getattr(restored, name).state_dict()[key]))

    def test_invalid_reload_does_not_replace_any_live_component(self):
        self.bundle()
        active = md.MaxCoreDiffusionPipeline()
        before = [getattr(active, name) for name in ("vae", "dit", "conditioner")]
        path = self.root / "diffusion.pt"
        state = torch.load(path, weights_only=True)
        del state["components"]["dit"]["bias"]
        torch.save(state, path)
        with self.assertRaises(RuntimeError):
            active._try_load_checkpoints()
        self.assertEqual(before, [getattr(active, name) for name in ("vae", "dit", "conditioner")])

    def test_failed_save_keeps_previous_bundle_and_removes_temporary_files(self):
        model = self.bundle()
        before = (self.root / "diffusion.pt").read_bytes()
        with patch.object(torch, "save", side_effect=OSError("disk write failed")):
            with self.assertRaises(OSError):
                model.save_checkpoints()
        self.assertEqual((self.root / "diffusion.pt").read_bytes(), before)
        self.assertEqual([p.name for p in self.root.iterdir()], ["diffusion.pt"])

    def test_nonfinite_parameters_and_unknown_schema_are_rejected(self):
        self.bundle()
        path = self.root / "diffusion.pt"
        state = torch.load(path, weights_only=True)
        state["components"]["vae"]["weight"][0, 0] = float("nan")
        torch.save(state, path)
        with self.assertRaisesRegex(ValueError, "Nonfinite"):
            md.MaxCoreDiffusionPipeline()
        state["schema"] = 99
        torch.save(state, path)
        with self.assertRaisesRegex(ValueError, "schema"):
            md.MaxCoreDiffusionPipeline()

    def test_legacy_set_requires_all_parameters(self):
        source = md.MaxCoreDiffusionPipeline(for_training=True)
        for name in ("vae", "dit", "conditioner"):
            torch.save(getattr(source, name).state_dict(), self.root / (name + ".pt"))
        self.assertTrue(md.MaxCoreDiffusionPipeline()._checkpoint_loaded)
        (self.root / "dit.pt").unlink()
        with self.assertRaisesRegex(RuntimeError, "dit"):
            md.MaxCoreDiffusionPipeline()

    def test_serving_errors_are_not_converted_to_empty_frames(self):
        self.bundle()
        model = md.MaxCoreDiffusionPipeline()
        with patch.object(model, "_generate_inner", side_effect=RuntimeError("kernel failed")):
            with self.assertRaisesRegex(RuntimeError, "kernel failed"):
                model.generate("idea", "tiktok", "calm", "")
        with patch.object(md, "_pipeline", None):
            (self.root / "diffusion.pt").unlink()
            with self.assertRaisesRegex(RuntimeError, "checkpoints missing"):
                md.get_diffusion_frame("idea", "tiktok", "calm", "")
            self.assertIsNone(md._pipeline)

    def test_request_inputs_reach_conditioner_alongside_live_context(self):
        self.bundle()
        model = md.MaxCoreDiffusionPipeline()
        # Stop at the conditioning boundary; this is routing evidence, not an
        # assertion that fixture parameters generate a meaningful video.
        with patch.object(model.conditioner, "encode", create=True,
                          side_effect=RuntimeError("conditioning observed")) as encode:
            with self.assertRaisesRegex(RuntimeError, "conditioning observed"):
                model.generate("jazz concert", "youtube", "cinematic", "[HIGH] new music")
        self.assertEqual(encode.call_args.args[0],
                         "jazz concert\nyoutube\ncinematic\n[HIGH] new music")


if __name__ == "__main__":
    unittest.main()
