"""Lightweight regression checks: no model inference or GPU needed."""
import numpy as np
import pytest
from PIL import Image, ImageDraw

from ai_model.image import image_engine as ie
from ai_model.rta.image.scene_builder import build_scene


def test_typographic_poster_still_renders_release_text(tmp_path, monkeypatch):
    monkeypatch.setattr(ie, "_UPLOADS_DIR", tmp_path)
    monkeypatch.setitem(ie.PLATFORM_DIMS, "test_square", (320, 320))
    engine = ie.ImageEngine()
    base = dict(layout="test_square", headline="New EP tonight", seed=21)
    release = engine.render(ie.ImageRequest(prompt="New EP release tonight", **base))
    other = engine.render(ie.ImageRequest(prompt="Lanterns reflected in harbor", **base))
    assert release.success and other.success
    assert release.renderer == "pil-typographic-poster-v1"
    with Image.open(tmp_path / release.filename) as a, Image.open(tmp_path / other.filename) as b:
        assert a.size == (320, 320)
        # A prompt does not magically become painted scene geometry.
        # Both posters share the same seed, headline and layout.
        assert np.array_equal(np.asarray(a), np.asarray(b))


def test_artwork_only_without_rendered_background_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(ie, "_UPLOADS_DIR", tmp_path)
    engine = ie.ImageEngine()
    for prompt in ("Portrait of a violinist", "Paper lanterns on quiet harbor water"):
        unsupported = engine.render(ie.ImageRequest(prompt=prompt, suppress_text=True, seed=21))
        assert not unsupported.success
        assert "requires a subject-rendered background" in unsupported.error
        assert not list(tmp_path.iterdir())
    background = np.full((24, 24, 3), 90, dtype=np.uint8)
    monkeypatch.setitem(ie.PLATFORM_DIMS, "test_square", (320, 320))
    supported = engine.render(ie.ImageRequest(
        prompt="Supplied artwork", layout="test_square", background=background,
        suppress_text=True))
    assert supported.success
    assert supported.renderer == "pil-composite-supplied-background-v1"
    with Image.open(tmp_path / supported.filename) as a:
        assert a.size == (320, 320)
        assert np.all(np.asarray(a) == 90)


def test_typography_fits_measured_width_and_rejects_unfittable_words():
    draw = ImageDraw.Draw(Image.new("RGB", (320, 320)))
    text = "Paper lanterns reflected in a quiet harbor"
    lines, font, _ = ie._fit_lines(draw, text, 260, 4, 38, 12)
    assert " ".join(lines) == text
    assert all(draw.textlength(line, font=font) <= 260 for line in lines)
    assert not ie._fit_lines(draw, "W" * 100, 260, 4, 38, 12)[0]


def test_rta_requires_subject_and_rejects_unrepresentable_scene():
    with pytest.raises(ValueError, match="cannot be represented"):
        build_scene(prompt="Lanterns reflected in harbor water")
    with pytest.raises(ValueError, match="sphere/plane"):
        build_scene(prompt="abstract spheres and water")
    scene = build_scene(prompt="abstract spheres", color_scheme="warm_earth")
    assert len(scene.spheres) > 0
    plane = build_scene(prompt="abstract ground plane", color_scheme="warm_earth")
    assert plane.plane is not None
    assert len(plane.spheres) == 2  # light sources, no invented hero spheres
    assert scene.spheres[0].material.albedo != build_scene(
        prompt="abstract spheres", color_scheme="corporate_blue").spheres[0].material.albedo