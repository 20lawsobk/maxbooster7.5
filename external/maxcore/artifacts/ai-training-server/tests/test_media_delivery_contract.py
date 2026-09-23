"""Isolated tests: no server startup, model loading, network, or live data."""
import ast
import base64
import errno
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
import uuid
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.media_contract import (
    render_with_budget, RenderCancelled, load_complete_checkpoint, require_audio_stream,
)
from ai_model.video.media_manifest import validate_manifest, audio_cut_times, apply_manifest
import ai_model.video.scenes as scene_module


def production_function_ast(path, name):
    """Return a production function's AST for side-effect-free contract checks."""
    tree = ast.parse(path.read_text())
    return next(n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                and n.name == name)


class RetryTests(unittest.TestCase):
    def test_transient_retry_then_success(self):
        render = Mock(side_effect=[OSError(errno.EBUSY, "busy"), {"url": "/real.wav"}])
        retry = Mock()
        self.assertEqual(render_with_budget(render, retry, sleep=lambda _: None)["url"], "/real.wav")
        self.assertEqual(render.call_count, 2)
        retry.assert_called_once()

    def test_exhaustion_is_terminal(self):
        render = Mock(side_effect=OSError(errno.EAGAIN, "busy"))
        with self.assertRaises(OSError):
            render_with_budget(render, Mock(), sleep=lambda _: None)
        self.assertEqual(render.call_count, 3)

    def test_deterministic_failure_not_retried(self):
        for error in (ValueError("bad input"), FileNotFoundError("missing dataset")):
            render = Mock(side_effect=error)
            with self.assertRaises(type(error)):
                render_with_budget(render, Mock())
            render.assert_called_once()

    def test_invalid_artifact_deadline_and_cancellation(self):
        with self.assertRaises(ValueError):
            render_with_budget(lambda: {}, Mock())
        with self.assertRaises(TimeoutError):
            render_with_budget(Mock(), Mock(), clock=Mock(side_effect=[0, 121]))
        render = Mock()
        with self.assertRaises(RenderCancelled):
            render_with_budget(render, Mock(), cancelled=lambda: True)
        render.assert_not_called()


class CheckpointTests(unittest.TestCase):
    def test_complete_and_prefixed(self):
        model = Mock()
        tensor = types.SimpleNamespace(shape=(2, 3))
        model.state_dict.return_value = {"weight": tensor}
        load_complete_checkpoint(model, {"_orig_mod.weight": tensor})
        model.load_state_dict.assert_called_once_with({"weight": tensor}, strict=True)

    def test_missing_shape_and_unexpected_rejected(self):
        model = Mock()
        model.state_dict.return_value = {"weight": types.SimpleNamespace(shape=(2, 3))}
        for state in (None, {}, {"other": types.SimpleNamespace(shape=(2, 3))},
                      {"weight": types.SimpleNamespace(shape=(3, 2))}):
            with self.assertRaises(ValueError):
                load_complete_checkpoint(model, state)
        model.load_state_dict.assert_not_called()


class AudioTests(unittest.TestCase):
    def test_xfade_maps_required_audio_explicitly(self):
        runner = Mock(return_value=types.SimpleNamespace(returncode=0))
        with patch.object(scene_module, "_get_clip_duration", return_value=3), \
                patch.object(scene_module, "run_ffmpeg", runner):
            with tempfile.NamedTemporaryFile() as audio:
                self.assertTrue(scene_module._composite_xfade(
                    ["one.mp4", "two.mp4"], "/tmp/out.mp4",
                    "dissolve", .25, audio.name, "",
                ))
        command = runner.call_args.args[0]
        self.assertIn("2:a:0", command)
        self.assertIn("apad", command)
        self.assertIn("5.75", command)

    def test_probe_rejects_silent_and_short_artifacts(self):
        with tempfile.NamedTemporaryFile() as artifact:
            for info in ({"streams": []}, {"streams": [{"duration": "1"}]}):
                with patch("ai_model.media_contract.subprocess.run",
                           return_value=types.SimpleNamespace(stdout=json.dumps(info))):
                    with self.assertRaises(ValueError):
                        require_audio_stream(artifact.name, minimum_duration=5)
            with patch("ai_model.media_contract.subprocess.run", return_value=types.SimpleNamespace(
                    stdout='{"streams":[{"duration":"5.0"}]}')):
                self.assertEqual(require_audio_stream(artifact.name, minimum_duration=5), 5)

    def test_narration_and_soundtrack_failure_propagate(self):
        source = ROOT / "server.py"
        voice = ast.unparse(production_function_ast(source, "_voiceover_track_path"))
        soundtrack = ast.unparse(production_function_ast(source, "_auto_soundtrack_path"))
        self.assertIn("Required narration", voice)
        self.assertIn("raise RuntimeError", voice)
        self.assertIn("Required soundtrack", soundtrack)
        self.assertIn("raise RuntimeError", soundtrack)


