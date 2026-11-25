import base64
import copy
import io
import json
import subprocess
from unittest.mock import patch
import pytest
from PIL import Image
from .production import validate_production
from .controls import render_video, validate_video
from . import cinematic_engine, scenes
from ai_model.generation.metadata import without_inline_media


def project():
    return {"version": 1, "scenes": [
        {"text": "It's 100% yours: [release]", "duration_sec": 1},
        {"text": "Listen today", "duration_sec": 2}],
        "transition": "fade", "color_grade": "none"}


def picture():
    output = io.BytesIO()
    Image.new("RGB", (64, 64), "red").save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode()


@pytest.mark.parametrize("change", [
    {"version": True}, {"scenes": []}, {"transition": "unknown"},
    {"unknown": True}, {"logo_b64": "invalid"},
    {"narration": {"text": "Hello", "voice": "unknown", "wpm": 150}},
    {"music": {"bpm": 120, "key": "wrong", "instrument": "piano", "arrangement": "loop"}},
    {"scenes": [{"text": "", "duration_sec": 3}]},
    {"scenes": [{"text": "Hello", "duration_sec": float("nan")}]},
])
def test_invalid_production_rejected(change):
    with pytest.raises(ValueError):
        validate_production({**project(), **change}, 3, 24)


def test_metadata_omits_source_bytes_without_mutating_input():
    source = project()
    source["scenes"][0]["image_b64"] = picture()
    before = copy.deepcopy(source)
    safe = without_inline_media(source)
    assert source == before
    assert picture() not in json.dumps(safe)
    assert safe["scenes"][0]["image_b64"]["encoded_length"] == len(picture())


def test_real_composition_with_image_logo_music_and_exact_timing(tmp_path, monkeypatch):
    monkeypatch.setattr(cinematic_engine, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(scenes, "TEMP_DIR", str(tmp_path / "scratch"))
    rendered_scenes = []
    original = cinematic_engine.render_cinematic_open
    def capture(scene_list, *args, **kwargs):
        rendered_scenes.extend(scene_list)
        return original(scene_list, *args, **kwargs)
    monkeypatch.setattr(cinematic_engine, "render_cinematic_open", capture)
    source = project()
    source["scenes"][0]["image_b64"] = picture()
    source["logo_b64"] = picture()
    source["music"] = {"bpm": 120, "key": "C minor", "instrument": "piano", "arrangement": "loop"}
    result = render_video(production=source, duration_sec=3, width=128, height=96, fps=24)
    assert result.success
    assert rendered_scenes[0].duration == 1.25  # includes the 6-frame outgoing overlap
    assert rendered_scenes[1].duration == 2
    assert rendered_scenes[1].reference_b64 is None  # no inherited photo/text ghosting
    validate_video(result.file_path, 128, 96, 72, 24)
    info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", result.file_path]))
    assert any(s["codec_type"] == "audio" for s in info["streams"])


def test_requested_narration_never_silently_dropped():
    source = project()
    source["narration"] = {"text": "Hello", "voice": "en-us", "wpm": 160}
    with patch("ai_model.audio.voiceover.synthesize_voiceover", return_value=False):
        with pytest.raises(RuntimeError, match="narration"):
            render_video(production=source, duration_sec=3, width=128, height=96)


def test_real_narration_composition(tmp_path, monkeypatch):
    monkeypatch.setattr(cinematic_engine, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(scenes, "TEMP_DIR", str(tmp_path / "scratch"))
    source = project()
    source["narration"] = {"text": "Hello.", "voice": "en-us", "wpm": 160}
    result = render_video(production=source, duration_sec=3, width=128, height=96)
    assert result.success
    validate_video(result.file_path, 128, 96, 72, 24)
