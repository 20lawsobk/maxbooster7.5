"""
MaxBooster Image Engine
=======================
Renders platform-sized promotional images entirely in-house using PIL.
No external AI APIs required — powered by:
  - VisualSpecAgent (in-house transformer) for concept generation
  - NumPy gradient fills for cinematic backgrounds
  - PIL for typography, layout, and decorative elements
"""
from __future__ import annotations

import hashlib
import os
import re
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter  # noqa: F401
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

# ─── Constants ────────────────────────────────────────────────────────────────

_FONT_BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_FONT_NORMAL = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

PLATFORM_DIMS: dict[str, Tuple[int, int]] = {
    "square_1_1":        (1080, 1080),
    "vertical_9_16":     (1080, 1920),
    "landscape_16_9":    (1920, 1080),
    "landscape_2_1":     (1200,  600),
    "landscape_1200x627":(1200,  627),
}

# Each color scheme: (grad_top_RGB, grad_bottom_RGB, accent_RGB, text_RGB)
COLOR_SCHEMES: dict[str, tuple] = {
    "dark_neon":       ((10,  0,  30), (0,  0,   0), (180,  0, 255), (255, 255, 255)),
    "vibrant_pastel":  ((255,200,220), (200,180,240), (255, 80, 160), ( 30,  10,  50)),
    "monochrome":      ((30,  30, 30), (0,   0,   0), (200, 200, 200), (255, 255, 255)),
    "high_contrast":   ((5,   5,  60), (0,   0,   0), ( 50, 120, 255), (255, 255, 255)),
    "corporate_blue":  ((10,  30, 80), (5,  15,  40), ( 80, 140, 255), (255, 255, 255)),
    "warm_earth":      ((60,  30,  10), (15,  5,   0), (210, 140,  50), (255, 240, 210)),
    "bold_red_gold":   ((60,   0,   0), (10,  0,   0), (220, 160,   0), (255, 255, 255)),
}

_DEFAULT_SCHEME = ("dark_neon", COLOR_SCHEMES["dark_neon"])

_UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "images"


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class ImageRequest:
    prompt: str
    color_scheme: str = "dark_neon"
    layout: str = "square_1_1"
    platform: str = "instagram"
    artist_name: str = "MaxBooster"
    intent: str = "promotional"
    style_tags: list = field(default_factory=lambda: ["cinematic"])
    # When set, renders deterministically (seeded grain + stable filename) so the
    # same request always yields identical pixels — used by the retrieval pipeline
    # for idempotent anchor/seed assets. Default None keeps legacy random behavior.
    seed: Optional[int] = None
    # Export container: "png" (default, lossless), "jpg"/"jpeg", or "webp".
    # Unknown values fall back to PNG. Drives both the file extension and encoder.
    img_format: str = "png"
    # Short, display-only text drawn as the on-image headline. `prompt` is the
    # (potentially long, brief-laden) generation/style description used for
    # meta/logging — it is never drawn onto the canvas directly. When empty,
    # falls back to a sanitized/truncated `prompt`.
    headline: str = ""
    # Optional pre-rendered background as an H×W×3 uint8 array (e.g. an RTA-1
    # path-traced hero image). When provided it replaces the procedural gradient
    # background; all accent bars, brackets and typography are still composited
    # on top, so the poster layout is preserved over real rendered pixels.
    background: Optional[np.ndarray] = None
    # When True, NO text is drawn on the canvas — no headline, no intent
    # sub-label. Used for cover art where the prompt string must never appear
    # as literal typography. Accent bars/dividers are also skipped so the
    # output is pure artwork.
    suppress_text: bool = False
    width: Optional[int] = None
    height: Optional[int] = None


@dataclass
class ImageResult:
    success: bool
    filename: str
    url: str
    width: int
    height: int
    color_scheme: str
    layout: str
    prompt_used: str
    error: str = ""
    renderer: str = ""


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_font(size: int, bold: bool = False) -> "ImageFont.FreeTypeFont":
    path = _FONT_BOLD if bold else _FONT_NORMAL
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _gradient_array(w: int, h: int, top: tuple, bottom: tuple) -> np.ndarray:
    """Create a vertical gradient as an H×W×3 uint8 array."""
    from ai_model.gpu.media_kernels import media_gpu
    return media_gpu().media("gradient_rgb", w, h, top, bottom)


