#!/usr/bin/env python3
"""
Image Color & Mood Analyzer for Max Booster
Extracts dominant colors, brightness, contrast, and mood from an image.
Maps visual characteristics to content tone and video palette suggestions.

Usage: python3 imageAnalyzer.py '<filepath>'
Output: JSON to stdout
"""

import sys
import json
import os
import math
import numpy as np
from PIL import Image

# ── K-means color clustering ───────────────────────────────────────────────────

def dominant_colors(pixels: np.ndarray, k: int = 5, iters: int = 25) -> tuple[np.ndarray, np.ndarray]:
    """
    Simple NumPy k-means to extract k dominant colors.
    Returns (centroids uint8 [k,3], weights float [k])
    """
    N = pixels.shape[0]
    rng = np.random.default_rng(42)

    # Initialize centroids with k-means++ style spread
    c_idx = [int(rng.integers(N))]
    for _ in range(k - 1):
        dists = np.min(np.sum((pixels[:, None, :] - pixels[c_idx, :][None, :, :]) ** 2, axis=2), axis=1)
        probs = dists / (dists.sum() + 1e-9)
        c_idx.append(int(rng.choice(N, p=probs)))

    centroids = pixels[c_idx].astype(np.float32)

    labels = np.zeros(N, dtype=np.int32)
    for it in range(iters):
        dists  = np.sum((pixels[:, None, :].astype(np.float32) -
                         centroids[None, :, :]) ** 2, axis=2)
        new_labels = dists.argmin(axis=1)
        if it > 0 and np.all(new_labels == labels):
            break
        labels = new_labels
        for i in range(k):
            mask = labels == i
            if mask.any():
                centroids[i] = pixels[mask].mean(axis=0)

    counts  = np.array([(labels == i).sum() for i in range(k)], dtype=np.float32)
    weights = counts / (counts.sum() + 1e-9)

    # Sort by weight descending
    order = weights.argsort()[::-1]
    return centroids[order].astype(np.uint8), weights[order]


# ── HSV helpers ────────────────────────────────────────────────────────────────

def rgb_to_hsv(rgb: np.ndarray) -> tuple[float, float, float]:
    """rgb in [0,255]. Returns (h°, s 0-1, v 0-1)."""
    r, g, b = rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0
    cmax = max(r, g, b)
    cmin = min(r, g, b)
    delta = cmax - cmin
    v = cmax
    s = (delta / cmax) if cmax > 0 else 0.0
    if delta < 1e-6:
        h = 0.0
    elif cmax == r:
        h = 60 * (((g - b) / delta) % 6)
    elif cmax == g:
        h = 60 * (((b - r) / delta) + 2)
    else:
        h = 60 * (((r - g) / delta) + 4)
    return h, s, v


def color_temperature(rgb: np.ndarray) -> float:
    """Warm/cool bias: +1 = very warm (red/orange), -1 = very cool (blue/cyan)."""
    r, g, b = rgb[0], rgb[1], rgb[2]
    return float((r - b) / (r + b + 1e-3))


# ── Mood mapping ───────────────────────────────────────────────────────────────

MOOD_RULES = [
    # (min_brightness, max_brightness, min_sat, max_sat, warm_min, warm_max) → mood
    # High energy: bright + saturated
    (0.65, 1.00, 0.55, 1.00,  0.1, 1.00, 'hype'),
    # Romantic: warm + medium brightness + medium sat
    (0.30, 0.75, 0.35, 0.80,  0.3, 1.00, 'romantic'),
    # Dark: low brightness + any sat
    (0.00, 0.30, 0.00, 1.00, -1.00, 1.00, 'dark'),
    # Chill/cool: cool tones + medium brightness
    (0.30, 0.70, 0.20, 0.70, -1.00, 0.00, 'chill'),
    # Uplifting: bright + warm + medium sat
    (0.55, 1.00, 0.25, 0.55,  0.0, 1.00, 'uplifting'),
    # Emotional: medium brightness + mid sat
    (0.25, 0.60, 0.25, 0.60, -0.5, 0.5, 'emotional'),
    # Default
    (0.00, 1.00, 0.00, 1.00, -1.00, 1.00, 'default'),
]


def infer_mood(brightness: float, saturation: float, warmth: float, contrast: float) -> str:
    for (bmin, bmax, smin, smax, wmin, wmax, mood) in MOOD_RULES:
        if bmin <= brightness <= bmax and smin <= saturation <= smax and wmin <= warmth <= wmax:
            return mood
    return 'default'


def suggest_genre(mood: str, brightness: float, saturation: float) -> str:
    if mood == 'hype':
        return 'hip-hop' if saturation < 0.7 else 'electronic'
    if mood == 'romantic':
        return 'r&b'
    if mood == 'dark':
        return 'trap'
    if mood == 'chill':
        return 'electronic'
    if mood == 'uplifting':
        return 'pop'
    if mood == 'emotional':
        return 'r&b'
    return 'pop'


