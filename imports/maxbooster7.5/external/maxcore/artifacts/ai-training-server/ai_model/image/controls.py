"""Explicit poster/compositor API; never pass a subject prompt off as artwork."""
from PIL import Image
import numpy as np
from ai_model.capabilities import dimensions, reject_semantic_controls
from . import image_engine as engine


def render_image(*, headline="", width=1080, height=1080, mode="poster",
                 color_scheme="dark_neon", background=None, seed=None,
                 img_format="png", subject=None, reference=None, style=None):
    reject_semantic_controls(subject=subject, reference=reference, style=style)
    width, height = dimensions(width, height)
    if mode not in ("poster", "supplied_background"):
        raise ValueError("Only poster and supplied_background image modes are supported")
    if (mode == "supplied_background") != (background is not None):
        raise ValueError("supplied_background mode requires actual decoded background pixels")
    if background is not None:
        if (not isinstance(background, np.ndarray) or background.dtype != np.uint8
                or background.ndim != 3 or background.shape[2] != 3
                or min(background.shape[:2]) < 1):
            raise ValueError("background must be a nonempty HxWx3 uint8 RGB array")
    if color_scheme not in engine.COLOR_SCHEMES:
        raise ValueError(f"Unsupported color_scheme: {color_scheme}")
    if img_format not in ("png", "jpg", "jpeg", "webp"):
        raise ValueError(f"Unsupported image format: {img_format}")
    request = engine.ImageRequest(
        prompt=headline, headline=headline, width=width, height=height,
        color_scheme=color_scheme, background=background,
        suppress_text=mode == "supplied_background", seed=seed,
        img_format=img_format)
    # Background pixels are not part of the legacy cache key.
    if background is not None:
        request.seed = None
    result = engine.ImageEngine().render(request)
    if not result.success:
        raise ValueError(result.error)
    validate_image(engine._UPLOADS_DIR / result.filename, width, height)
    return result


def validate_image(path, width, height):
    with Image.open(path) as image:
        image.load()
        if image.size != (width, height):
            raise ValueError("Decoded image dimensions differ from request")
        return {"width": image.width, "height": image.height, "format": image.format}