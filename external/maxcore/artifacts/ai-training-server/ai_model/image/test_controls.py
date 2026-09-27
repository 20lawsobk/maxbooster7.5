import pytest
import numpy as np
from PIL import Image
from . import image_engine
from .controls import render_image
from ai_model.gpu.media_kernels import media_gpu


def test_dedicated_poster_dimensions_and_real_decode(tmp_path, monkeypatch):
    monkeypatch.setattr(image_engine, "_UPLOADS_DIR", tmp_path)
    before = media_gpu().backend.snapshot()
    result = render_image(headline="New EP", width=320, height=240, seed=7)
    with Image.open(tmp_path / result.filename) as image:
        image.load()
        assert image.size == (320, 240)
    after = media_gpu().backend.snapshot()
    assert after["gradient_rgb"] > before.get("gradient_rgb", 0)
    assert after["grain_rgb"] > before.get("grain_rgb", 0)
    other = render_image(headline="New EP", width=320, height=320, seed=7)
    assert result.filename != other.filename


@pytest.mark.parametrize("control", [
    {"subject": "a cat"}, {"reference": "photo.png"}, {"style": "photorealistic"},
    {"mode": "text_to_image"}, {"color_scheme": "unknown"},
])
def test_unsupported_is_not_a_poster(control):
    with pytest.raises(ValueError):
        render_image(**control)


@pytest.mark.parametrize("size", [(32, 32), (64, 64), (32, 64), (64, 32)])
def test_real_compact_poster_exports_exact_dimensions(tmp_path, monkeypatch, size):
    monkeypatch.setattr(image_engine, "_UPLOADS_DIR", tmp_path)
    result = render_image(headline="New EP tonight", width=size[0], height=size[1], seed=19)
    assert result.success
    assert (result.width, result.height) == size
    with Image.open(tmp_path / result.filename) as image:
        image.load()
        assert image.size == size
        assert image.format == "PNG"
        compact = image.copy()
    # Same proportional layout/seed must downsample to precisely these pixels,
    # proving that labels, borders and headline were all part of the export.
    scale = max(1, (320 + size[0] - 1) // size[0], (240 + size[1] - 1) // size[1])
    full_size = (size[0] * scale, size[1] * scale)
    full = render_image(headline="New EP tonight", width=full_size[0],
                        height=full_size[1], seed=19)
    with Image.open(tmp_path / full.filename) as image:
        expected = image.resize(size, Image.Resampling.LANCZOS)
        assert compact.tobytes() == expected.tobytes()


@pytest.mark.parametrize("size", [32, 64])
def test_compact_supplied_background_is_not_forced_through_typography(tmp_path, monkeypatch, size):
    monkeypatch.setattr(image_engine, "_UPLOADS_DIR", tmp_path)
    result = render_image(width=size, height=size, mode="supplied_background",
                          background=np.full((16, 16, 3), 90, dtype=np.uint8))
    with Image.open(tmp_path / result.filename) as image:
        image.load()
        assert image.size == (size, size)
        assert np.all(np.asarray(image) == 90)