# ── Palette for video generation ───────────────────────────────────────────────

def to_hex(rgb: np.ndarray) -> str:
    return '0x{:02x}{:02x}{:02x}'.format(int(rgb[0]), int(rgb[1]), int(rgb[2]))


def darken(rgb: np.ndarray, factor: float = 0.35) -> np.ndarray:
    return np.clip(rgb.astype(np.float32) * factor, 0, 255).astype(np.uint8)


def brighten(rgb: np.ndarray, factor: float = 1.4) -> np.ndarray:
    return np.clip(rgb.astype(np.float32) * factor, 0, 255).astype(np.uint8)


# ── Main analyzer ──────────────────────────────────────────────────────────────

def analyze_image(filepath: str) -> dict:
    if not os.path.exists(filepath):
        return {'error': f'File not found: {filepath}'}

    try:
        img = Image.open(filepath).convert('RGB')
    except Exception as e:
        return {'error': f'Cannot open image: {e}'}

    orig_w, orig_h = img.size

    # Resize for fast analysis (max 150px on longest side)
    scale = min(150 / max(orig_w, orig_h), 1.0)
    small = img.resize((max(1, int(orig_w * scale)), max(1, int(orig_h * scale))), Image.LANCZOS)
    pixels = np.array(small, dtype=np.uint8).reshape(-1, 3)

    # ── Global stats ──────────────────────────────────────────────────────────
    pf = pixels.astype(np.float32)
    brightness  = round(float(pf.mean() / 255.0), 3)

    # Per-pixel saturation (faster than HSV conversion for all pixels)
    pmax = pf.max(axis=1)
    pmin = pf.min(axis=1)
    sat_vals = np.where(pmax > 0, (pmax - pmin) / (pmax + 1e-6), 0.0)
    saturation = round(float(sat_vals.mean()), 3)

    # Contrast: standard deviation of luminance
    luma = 0.299 * pf[:, 0] + 0.587 * pf[:, 1] + 0.114 * pf[:, 2]
    contrast = round(float(luma.std() / 255.0), 3)

    # Warm/cool: mean (R-B) / (R+B)
    rb_sum  = pf[:, 0] + pf[:, 2] + 1e-3
    warmth  = round(float(((pf[:, 0] - pf[:, 2]) / rb_sum).mean()), 3)

    # ── Dominant colors ───────────────────────────────────────────────────────
    k = min(5, len(np.unique(pixels.reshape(-1, 3) // 32, axis=0)))
    k = max(k, 2)
    colors, weights = dominant_colors(pixels, k=k)

    palette = []
    for i, (color, w) in enumerate(zip(colors, weights)):
        h, s, v = rgb_to_hsv(color)
        palette.append({
            'hex':    to_hex(color),
            'rgb':    [int(color[0]), int(color[1]), int(color[2])],
            'weight': round(float(w), 3),
            'hue_deg':round(h, 1),
            'sat':    round(s, 3),
            'val':    round(v, 3),
        })

    # Primary + accent colors for video generation
    primary = colors[0]       # Most dominant
    accent  = colors[min(1, len(colors) - 1)]   # Second most dominant

    # For dark images: use primary as bg, brighten accent
    # For light images: darken primary for bg, use accent as pop color
    if brightness < 0.45:
        bg_color = to_hex(darken(primary, 0.45))
        ac_color = to_hex(brighten(accent, 1.2))
    else:
        bg_color = to_hex(darken(primary, 0.3))
        ac_color = to_hex(accent)

    # ── Mood + genre inference ────────────────────────────────────────────────
    mood  = infer_mood(brightness, saturation, warmth, contrast)
    genre = suggest_genre(mood, brightness, saturation)

    # Hue shift suggestion: based on dominant color hue
    dom_h, dom_s, dom_v = rgb_to_hsv(primary)
    # Suggest shifting to complement the dominant color
    hue_shift_suggest = round((dom_h - 180.0) % 360.0 - 180.0, 1)
    hue_shift_suggest = max(-30, min(30, hue_shift_suggest / 6.0))

    return {
        'width':      orig_w,
        'height':     orig_h,
        'brightness': brightness,
        'saturation': saturation,
        'contrast':   contrast,
        'warmth':     warmth,
        'mood':       mood,
        'genre_hint': genre,
        'tone':       mood,
        'palette':    palette,
        'primary_hex': to_hex(primary),
        'accent_hex':  to_hex(accent),
        'bg_color':   bg_color,
        'ac_color':   ac_color,
        'hue_shift_suggest': hue_shift_suggest,
        'sat_mult_suggest':  round(1.0 + (saturation - 0.5) * 0.4, 3),
        'val_mult_suggest':  round(0.85 + brightness * 0.25, 3),
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: imageAnalyzer.py <filepath>'}))
        sys.exit(1)

    out = analyze_image(sys.argv[1])
    print(json.dumps(out))