def _add_noise_texture(arr: np.ndarray, strength: int = 12,
                       rng: Optional["np.random.RandomState"] = None) -> np.ndarray:
    """Light grain overlay for a film/cinematic feel."""
    from ai_model.gpu.media_kernels import media_gpu
    return media_gpu().media("grain_rgb", arr, strength, rng)


def _draw_gradient_bar(draw: "ImageDraw.Draw", x0: int, y0: int, x1: int, y1: int,
                       color_a: tuple, color_b: tuple, steps: int = 8):
    """Horizontal gradient bar (for accent strips)."""
    bar_w = x1 - x0
    seg = bar_w // steps
    for i in range(steps):
        t = i / (steps - 1) if steps > 1 else 0
        r = int(color_a[0] * (1 - t) + color_b[0] * t)
        g = int(color_a[1] * (1 - t) + color_b[1] * t)
        b = int(color_a[2] * (1 - t) + color_b[2] * t)
        draw.rectangle([x0 + i * seg, y0, x0 + (i + 1) * seg, y1], fill=(r, g, b))


def _wrap_text(text: str, max_chars: int) -> list[str]:
    # Retained for callers outside the renderer; canvas layout uses measured pixels.
    import textwrap
    return textwrap.wrap(text, width=max_chars)


def _fit_lines(draw, text: str, width: int, max_lines: int, largest: int,
               smallest: int, bold: bool = True):
    """Wrap at word boundaries using actual glyph widths, never cropping text."""
    for size in range(largest, smallest - 1, -1):
        font = _load_font(size, bold=bold)
        lines = []
        line = ""
        for word in text.split():
            if draw.textlength(word, font=font) > width:
                lines = []
                line = ""
                break
            candidate = f"{line} {word}".strip()
            if draw.textlength(candidate, font=font) <= width:
                line = candidate
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)
        if lines and len(lines) <= max_lines:
            return lines, font, size
    return [], _load_font(smallest, bold=bold), smallest


# Engineering-brief artifacts that must never reach an on-image headline —
# these come from `augmented_idea`/prompt-template scaffolding (e.g.
# "goal: drive_streams | audience: fans | themes: ...", "Focus: ..."),
# not from what a viewer should actually read on the asset.
_BRIEF_FIELD_RE = re.compile(
    r"\b(goal|audience|themes?|focus|tone|intent)\s*:\s*[^|.]*", re.IGNORECASE
)
_PIPE_SEP_RE   = re.compile(r"\s*\|\s*")
_SECRET_RE     = re.compile(r"\S{20,}")      # long opaque token ≈ id / hash / slug
_NUMBER_RE     = re.compile(r"\b\d{4,}\b")   # long bare numbers (ids), keep short ones
_STYLE_TAIL_RE = re.compile(
    r",?\s*(high-contrast and share-ready|capturing .*$|share-ready)\s*$",
    re.IGNORECASE,
)
_LEAD_PHRASE_RE = re.compile(
    r"^(bold|cinematic|eye-catching)\s+\S+\s+(cover art for|thumbnail for:?|visual for:?)\s*",
    re.IGNORECASE,
)
_HEADLINE_MAX_WORDS = 12


def _clean_headline(text: str, max_words: int = _HEADLINE_MAX_WORDS) -> str:
    """
    Sanitize arbitrary generation-prompt text into a short, safe on-image
    headline. Strips brief scaffolding (goal/audience/themes/focus), pipe
    separators, long opaque tokens (ids/hashes), decorative style suffixes,
    and caps length — mirroring the video overlay `_clean` pattern so no
    engineering metadata ever renders as visible text.
    """
    if not text:
        return ""
    t = _PIPE_SEP_RE.sub(" — ", text)
    t = _BRIEF_FIELD_RE.sub("", t)
    t = _LEAD_PHRASE_RE.sub("", t)
    t = _STYLE_TAIL_RE.sub("", t)
    t = _SECRET_RE.sub("", t)
    t = _NUMBER_RE.sub("", t)
    t = re.sub(r"\s+", " ", t).strip(" -—,.")
    if not t:
        return ""

    m = re.search(r"[.!?]", t)
    if m and m.start() > 3:
        t = t[: m.start() + 1].strip()

    words = t.split()
    if len(words) > max_words:
        t = " ".join(words[:max_words])

    return t.strip(" -—,.")


def _scheme_for(name: str) -> tuple:
    return COLOR_SCHEMES.get(name, COLOR_SCHEMES["dark_neon"])


