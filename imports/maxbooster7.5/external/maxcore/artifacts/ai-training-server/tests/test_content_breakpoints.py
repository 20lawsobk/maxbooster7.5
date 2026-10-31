"""Failure-boundary tests: invalid requests must stop before expensive work."""
from unittest.mock import patch
import pytest
from ai_model.capabilities import finite_number
from ai_model.generation.social_controls import _clip_words, apply_social_controls, SocialGenerationControls
from ai_model.image.controls import render_image
from ai_model.audio.controls import render_audio
from ai_model.video.controls import render_video
import numpy as np
import wave
from ai_model.audio.controls import validate_audio


@pytest.mark.parametrize("limit", [0, 1, 2, 5, 160, 300])
@pytest.mark.parametrize("text", ["x" * 1001, "🎶" * 1001, "long words " * 200])
def test_text_limits_include_ellipsis_and_unbroken_tokens(limit, text):
    assert len(_clip_words(text, limit)) <= limit


def test_final_caption_respects_short_limit_even_with_long_hook():
    result = apply_social_controls(hook="x" * 400, body="Body", cta="Listen.",
        hashtags=[], topic="Music", controls=SocialGenerationControls(caption_length="short"))
    assert len(result["caption"]) <= 160


def test_extreme_integer_is_a_validation_error_not_overflow():
    with pytest.raises(ValueError):
        finite_number(10 ** 1000, "width", 32, 4096)


@pytest.mark.parametrize("controls", [
    {"headline": ["invalid"]}, {"headline": "x" * 281}, {"headline": "nul\x00text"},
    {"seed": True}, {"seed": -1}, {"seed": 2**32},
    {"color_scheme": []}, {"mode": {}}, {"img_format": []},
    {"headline": "\ud800"}, {"headline": "control\u0085text"},
])
def test_image_rejects_malformed_controls_before_rendering(controls):
    with patch("ai_model.image.image_engine.ImageEngine.render",
               side_effect=AssertionError("expensive image render reached")):
        with pytest.raises(ValueError):
            render_image(**controls)


@pytest.mark.parametrize("controls", [
    {"key": None}, {"key": ["C", "minor"]}, {"genre": ["jazz"]},
    {"mood": {}}, {"instrument": []}, {"arrangement": {}},
    {"duration_sec": 300, "sample_rate": 96000},
])
def test_audio_rejects_malformed_or_overbudget_requests_before_synthesis(tmp_path, controls):
    with patch("ai_model.audio.controls.render_full_track",
               side_effect=AssertionError("expensive synthesis reached")):
        with pytest.raises(ValueError):
            render_audio(tmp_path / "output.wav", job_id="boundary", **controls)
    assert not (tmp_path / "output.wav").exists()


@pytest.mark.parametrize("controls", [
    {"headline": 12}, {"headline": "x" * 281}, {"headline": "nul\x00text"},
    {"color1": []}, {"background": {}}, {"fps": 24.0},
    {"width": 1920, "height": 1920, "fps": 30, "duration_sec": 300},
    {"continuity": "storyboard", "scene_headlines": ["Valid", "nul\x00text"]},
])
def test_video_rejects_malformed_or_overbudget_requests_before_encoding(controls):
    with patch("ai_model.video.controls.render_cinematic_open",
               side_effect=AssertionError("expensive video render reached")):
        with pytest.raises(ValueError):
            render_video(**controls)


def test_oversized_source_image_rejected_without_allocating_full_pixels():
    large_view = np.broadcast_to(np.zeros((1, 1, 3), dtype=np.uint8), (4097, 4096, 3))
    with patch("ai_model.image.image_engine.ImageEngine.render",
               side_effect=AssertionError("expensive image render reached")):
        with pytest.raises(ValueError, match="pixel budget"):
            render_image(mode="supplied_background", background=large_view)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_synth_output_never_written(tmp_path, value):
    path = tmp_path / "output.wav"
    with patch("ai_model.audio.controls.render_full_track",
               return_value=np.full((400, 2), value)):
        with pytest.raises(ValueError, match="non-finite"):
            render_audio(path, job_id="boundary", duration_sec=.05, sample_rate=8000)
    assert not path.exists()


@pytest.mark.parametrize("value", [0, 123, 32767])
def test_valid_wav_header_does_not_hide_silence_or_dc_output(tmp_path, value):
    path = tmp_path / "output.wav"
    with wave.open(str(path), "wb") as output:
        output.setparams((2, 2, 8000, 400, "NONE", "not compressed"))
        output.writeframes(np.full((400, 2), value, dtype="<i2").tobytes())
    with pytest.raises(ValueError, match="no varying audio signal"):
        validate_audio(path, duration_sec=.05, sample_rate=8000)
