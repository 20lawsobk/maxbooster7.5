"""Cheap duration/transition regression checks; no model or video inference."""
import unittest
import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

from .ai_scene_builder import allocate_durations
from .cinematic_engine import render_cinematic_open
from .scenes import SceneConfig, _composite_xfade


class DurationContractTest(unittest.TestCase):
    def test_four_seconds_are_not_promoted_to_three_minimum_scenes(self):
        portions = allocate_durations(["hook", "body", "cta"], 4.0)
        self.assertAlmostEqual(sum(portions), 4.0)
        self.assertTrue(all(part > 0 for part in portions))

    def test_xfade_budget_and_reported_duration_are_measured(self):
        scenes = [SceneConfig(duration=2.5) for _ in range(3)]
        with (patch("ai_model.video.cinematic_engine.render_scene", side_effect=[
                  "one.mp4", "two.mp4", "three.mp4"]),
              patch("ai_model.video.cinematic_engine.RENDER_GATE") as gate,
              patch("ai_model.video.cinematic_engine.composite_scenes", return_value=True) as compose,
              patch("ai_model.video.cinematic_engine.cleanup_temp"),
              patch("ai_model.video.cinematic_engine._get_clip_duration", return_value=4.0),
              patch("ai_model.video.cinematic_engine.os.makedirs")):
            gate.capacity = 1
            result = render_cinematic_open(scenes, 320, 240, 4.0, transition_dur=.5)
        self.assertTrue(result.success)
        self.assertEqual(result.duration, 4.0)
        self.assertAlmostEqual(sum(s.duration for s in scenes) - 2 * .5, 4.0)
        self.assertEqual(compose.call_args.kwargs["target_duration"], 4.0)

    def test_one_frame_short_video_is_not_reported_as_four_seconds(self):
        with (patch("ai_model.video.cinematic_engine.render_scene", return_value="one.mp4"),
              patch("ai_model.video.cinematic_engine.RENDER_GATE") as gate,
              patch("ai_model.video.cinematic_engine.cleanup_temp"),
              patch("ai_model.video.cinematic_engine._get_clip_duration", return_value=3.958333),
              patch("ai_model.video.cinematic_engine.os.makedirs"),
              patch("ai_model.video.cinematic_engine.run_ffmpeg") as ffmpeg,
              patch("ai_model.video.cinematic_engine.os.remove")):
            gate.capacity = 1
            ffmpeg.return_value.returncode = 0
            result = render_cinematic_open([SceneConfig(duration=4.0)], 32, 32, 4.0)
        self.assertFalse(result.success)
        self.assertIn("3.958", result.error)

    def test_xfade_filter_has_frame_budget_and_audio_trim(self):
        class Completed:
            returncode = 0
        with (patch("ai_model.video.scenes._get_clip_duration", return_value=2.5),
              patch("ai_model.video.scenes.run_ffmpeg", return_value=Completed()) as ffmpeg):
            self.assertTrue(_composite_xfade(["a.mp4", "b.mp4"], "out.mp4",
                                              "fade", .5, "music.wav", "", 4.0))
        args = ffmpeg.call_args.args[0]
        self.assertIn("trim=end_frame=96", args[args.index("-filter_complex") + 1])
        self.assertIn("atrim=duration=4.000000", args[args.index("-af") + 1])

    def test_real_ffmpeg_video_stream_and_container_are_four_seconds(self):
        """Cheap 32px inputs expose final-packet / stream-duration errors."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            clips = []
            for i, count in enumerate((40, 40, 40)):
                path = root / f"scene{i}.mp4"
                subprocess.run([
                    "ffmpeg", "-v", "error", "-y", "-f", "lavfi",
                    "-i", f"color=c={'red' if i == 0 else 'blue'}:s=32x32:r=24",
                    "-frames:v", str(count), "-c:v", "libx264", "-pix_fmt",
                    "yuv420p", str(path),
                ], check=True, capture_output=True, timeout=15)
                clips.append(str(path))
            audio = root / "sound.wav"
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-f", "lavfi",
                "-i", "sine=frequency=220:sample_rate=48000:duration=4",
                "-c:a", "pcm_s16le", str(audio),
            ], check=True, capture_output=True, timeout=15)
            for music in (None, str(audio)):
                with self.subTest(with_audio=music is not None):
                    output = root / ("with_audio.mp4" if music else "video.mp4")
                    self.assertTrue(_composite_xfade(
                        clips, str(output), "fade", .5, music, "", 4.0, 24))
                    probe = subprocess.run([
                        "ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=duration,nb_frames,avg_frame_rate:format=duration",
                        "-of", "json", str(output),
                    ], check=True, capture_output=True, text=True, timeout=10)
                    info = json.loads(probe.stdout)
                    self.assertEqual(int(info["streams"][0]["nb_frames"]), 96)
                    self.assertAlmostEqual(float(info["streams"][0]["duration"]), 4.0, places=5)
                    self.assertAlmostEqual(float(info["format"]["duration"]), 4.0, places=5)


if __name__ == "__main__":
    unittest.main()