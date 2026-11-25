import pytest
from . import cinematic_engine, scenes
from .controls import render_video, validate_video
from ai_model.gpu.media_kernels import media_gpu


@pytest.mark.parametrize("fps", [8, 16, 24, 30])
def test_real_procedural_clip_decodes(tmp_path, monkeypatch, fps):
    monkeypatch.setattr(cinematic_engine, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(scenes, "TEMP_DIR", str(tmp_path / "temp"))
    before = media_gpu().backend.snapshot().get("gradient_rgb", 0)
    result = render_video(duration_sec=.5, width=64, height=48, fps=fps,
                          background="solid", continuity="single_scene")
    stream = validate_video(result.file_path, 64, 48, fps // 2, fps)
    assert int(stream["nb_read_frames"]) == fps // 2
    assert media_gpu().backend.snapshot()["gradient_rgb"] > before


@pytest.mark.parametrize("control", [
    {"subject": "dancing person"}, {"reference": "person.png"},
    {"style": "photorealistic"}, {"continuity": "character_identity"},
    {"width": 65}, {"fps": 25},
])
def test_unsupported_video_fails(control):
    with pytest.raises(ValueError):
        render_video(**control)


def test_real_storyboard_preserves_total_frames(tmp_path, monkeypatch):
    monkeypatch.setattr(cinematic_engine, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(scenes, "TEMP_DIR", str(tmp_path / "temp"))
    result = render_video(duration_sec=1.1, width=128, height=96, fps=24,
                          continuity="storyboard",
                          scene_headlines=["New release", "Original music", "Listen now"])
    stream = validate_video(result.file_path, 128, 96, 26, 24)
    assert int(stream["nb_read_frames"]) == 26


@pytest.mark.parametrize("controls", [
    {"scene_headlines": ["One"]},
    {"scene_headlines": ["One", ""]},
    {"scene_headlines": ["One", 2]},
    {"scene_headlines": ["One"] * 9},
    {"scene_headlines": ["One", "Two"], "headline": "Discarded"},
    {"scene_headlines": ["One", "Two"], "duration_sec": 61},
    {"scene_headlines": ["One", "Two", "Three"], "duration_sec": .05, "fps": 8},
])
def test_invalid_storyboard_rejected(controls):
    with pytest.raises(ValueError):
        render_video(continuity="storyboard", **controls)