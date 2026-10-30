"""Translate a visual spec (palette / mood / seed) into a path-traced Scene.

The colour scheme drives materials and the environment; the mood drives lighting
energy. Deterministic given the same (color_scheme, mood, seed).
"""
from __future__ import annotations

import hashlib
import re
from typing import Optional, Tuple

import numpy as np

from .path_tracer import Camera, Material, Plane, Scene, Sphere


def stable_seed(*parts) -> int:
    """Deterministic 31-bit seed from arbitrary parts.

    Uses blake2b rather than the built-in ``hash()``, which is salted per
    process (``PYTHONHASHSEED``) and would break cross-restart determinism.
    """
    h = hashlib.blake2b("\x00".join(str(p) for p in parts).encode("utf-8"), digest_size=8)
    return int.from_bytes(h.digest(), "big") % (2 ** 31)


def _hex_to_rgb01(h: str) -> Tuple[float, float, float]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
    except (ValueError, IndexError):
        return (0.7, 0.7, 0.7)
    return (r, g, b)


def _palette_for(color_scheme: str) -> list:
    """Pull an RGB palette from the ImageEngine's COLOR_SCHEMES when available."""
    from ai_model.image.image_engine import COLOR_SCHEMES
    if color_scheme not in COLOR_SCHEMES:
        raise ValueError(f"Unknown image color scheme: {color_scheme}")
    return [tuple(channel / 255.0 for channel in color)
            for color in COLOR_SCHEMES[color_scheme]]


def build_scene(color_scheme: str = "dark_neon", mood: str = "cinematic",
                seed: int = 0, aspect: float = 1.0, prompt: str = "") -> Scene:
    # Current tracer only has spheres and a horizontal plane. Sphere/plane studies
    # are valid when explicitly requested; they cannot represent arbitrary
    # objects, water, landscape or typography. Fail instead of faking fidelity.
    words = set(re.findall(r"[a-z]+", prompt.lower()))
    has_spheres = bool(words & {"sphere", "spheres", "orb", "orbs"})
    has_plane = bool(words & {"plane", "floor", "ground"})
    if not (has_spheres or has_plane):
        raise ValueError("RTA tracer supports only abstract sphere/plane scenes; requested subject cannot be represented")
    if words & {"lantern", "lanterns", "harbor", "harbour", "water", "boat",
                "person", "portrait", "city", "tree", "text"}:
        raise ValueError("RTA tracer cannot represent the requested subject with sphere/plane geometry")
    rng = np.random.default_rng(stable_seed(color_scheme, mood, seed))
    palette = _palette_for(color_scheme)

    mood_l = (mood or "").lower()
    dark = any(k in mood_l for k in ("dark", "noir", "moody", "neon", "night"))
    warm = any(k in mood_l for k in ("warm", "vintage", "sunset", "gold"))
    energetic = any(k in mood_l for k in ("energetic", "vibrant", "bold", "punchy"))

    # Environment (sky) — the primary, low-variance illuminant (a dome light).
    # Even "dark" scenes keep a non-trivial sky so diffuse bounces sample a
    # smooth light source instead of relying on tiny high-variance emitters
    # (which is what produces Monte-Carlo fireflies / grain).
    if dark:
        sky_top = tuple(0.30 * np.array(palette[1 % len(palette)]) + 0.06)
        sky_horizon = tuple(0.16 * np.array(palette[0]) + 0.05)
        sky_intensity = 0.85
    elif warm:
        sky_top = (0.5, 0.55, 0.7)
        sky_horizon = (0.95, 0.7, 0.45)
        sky_intensity = 1.25
    else:
        sky_top = (0.55, 0.7, 1.0)
        sky_horizon = (0.92, 0.88, 0.85)
        sky_intensity = 1.15

    # Ground plane — neutral, slightly tinted by first palette colour.
    ground = np.clip(0.35 + 0.25 * np.array(palette[0]), 0.15, 0.75)
    plane = Plane(y=0.0, material=Material(albedo=tuple(ground), emission=(0.0, 0.0, 0.0)))

    # Hero spheres from the palette (matte, colour-bleeding).
    spheres = []
    n_hero = 3 if has_spheres else 0
    xs = np.linspace(-1.5, 1.5, n_hero)
    for i in range(n_hero):
        col = palette[i % len(palette)]
        radius = float(0.55 + 0.25 * rng.random())
        spheres.append(Sphere(
            center=(float(xs[i] + 0.15 * (rng.random() - 0.5)), radius, float(-0.2 + 0.6 * (rng.random() - 0.5))),
            radius=radius,
            material=Material(albedo=tuple(np.clip(np.array(col) * 0.9 + 0.05, 0.05, 0.98))),
        ))

    # Emissive area light(s) — LARGE and moderate-intensity so each covers a wide
    # solid angle: diffuse bounces hit them frequently, giving soft shadows with
    # low variance (small bright emitters would produce fireflies). Placed high
    # and to the sides, mostly out of the camera frame.
    light_strength = 3.2 if energetic else (2.2 if not dark else 2.8)
    key_col = np.array(palette[2 % len(palette)])
    key_emit = tuple(np.clip(key_col * 0.4 + 0.7, 0.3, 1.0) * light_strength)
    spheres.append(Sphere(center=(3.4, 4.2, 2.6), radius=2.6,
                          material=Material(emission=key_emit)))
    fill_col = np.array(palette[1 % len(palette)])
    fill_emit = tuple(np.clip(fill_col * 0.4 + 0.5, 0.25, 1.0) * (light_strength * 0.55))
    spheres.append(Sphere(center=(-3.6, 3.4, 2.0), radius=2.1,
                          material=Material(emission=fill_emit)))

    cam = Camera(origin=(0.0, 1.3, 4.4), look_at=(0.0, 0.85, -0.1), fov_deg=44.0)
    exposure = 1.25 if dark else 1.05
    return Scene(spheres=spheres, plane=plane, camera=cam,
                 sky_top=sky_top, sky_horizon=sky_horizon,
                 sky_intensity=sky_intensity, exposure=exposure)