class ManifestTests(unittest.TestCase):
    def test_all_ten_images_reach_ordered_scene_references(self):
        from ai_model.video.ai_scene_builder import build_scenes
        refs = [f"image-{i}" for i in range(10)]
        scenes = build_scenes(
            scenes_data=[{"type": "body", "text": "User text"}],
            idea="music", genre="pop", tone="energetic", platform="tiktok",
            artist_name="", total_duration=30, width=64, height=64,
            reference_images=refs, camera_motion="static",
        )
        self.assertEqual([scene.reference_b64 for scene in scenes], refs)

    def test_manifest_validation(self):
        valid = {"version": 1, "beat_sync": False, "color_grade": "warm", "transition": "fade"}
        validate_manifest(valid)
        for delta in ({"version": 2}, {"color_grade": "fake"}, {"transition": "shell;"},
                      {"beat_sync": "true"}, {"logo_b64": "%%%"}):
            with self.assertRaises(ValueError):
                validate_manifest({**valid, **delta})

    def test_measured_audio_onsets(self):
        import numpy as np
        signal = np.zeros(8000 * 6, dtype="<f4")
        signal[8000 * 2:8000 * 2 + 160] = .8
        signal[8000 * 4:8000 * 4 + 160] = .8
        with patch("ai_model.video.media_manifest.subprocess.run",
                   return_value=types.SimpleNamespace(stdout=signal.tobytes())):
            self.assertEqual(audio_cut_times("owned.wav", 3, 6), [0, 2, 4, 6])
        with patch("ai_model.video.media_manifest.subprocess.run",
                   return_value=types.SimpleNamespace(stdout=np.zeros_like(signal).tobytes())):
            with self.assertRaises(ValueError):
                audio_cut_times("silent.wav", 3, 6)

    def test_manifest_controls_reach_scenes(self):
        voice = types.ModuleType("ai_model.audio.voiceover")
        voice.mix_voiceover_over_music = Mock()
        scenes = [types.SimpleNamespace() for _ in range(10)]
        manifest = {"version": 1, "beat_sync": False, "color_grade": "cool", "transition": "dissolve"}
        with patch.dict(sys.modules, {"ai_model.audio.voiceover": voice}):
            audio, receipt = apply_manifest(manifest, scenes, None, 20, "/tmp", "test")
        self.assertIsNone(audio)
        self.assertEqual(len(receipt["cut_times"]), 11)
        self.assertEqual(receipt["transition"], "dissolve")
        self.assertTrue(all(scene.color_grade == "cool" for scene in scenes))
        self.assertAlmostEqual(sum(s.duration for s in scenes) - 9 * .25, 20)

    def test_ten_real_images_condition_pixels(self):
        import numpy as np
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(scene_module, "TEMP_DIR", tmp):
                for index in range(10):
                    rgb = (index * 20, 30, 70)
                    buf = io.BytesIO()
                    Image.new("RGB", (8, 8), rgb).save(buf, format="PNG")
                    scene = types.SimpleNamespace(
                        reference_b64=base64.b64encode(buf.getvalue()).decode(),
                        color_grade="", film_grain_amount=0)
                    _, encoded, _ = scene_module._pil_bg_frame(scene, 8, 8)
                    self.assertEqual(tuple(np.array(Image.open(io.BytesIO(encoded)))[0, 0]), rgb)
                scene.reference_b64 = "not-valid-base64!"
                with self.assertRaises(ValueError):
                    scene_module._pil_bg_frame(scene, 8, 8)

    def test_logo_is_composited_into_real_pixels(self):
        from PIL import Image
        def encoded(color):
            buf = io.BytesIO()
            Image.new("RGB", (100, 100), color).save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode()
        with tempfile.TemporaryDirectory() as tmp:
            scene = types.SimpleNamespace(reference_b64=encoded("red"),
                                          logo_b64=encoded("blue"),
                                          color_grade="", film_grain_amount=0)
            with patch.object(scene_module, "TEMP_DIR", tmp):
                _, png, _ = scene_module._pil_bg_frame(scene, 100, 100)
            image = Image.open(io.BytesIO(png))
            self.assertEqual(image.getpixel((73, 9)), (0, 0, 255))
            self.assertEqual(image.getpixel((0, 0)), (255, 0, 0))


if __name__ == "__main__":
    unittest.main()