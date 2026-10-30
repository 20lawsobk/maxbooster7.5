"""Actual encoded-frame checks plus isolated continuity orchestration tests."""
import base64
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

from .scenes import SceneConfig, _extract_last_frame_b64
from .cinematic_engine import render_cinematic_open
from .video_agent import VideoAgent, VideoAgentRequest, VideoProduction


class FrameContinuityTests(unittest.TestCase):
    def test_direct_agent_seeds_first_scene_without_leaking_between_requests(self):
        agent = VideoAgent.__new__(VideoAgent)
        production = VideoProduction("tiktok", "9:16", 3, "", [],
                                     genre_detected="pop", tone_used="energetic")
        first = [SceneConfig(duration=1), SceneConfig(duration=2)]
        second = [SceneConfig(duration=1), SceneConfig(duration=2)]
        explicit = [SceneConfig(duration=1, reference_b64="explicit"), SceneConfig(duration=2)]
        with (patch.object(agent, "plan", return_value=production),
              patch.object(agent, "build_open_scenes", side_effect=[first, second, explicit]),
              patch("ai_model.video.video_agent.render_cinematic_open")):
            agent.render(VideoAgentRequest(idea="A new song", init_frame_b64="initial"))
            agent.render(VideoAgentRequest(idea="Another song"))
            agent.render(VideoAgentRequest(idea="A third song", init_frame_b64="initial"))
        self.assertEqual([s.reference_b64 for s in first], ["initial", None])
        self.assertEqual([s.reference_b64 for s in second], [None, None])
        self.assertEqual([s.reference_b64 for s in explicit], ["explicit", None])

    def test_exact_terminal_frame_at_low_and_high_frame_rates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for i, color in enumerate(["red", "green", "blue"]):
                Image.new("RGB", (32, 32), color).save(root / f"{i:02}.png")
            for fps in (8, 24, 30):
                with self.subTest(fps=fps):
                    video = root / f"clip-{fps}.mp4"
                    subprocess.run([
                        "ffmpeg", "-y", "-v", "error", "-framerate", str(fps),
                        "-i", str(root / "%02d.png"), "-c:v", "libx264rgb",
                        "-crf", "0", str(video),
                    ], check=True, capture_output=True, timeout=20)
                    result = Image.open(io.BytesIO(base64.b64decode(
                        _extract_last_frame_b64(str(video)))))
                    self.assertEqual(result.convert("RGB").getpixel((16, 16)), (0, 0, 255))

    def test_missing_video_is_an_explicit_failure(self):
        with self.assertRaisesRegex(RuntimeError, "final video frame"):
            _extract_last_frame_b64("/nonexistent/maxcore-test-video.mp4")

    def test_rolling_references_reach_each_scene_and_preserve_explicit_ones(self):
        for explicit in (None, "user-reference"):
            scenes = [SceneConfig(duration=1, reference_b64="seed"),
                      SceneConfig(duration=1, reference_b64=explicit or ""),
                      SceneConfig(duration=1)]
            seen = []
            def render(scene, *args):
                seen.append(scene.reference_b64)
                return f"scene-{len(seen)}.mp4"
            with (patch("ai_model.video.cinematic_engine.render_scene", side_effect=render),
                  patch("ai_model.video.cinematic_engine._extract_last_frame_b64",
                        side_effect=lambda path: "end-" + path) as extract,
                  patch("ai_model.video.cinematic_engine.composite_scenes", return_value=True),
                  patch("ai_model.video.cinematic_engine._get_clip_duration", return_value=3),
                  patch("ai_model.video.cinematic_engine.cleanup_temp"),
                  patch("ai_model.video.cinematic_engine.os.makedirs")):
                result = render_cinematic_open(scenes, 32, 32, 3)
            self.assertTrue(result.success, result.error)
            self.assertEqual(seen, ["seed", explicit or "end-scene-1.mp4", "end-scene-2.mp4"])
            self.assertEqual(extract.call_count, 1 if explicit else 2)

    def test_extraction_failure_stops_chain_and_cleans_partial_output(self):
        scenes = [SceneConfig(duration=1, reference_b64="seed"), SceneConfig(duration=1)]
        with (patch("ai_model.video.cinematic_engine.render_scene", return_value="first.mp4") as render,
              patch("ai_model.video.cinematic_engine._extract_last_frame_b64",
                    side_effect=RuntimeError("broken frame extraction")),
              patch("ai_model.video.cinematic_engine.composite_scenes") as compose,
              patch("ai_model.video.cinematic_engine.cleanup_temp") as cleanup,
              patch("ai_model.video.cinematic_engine.os.makedirs")):
            result = render_cinematic_open(scenes, 32, 32, 2)
        self.assertFalse(result.success)
        self.assertIn("broken frame extraction", result.error)
        self.assertEqual(render.call_count, 1)
        compose.assert_not_called()
        cleanup.assert_called_once_with(["first.mp4"])


if __name__ == "__main__":
    unittest.main()