# ─── Core renderer ────────────────────────────────────────────────────────────

# Per-output-key locks (module-level so EVERY ImageEngine instance in this
# process serializes on the same deterministic filename, not just one instance).
_KEY_LOCKS: Dict[str, threading.Lock] = {}
_KEY_LOCKS_GUARD = threading.Lock()


def _key_lock(key: str) -> threading.Lock:
    with _KEY_LOCKS_GUARD:
        lk = _KEY_LOCKS.get(key)
        if lk is None:
            lk = threading.Lock()
            _KEY_LOCKS[key] = lk
        return lk


def _valid_png(path: Path) -> bool:
    """True only if ``path`` is an existing, non-empty, decodable image. Never raises.

    Named for its original PNG-only use; now format-agnostic (PIL sniffs the
    encoding), so it also validates seeded JPEG/WebP reuse.
    """
    try:
        if not path.exists() or path.stat().st_size <= 0:
            return False
        if _PIL_OK:
            with Image.open(str(path)) as im:
                im.verify()
        return True
    except Exception:
        return False


# Map a requested export format to (PIL format, file extension, save kwargs).
# JPEG/WebP are the two other formats social platforms actually accept; anything
# unknown falls back to PNG so a bad `format` value can never fail a render.
_IMG_FORMATS: dict[str, tuple] = {
    "png":  ("PNG",  "png",  {"optimize": True}),
    "jpg":  ("JPEG", "jpg",  {"quality": 92, "optimize": True}),
    "jpeg": ("JPEG", "jpg",  {"quality": 92, "optimize": True}),
    "webp": ("WEBP", "webp", {"quality": 92, "method": 4}),
}


def _img_format_spec(fmt: Optional[str]) -> tuple:
    """Resolve a format string to (pil_format, ext, save_kwargs); defaults to PNG."""
    return _IMG_FORMATS.get((fmt or "png").lower().strip(), _IMG_FORMATS["png"])


class ImageEngine:
    def __init__(self):
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _seeded_fname(req: "ImageRequest") -> str:
        """Deterministic filename for a seeded request — identical req → identical file."""
        _pil_fmt, _ext, _ = _img_format_spec(req.img_format)
        key = "|".join([
            req.prompt, req.color_scheme, req.layout, req.platform,
            req.artist_name, req.intent, ",".join(req.style_tags), str(req.seed),
            _ext, req.headline, str(req.suppress_text),
            str(req.width), str(req.height),
        ])
        return f"seed_{hashlib.blake2b(key.encode(), digest_size=12).hexdigest()}.{_ext}"

    def render(self, req: ImageRequest) -> ImageResult:
        if not _PIL_OK:
            return ImageResult(
                success=False, filename="", url="", width=0, height=0,
                color_scheme=req.color_scheme, layout=req.layout,
                prompt_used=req.prompt, error="PIL not available",
            )

        w, h = PLATFORM_DIMS.get(req.layout, (1080, 1080))
        if req.width is not None or req.height is not None:
            from ai_model.capabilities import dimensions
            try:
                w, h = dimensions(req.width, req.height)
            except ValueError as exc:
                return ImageResult(
                    success=False, filename="", url="", width=0, height=0,
                    color_scheme=req.color_scheme, layout=req.layout,
                    prompt_used=req.prompt, error=str(exc))
        if req.suppress_text and req.background is None:
            return ImageResult(
                success=False, filename="", url="", width=w, height=h,
                color_scheme=req.color_scheme, layout=req.layout,
                prompt_used=req.prompt,
                error="Artwork-only rendering requires a subject-rendered background; PIL poster renderer cannot depict the requested subject",
            )

        # Seeded renders are deterministic: reuse the existing output if present,
        # and serialize concurrent identical seeds on a per-key lock so the same
        # pixels are never rendered twice in parallel. Unseeded renders are unique.
        try:
            return self._render_checked(req, w, h)
        except (ValueError, OSError) as exc:
            return ImageResult(
                success=False, filename="", url="", width=w, height=h,
                color_scheme=req.color_scheme, layout=req.layout,
                prompt_used=req.prompt, error=str(exc),
            )

    def _render_checked(self, req: ImageRequest, w: int, h: int) -> ImageResult:
        if req.seed is not None:
            fname = self._seeded_fname(req)
            out_path = _UPLOADS_DIR / fname
            with _key_lock(fname):
                # Reuse only a VALID prior render. A partial/zero-byte/corrupt
                # file (e.g. from an earlier crash) is re-rendered, so we always
                # degrade to pre-dedupe behavior rather than serve junk forever.
                if not _valid_png(out_path):
                    self._render_to_path(req, w, h, out_path)
        else:
            _pil_fmt, _ext, _ = _img_format_spec(req.img_format)
            fname = f"img_{uuid.uuid4().hex[:16]}.{_ext}"
            out_path = _UPLOADS_DIR / fname
            self._render_to_path(req, w, h, out_path)

        return ImageResult(
            success=True,
            filename=fname,
            url=f"/uploads/images/{fname}",
            width=w,
            height=h,
            color_scheme=req.color_scheme,
            layout=req.layout,
            prompt_used=req.prompt,
            renderer=("pil-composite-supplied-background-v1" if req.background is not None
                      else "pil-typographic-poster-v1"),
        )

    def _render_to_path(self, req: ImageRequest, w: int, h: int, out_path: Path) -> None:
        """Render the full composition for ``req`` at (w, h) and save it to ``out_path``."""
        output_size = (w, h)
        if not req.suppress_text:
            # Typography has a minimum useful layout canvas. Render the entire
            # composition at a proportional integer scale, then downsample
            # once; never just shrink the background or report fake dimensions.
            # Tiny exports are thumbnails, not a promise of readable small text.
            scale = max(1, (320 + w - 1) // w, (240 + h - 1) // h)
            w, h = w * scale, h * scale
        grad_top, grad_bot, accent, text_col = _scheme_for(req.color_scheme)
        is_portrait = h > w

        # ── Background: injected (RTA path-traced) or procedural gradient ───────
        rng = np.random.RandomState(req.seed) if req.seed is not None else None
        if req.background is not None:
            bg_in = np.asarray(req.background, dtype=np.uint8)
            bg_img = Image.fromarray(bg_in[:, :, :3], "RGB")
            if bg_img.size != (w, h):
                bg_img = bg_img.resize((w, h), Image.LANCZOS)
            img = bg_img.convert("RGB")
        else:
            bg_arr = _gradient_array(w, h, grad_top, grad_bot)
            bg_arr = _add_noise_texture(bg_arr, strength=10, rng=rng)
            img = Image.fromarray(bg_arr, "RGB")
        draw = ImageDraw.Draw(img)

        # ── Top accent bar ─────────────────────────────────────────────────────
        bar_h = max(6, h // 90)
        pad   = max(20, w // 40)
        span  = max(40, w // 18)
        thick = max(3, w // 270)
        if not req.suppress_text:
            # ── Bottom accent bar + corner brackets ───────────────────────────
            _draw_gradient_bar(draw, 0, 0, w, bar_h, accent, grad_top)
            _draw_gradient_bar(draw, 0, h - bar_h, w, h, grad_bot, accent)
            for (cx, cy, dx, dy) in [
                (pad, pad,             +1, +1),
                (w - pad, pad,         -1, +1),
                (pad, h - pad,         +1, -1),
                (w - pad, h - pad,     -1, -1),
            ]:
                # PIL needs [x0, y0, x1, y1] with x0 ≤ x1, y0 ≤ y1
                ax0, ax1 = sorted([cx, cx + dx * span])
                ay0, ay1 = sorted([cy, cy + dy * thick])
                draw.rectangle([ax0, ay0, ax1, ay1], fill=accent)
                bx0, bx1 = sorted([cx, cx + dx * thick])
                by0, by1 = sorted([cy, cy + dy * span])
                draw.rectangle([bx0, by0, bx1, by1], fill=accent)

        # ── Platform label (top-right) + artist badge (top-left) ──────────────
        if not req.suppress_text:
            plat_font_sz  = max(18, w // 52)
            plat_label    = req.platform.upper()
            plat_y        = pad + bar_h + 8
            label_width = max(20, (w - 3 * pad) // 2)
            plat_lines, plat_font, _ = _fit_lines(draw, plat_label, label_width, 1,
                                                  plat_font_sz, 10, False)
            if not plat_lines:
                raise ValueError("Platform label cannot fit without clipping")
            plat_label = plat_lines[0]
            plat_x = w - pad - draw.textlength(plat_label, font=plat_font)
            # Shadow
            draw.text((plat_x + 2, plat_y + 2), plat_label, font=plat_font,
                      fill=(0, 0, 0, 120))
            draw.text((plat_x, plat_y), plat_label, font=plat_font, fill=accent)

            badge_font_sz = max(16, w // 56)
            badge_label   = req.artist_name.upper()
            badge_lines, badge_font, _ = _fit_lines(draw, badge_label, label_width, 1,
                                                     badge_font_sz, 10)
            if not badge_lines:
                raise ValueError("Artist label cannot fit without clipping")
            badge_label = badge_lines[0]
            draw.text((pad + 4, plat_y + 2), badge_label, font=badge_font,
                      fill=(0, 0, 0, 120))
            draw.text((pad, plat_y), badge_label, font=badge_font, fill=text_col)

        # ── Central divider line ───────────────────────────────────────────────
        centre_y   = h // 2
        if not req.suppress_text:
            line_thick = max(2, h // 300)
            glow_color = tuple(min(255, int(c * 1.4)) for c in accent)
            draw.rectangle([pad * 3, centre_y - line_thick * 2,
                            w - pad * 3, centre_y + line_thick * 2],
                           fill=(*glow_color, 40))
            draw.rectangle([pad * 3, centre_y - line_thick // 2,
                            w - pad * 3, centre_y + line_thick // 2],
                           fill=accent)

        # ── Main headline text (above divider) ────────────────────────────────
        headline_font_sz = max(32, w // (22 if is_portrait else 28))
        # Always sanitize before drawing — `prompt` is a generation/style
        # description that may carry brief scaffolding (goal/audience/ids);
        # only the cleaned, short headline is ever rendered on-canvas.
        headline_text    = ("" if req.suppress_text
                            else _clean_headline(req.headline or req.prompt))
        left = pad + int(w * 0.05)
        lines, headline_font, headline_font_sz = _fit_lines(
            draw, headline_text, w - left - pad, 4, headline_font_sz, 12)
        if headline_text and not lines:
            raise ValueError("Headline cannot fit within the image without clipping")

        line_gap  = int(headline_font_sz * 1.25)
        block_h   = len(lines) * line_gap
        text_y    = max(pad + bar_h + int(h * .07),
                        centre_y - bar_h * 2 - block_h - int(h * 0.04))
        if headline_text and text_y + block_h >= centre_y - bar_h * 2:
            raise ValueError("Headline cannot fit above divider without clipping")

        for i, line in enumerate(lines):
            lx = left
            ly = text_y + i * line_gap
            # Drop shadow
            draw.text((lx + 3, ly + 3), line, font=headline_font,
                      fill=(0, 0, 0, 160))
            draw.text((lx, ly), line, font=headline_font, fill=text_col)

        # ── Sub-label (below divider) — intent tag ────────────────────────────
        if not req.suppress_text:
            sub_font_sz = max(20, w // 44)
            sub_label   = f"#{req.intent.upper()} • {' • '.join(t.upper() for t in req.style_tags[:3])}"
            sub_lines, sub_font, sub_font_sz = _fit_lines(
                draw, sub_label, w - left - pad, 1, sub_font_sz, 10, False)
            if not sub_lines:
                raise ValueError("Style label cannot fit without clipping")
            sub_label = sub_lines[0]
            sub_y       = centre_y + int(h * 0.04)
            draw.text((pad + int(w * 0.05) + 2, sub_y + 2), sub_label, font=sub_font,
                      fill=(0, 0, 0, 140))
            draw.text((pad + int(w * 0.05), sub_y), sub_label, font=sub_font,
                      fill=accent)

            # ── Style tag dots (keyed to the sub-label position) ──────────────
            dot_y  = sub_y + sub_font_sz + 16
            dot_r  = max(5, w // 160)
            dot_dx = dot_r * 3
            for idx in range(min(len(req.style_tags), 5)):
                cx = pad + int(w * 0.05) + idx * dot_dx * 2
                draw.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
                             fill=accent)

        # ── Save (atomic: write to a temp sibling, then rename into place so a
        # concurrent reader or a crash never observes a partial/zero-byte file) ──
        if img.size != output_size:
            img = img.resize(output_size, Image.Resampling.LANCZOS)
        pil_fmt, _ext, save_kwargs = _img_format_spec(req.img_format)
        tmp_path = out_path.with_name(f".{out_path.stem}.{uuid.uuid4().hex[:8]}.tmp")
        try:
            img.save(str(tmp_path), pil_fmt, **save_kwargs)
            os.replace(str(tmp_path), str(out_path))
        except Exception:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except Exception:
                pass
            raise
