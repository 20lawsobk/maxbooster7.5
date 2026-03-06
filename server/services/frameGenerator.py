#!/usr/bin/env python3
"""
Max Booster — Music Video Frame Generator
NumPy-powered procedural animation engine, music-industry tuned.

Pipes raw RGB24 frames to stdout for FFmpeg to encode.
Usage: python3 frameGenerator.py '<JSON_CONFIG>'

Config keys:
  style        : visual style name (see STYLES dict)
  scene_prompt : plain-text scene description — auto-selects a scene style
                 e.g. "artist performing on concert stage with crowd"
  width        : output width  (default 1080)
  height       : output height (default 1920)
  duration     : seconds (default 15)
  fps          : frames per second (default 30)
  render_scale : internal resolution divisor for speed (default 2 → half-res + FFmpeg upscale)
  bg           : hex background color e.g. '0x1a1a2e'
  ac           : hex accent color    e.g. '0xe94560'
  genre        : music genre for style tuning
  speed        : animation speed multiplier (default 1.0)
  intensity    : visual brightness/saturation 0–1 (default 0.85)
  eq_bars      : bool, render equalizer visualizer (default True)
  eq_height    : fraction of frame height for eq zone (default 0.18)
"""

import sys
import os
import json
import math
import numpy as np

try:
    from PIL import Image, ImageDraw
    _PIL_SCENE = True
except Exception:
    _PIL_SCENE = False

# Neural net lives in the same directory
sys.path.insert(0, os.path.dirname(__file__))
try:
    import videoNeuralNet as _vnn
    _NN_AVAILABLE = True
except Exception:
    _NN_AVAILABLE = False

PI  = math.pi
TAU = math.tau


# ── Color Helpers ──────────────────────────────────────────────────────────────

def parse_hex(h: str) -> np.ndarray:
    h = h.replace('0x', '').replace('#', '').zfill(6)
    return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)


def lut_palette(c0: np.ndarray, c1: np.ndarray, c2: np.ndarray, size=1024) -> np.ndarray:
    """Three-stop gradient LUT: c0 → c1 → c2. Each cN is float32 [R,G,B] 0-255."""
    lut = np.zeros((size, 3), dtype=np.float32)
    half = size // 2
    for i in range(half):
        t = i / half
        lut[i] = c0 * (1 - t) + c1 * t
    for i in range(half, size):
        t = (i - half) / (size - half)
        lut[i] = c1 * (1 - t) + c2 * t
    return np.clip(lut, 0, 255).astype(np.uint8)


def apply_lut(v: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """v in [0,1], returns HxWx3 uint8."""
    v_safe = np.nan_to_num(v, nan=0.0, posinf=1.0, neginf=0.0)
    idx = np.clip((v_safe * (len(lut) - 1)).astype(np.int32), 0, len(lut) - 1)
    return lut[idx]


def white() -> np.ndarray:
    return np.array([255, 255, 255], dtype=np.float32)


def black() -> np.ndarray:
    return np.array([0, 0, 0], dtype=np.float32)


# ── Equalizer Bars ─────────────────────────────────────────────────────────────

def make_eq_frame(W: int, H: int, t: float, ac: np.ndarray,
                  eq_h_frac: float = 0.18, n_bars: int = 40) -> np.ndarray:
    """
    Generate a music EQ visualizer row as an RGBA overlay.
    Returns HxWx4 uint8 (alpha channel for blending with the background).
    """
    zone_h = int(H * eq_h_frac)
    bar_w = W // n_bars
    img = np.zeros((zone_h, W, 4), dtype=np.uint8)

    # Pseudo-musical spectrum: each bar has a deterministic amplitude envelope
    # designed to look like actual audio — sub-bass, bass, mids, highs
    freq_profile = np.array([
        1.2, 1.0, 0.9, 1.1, 0.8, 0.7, 0.9, 1.0,   # sub-bass / bass
        0.6, 0.8, 0.9, 0.7, 0.8, 0.9, 0.7, 0.6,   # low-mids
        0.5, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.6,   # mids
        0.5, 0.6, 0.5, 0.4, 0.5, 0.4, 0.3, 0.4,   # high-mids
        0.3, 0.4, 0.3, 0.2, 0.3, 0.2, 0.1, 0.2,   # highs
    ], dtype=np.float32)[:n_bars]

    for i in range(n_bars):
        # Each bar oscillates with its own characteristic frequency
        phase = i * 0.4
        beat_freq = 2.0 + i * 0.05
        amp = freq_profile[i] * (
            0.55 + 0.30 * math.sin(t * beat_freq + phase) +
            0.15 * math.sin(t * beat_freq * 2.3 + phase * 1.7)
        )
        amp = max(0.04, min(1.0, amp))

        bar_h = int(zone_h * amp)
        x0 = i * bar_w + 1
        x1 = x0 + bar_w - 2

        for y in range(bar_h):
            row = zone_h - 1 - y
            # Gradient: accent at top of bar → darker at bottom
            brightness = 0.4 + 0.6 * (y / max(bar_h, 1))
            r = int(min(255, ac[0] * brightness))
            g = int(min(255, ac[1] * brightness))
            b = int(min(255, ac[2] * brightness))
            alpha = 220
            img[row, x0:x1] = [r, g, b, alpha]

    return img


def blend_eq(frame: np.ndarray, eq: np.ndarray, H: int) -> np.ndarray:
    """Alpha-blend EQ overlay onto the bottom of the frame."""
    zone_h = eq.shape[0]
    y0 = H - zone_h
    region = frame[y0:, :, :].astype(np.float32)
    a = eq[:, :, 3:4].astype(np.float32) / 255.0
    eq_rgb = eq[:, :, :3].astype(np.float32)
    blended = region * (1 - a) + eq_rgb * a
    frame[y0:, :, :] = np.clip(blended, 0, 255).astype(np.uint8)
    return frame


# ── Visual Styles ──────────────────────────────────────────────────────────────

class PlasmaFractal:
    """
    Multi-frequency wave interference — iridescent swirling plasma.
    Best for: Pop, EDM, Afrobeats, Latin
    """
    GENRE_SPEED = {'electronic': 1.4, 'pop': 1.1, 'afrobeats': 1.3, 'latin': 1.2}

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY, self.R = XX, YY, R
        self.speed = speed * self.GENRE_SPEED.get(genre, 1.0)
        self.intensity = intensity
        mid = (bg + ac) / 2
        self.lut = lut_palette(bg, ac, white())

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        v = (np.sin(self.XX * 10 + s * 2.1) +
             np.sin(self.YY * 8  - s * 1.7) +
             np.sin((self.XX + self.YY) * 6 + s * 1.3) +
             np.sin(self.R * 12  - s * 2.4)) * 0.25
        v = (v + 1) * 0.5 * self.intensity
        return apply_lut(v.astype(np.float32), self.lut)


class GalaxySpiral:
    """
    Rotating spiral galaxy with parallax star field and luminous core.
    Best for: R&B, Soul, Neo-Soul, Gospel
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY, self.R, self.THETA = XX, YY, R, THETA
        self.speed = speed
        self.intensity = intensity
        self.lut_core  = lut_palette(bg, ac,   white())
        self.lut_arm   = lut_palette(bg, ac * 0.6, ac)
        # Static starfield (deterministic pseudo-random via trig)
        self.stars = (
            np.sin(XX * 127.1 + YY * 311.7) *
            np.sin(YY * 269.5 + XX * 183.3)
        )
        self.stars = (self.stars > 0.980).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Spiral arm
        arm_phase = self.THETA - self.R * 3.5 + s * 0.4
        arm_val = (np.sin(arm_phase * 2) ** 2) * np.exp(-self.R * 2.0)
        # Core glow
        core_val = np.exp(-self.R * 6) * 1.8
        # Twinkling stars
        twinkle = 0.6 + 0.4 * math.sin(s * 3.7)
        star_val = self.stars * twinkle * 0.9
        # Nebula wisps (low-frequency colour haze)
        nebula = 0.12 * np.sin(self.XX * 3 + s * 0.3) * np.sin(self.YY * 2.1 - s * 0.2)
        nebula = (nebula + 0.12) / 0.24

        total = np.clip(arm_val + core_val + nebula * 0.3 + star_val, 0, 1)
        frame = apply_lut((total * self.intensity).astype(np.float32), self.lut_core)
        # Star highlights in white
        mask = (self.stars > 0).astype(np.uint8) * 255
        frame[:, :, 0] = np.maximum(frame[:, :, 0], mask)
        frame[:, :, 1] = np.maximum(frame[:, :, 1], mask)
        frame[:, :, 2] = np.maximum(frame[:, :, 2], mask)
        return frame


class NeonTunnel:
    """
    First-person neon tube perspective tunnel with radial ring pulses.
    Best for: Hip-hop, Trap, Electronic, Drill
    """
    GENRE_SPEED = {'hip-hop': 1.3, 'trap': 1.5, 'electronic': 1.2, 'drill': 1.4}

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.R, self.THETA = R, THETA
        self.speed = speed * self.GENRE_SPEED.get(genre, 1.0)
        self.intensity = intensity
        self.lut = lut_palette(bg, ac, white() * 0.9)
        # Precompute inverse radius safely
        self.inv_r = np.where(self.R > 0.01, 1.0 / (self.R + 0.02), 50.0).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        depth = self.inv_r * 0.3 + s * 0.6
        # Concentric rings
        rings = (np.sin(depth * 18) * 0.5 + 0.5) ** 2
        # Angular stripe pattern
        stripe = np.abs(np.sin(self.THETA * 6 + s * 1.5)) * 0.4 + 0.6
        # Radial fade (bright center, dark edges)
        edge_glow = np.exp(-self.R * 2.5)
        # Beat pulse
        pulse = 0.85 + 0.15 * math.sin(s * PI * 2)
        v = rings * stripe * pulse + edge_glow * 0.5
        v = np.clip(v * self.intensity, 0, 1)
        return apply_lut(v.astype(np.float32), self.lut)


class AuroraCurtains:
    """
    Atmospheric aurora borealis — flowing vertical light curtains.
    Best for: Country, Indie, Ballads, Folk, Singer-songwriter
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY = XX, YY
        self.H = H
        self.speed = speed * 0.6
        self.intensity = intensity
        green_ac = np.array([40.0, 220.0, 140.0])
        self.lut_green = lut_palette(bg, green_ac,        white() * 0.8)
        self.lut_ac    = lut_palette(bg, ac * 0.8,        ac)
        # Normalized vertical position [0=top, 1=bottom]
        self.norm_y = ((YY + 1) * 0.5).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Curtain columns
        col_wave = (np.sin(self.XX * 4 + s * 0.7) +
                    np.sin(self.XX * 7 - s * 0.5) * 0.5) / 1.5
        # Vertical fade — strongest in upper 2/3
        v_fade = np.exp(-self.norm_y * 3.5)
        # Ripple along curtains
        ripple = np.sin(self.YY * 8 + self.XX * 2 + s * 1.2) * 0.3 + 0.7
        # Secondary colour band
        band2 = np.sin(self.XX * 5.3 - s * 0.9) * 0.5 + 0.5
        v_green = np.clip(col_wave * v_fade * ripple * self.intensity, 0, 1)
        v_ac    = np.clip(band2   * v_fade * 0.5  * self.intensity,   0, 1)
        frame_g = apply_lut(v_green.astype(np.float32), self.lut_green).astype(np.float32)
        frame_a = apply_lut(v_ac.astype(np.float32),    self.lut_ac).astype(np.float32)
        return np.clip(frame_g + frame_a * 0.4, 0, 255).astype(np.uint8)


class WarpSpeed:
    """
    Hyper-drive radial velocity streaks converging to vanishing point.
    Best for: Trap, Hype, EDM drops, Aggressive rap
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY, self.R, self.THETA = XX, YY, R, THETA
        self.speed = speed * 1.5
        self.intensity = intensity
        self.lut = lut_palette(bg, ac, white())

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Perspective-correct radius (grows faster near centre)
        z = 1.0 / (self.R * 2 + 0.05 + s * 0.3)
        # Streak brightness varies with angular position
        streak_angle = self.THETA * 32
        streak = (np.sin(streak_angle) * 0.5 + 0.5) ** 4
        # Speed lines
        speed_line = np.sin(z * 40 - s * 8) * 0.5 + 0.5
        # Radial glow (white core)
        core = np.exp(-self.R * 6) * 1.2
        v = np.clip((streak * speed_line + core) * self.intensity, 0, 1)
        return apply_lut(v.astype(np.float32), self.lut)


class LiquidMetal:
    """
    Reflective metallic wave surface with chromatic highlights.
    Best for: Hip-hop, Rap, Rock, Metal
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY, self.R = XX, YY, R
        self.speed = speed
        self.intensity = intensity
        self.lut_base    = lut_palette(bg, ac * 0.5,  ac)
        self.lut_reflect = lut_palette(bg, white() * 0.7, white())

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Undulating wave surface normals
        nx = np.sin(self.XX * 5 + s * 1.8) + np.sin(self.YY * 3.7 - s * 1.3) * 0.5
        ny = np.cos(self.YY * 4 - s * 2.1) + np.cos(self.XX * 2.9 + s * 1.6) * 0.5
        # Specular highlight (simulated reflection)
        dot = (nx * 0.7 + ny * 0.3 + 1.0) * 0.5
        spec = dot ** 4
        # Diffuse base
        diffuse = np.clip((nx * 0.5 + ny * 0.5 + 1.0) * 0.5, 0, None)
        diffuse = diffuse ** 1.5
        # Blend
        base_frame = apply_lut((diffuse * self.intensity).astype(np.float32), self.lut_base).astype(np.float32)
        spec_frame = apply_lut((spec * self.intensity).astype(np.float32), self.lut_reflect).astype(np.float32)
        return np.clip(base_frame + spec_frame * 0.6, 0, 255).astype(np.uint8)


class FireEmbers:
    """
    Pyrotechnic simulation — rising fire columns with hot ember glow.
    Best for: Trap, Aggressive rap, Rock, Drill, Dark themes
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY = XX, YY
        self.H = H
        self.speed = speed * 1.2
        self.intensity = intensity
        # Fire palette: deep red → orange → yellow → white hot
        red    = np.array([200.0, 10.0,  5.0])
        orange = np.array([255.0, 100.0, 10.0])
        yellow = np.array([255.0, 220.0, 60.0])
        self.lut1 = lut_palette(bg,     red,    orange)
        self.lut2 = lut_palette(orange, yellow, white() * 0.98)
        # Normalized vertical: 0=top, 1=bottom (fire rises from bottom)
        self.norm_y = ((self.YY + 1) * 0.5).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Rising turbulence columns
        col1 = np.sin(self.XX * 6 + s * 0.4) * 0.5 + 0.5
        col2 = np.sin(self.XX * 11.3 - s * 0.3) * 0.4 + 0.5
        turb = col1 * 0.6 + col2 * 0.4
        # Vertical fire shape — strong at bottom, fades at top
        height = (1 - self.norm_y)  # 0 at bottom edges, 1 near top
        fire_shape = np.exp(-self.norm_y * 3.5) * 1.8
        # Flicker
        flicker = 0.85 + 0.15 * math.sin(s * 13.7) * math.cos(s * 8.3)
        v = np.clip(turb * fire_shape * flicker * self.intensity, 0, 1)
        # Dual-LUT: cool base → hot tips
        f1 = apply_lut(v.astype(np.float32), self.lut1).astype(np.float32)
        hot_mask = np.clip((v - 0.5) * 2, 0, 1).astype(np.float32)
        f2 = apply_lut(hot_mask, self.lut2).astype(np.float32)
        return np.clip(f1 + f2 * hot_mask[:, :, None] * 0.8, 0, 255).astype(np.uint8)


class CrystalFacets:
    """
    Geometric crystalline facets with light refraction simulation.
    Best for: Electronic, Minimal, Ambient, Alternative
    """
    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.XX, self.YY, self.R, self.THETA = XX, YY, R, THETA
        self.speed = speed * 0.7
        self.intensity = intensity
        self.lut = lut_palette(bg, ac, white() * 0.92)
        # Precompute static Voronoi-like cell pattern
        # 16 cell centres deterministically placed
        np.random.seed(42)
        n = 16
        self.cx = np.random.uniform(-1, 1, n).astype(np.float32)
        self.cy = np.random.uniform(-1, 1, n).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        s = t * self.speed
        # Find nearest cell center distance
        min_dist  = np.full_like(self.R, 1e6, dtype=np.float32)
        min_dist2 = np.full_like(self.R, 1e6, dtype=np.float32)
        for i in range(len(self.cx)):
            cx_t = self.cx[i] + 0.05 * math.sin(s * 0.7 + i * 1.3)
            cy_t = self.cy[i] + 0.05 * math.cos(s * 0.9 + i * 0.8)
            d = np.sqrt((self.XX - cx_t) ** 2 + (self.YY - cy_t) ** 2)
            mask1 = d < min_dist
            min_dist2 = np.where(mask1, min_dist,  min_dist2)
            min_dist  = np.where(mask1, d,          min_dist)
            mask2 = (~mask1) & (d < min_dist2)
            min_dist2 = np.where(mask2, d, min_dist2)
        # Edge detection via distance difference
        edge = min_dist2 - min_dist
        # Refraction shimmer
        shimmer = np.sin(min_dist * 30 + s * 2) * 0.5 + 0.5
        v = np.clip(edge * 4 * shimmer * self.intensity, 0, 1)
        return apply_lut(v.astype(np.float32), self.lut)


# ── Scene-Based Realistic Styles ──────────────────────────────────────────────
#
# Five environment styles built with PIL (static geometry) + NumPy (animation).
# Text descriptions flow through parse_scene_prompt() → style name selection.


def _draw_human(draw: 'ImageDraw.ImageDraw', cx: int, base_y: int,
                s: float = 1.0, color=(10, 8, 8), raised_arm: bool = False):
    """Full body silhouette — head, torso, arms, legs."""
    hs = max(1, int(9 * s))
    draw.ellipse([cx - int(6*s), base_y - int(34*s),
                  cx + int(6*s), base_y - int(22*s)], fill=color)
    draw.polygon([
        (cx - hs,        base_y - int(22*s)),
        (cx + hs,        base_y - int(22*s)),
        (cx + int(7*s),  base_y - int(6*s)),
        (cx - int(7*s),  base_y - int(6*s)),
    ], fill=color)
    arm_r_y2 = base_y - int(6*s)
    arm_l_y2 = (base_y - int(38*s)) if raised_arm else arm_r_y2
    draw.line([(cx - hs, base_y - int(22*s)),
               (cx - int(14*s), arm_l_y2)], fill=color, width=max(1, int(3*s)))
    draw.line([(cx + hs, base_y - int(22*s)),
               (cx + int(14*s), arm_r_y2)],  fill=color, width=max(1, int(3*s)))
    draw.polygon([
        (cx - int(7*s), base_y - int(6*s)), (cx + int(1*s), base_y - int(6*s)),
        (cx + int(1*s), base_y),             (cx - int(10*s), base_y),
    ], fill=color)
    draw.polygon([
        (cx - int(1*s), base_y - int(6*s)), (cx + int(7*s), base_y - int(6*s)),
        (cx + int(10*s), base_y),            (cx - int(1*s), base_y),
    ], fill=color)


def _pil_bg(W: int, H: int, fill=(0, 0, 0)):
    return Image.new('RGB', (W, H), fill)


def _to_np(img) -> np.ndarray:
    return np.array(img, dtype=np.float32)


def _vgrad(draw: 'ImageDraw.ImageDraw', W: int,
           y0: int, y1: int, c_top, c_bot, steps: int = 80):
    """Vertical gradient band using line-by-line PIL drawing."""
    for i in range(steps):
        t = i / max(steps - 1, 1)
        y = int(y0 + (y1 - y0) * t)
        r = int(c_top[0] * (1-t) + c_bot[0] * t)
        g = int(c_top[1] * (1-t) + c_bot[1] * t)
        b = int(c_top[2] * (1-t) + c_bot[2] * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


class ConcertStage:
    """
    Live concert venue — perspective stage, truss lights, crowd & performer.
    Best for: Hip-hop, R&B, Pop, Afrobeats, Latin, all mainstream genres
    """

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.W, self.H = W, H
        self.speed = speed
        self.intensity = intensity
        self.ac = ac.copy()

        if not _PIL_SCENE:
            self._fb = NeonTunnel(XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre)
            return
        self._fb = None

        img = _pil_bg(W, H, (4, 3, 14))
        draw = ImageDraw.Draw(img)

        sky_h = int(H * 0.58)
        _vgrad(draw, W, 0, sky_h, (4, 3, 14), (18, 12, 38))

        wall_y = int(H * 0.63)
        _vgrad(draw, W, sky_h, wall_y, (18, 12, 38), (28, 18, 50))

        ftop = int(H * 0.61)
        fbot = int(H * 0.80)
        draw.polygon([
            (W//2 - int(W*0.23), ftop), (W//2 + int(W*0.23), ftop),
            (W, fbot), (0, fbot),
        ], fill=(42, 30, 20))
        for i in range(14):
            t = (i / 14) ** 1.4
            py = int(ftop + (fbot - ftop) * t)
            draw.line([(0, py), (W, py)], fill=(56, 40, 26), width=1)

        draw.rectangle([0, ftop - 3, W, ftop + 3], fill=(170, 130, 70))

        for sx in [int(W * 0.03), int(W * 0.74)]:
            sw = int(W * 0.17)
            draw.rectangle([sx, int(H*0.34), sx + sw, ftop], fill=(10, 8, 6))
            for gy in range(int(H*0.36), ftop, 8):
                for gx in range(sx + 4, sx + sw - 3, 8):
                    draw.ellipse([gx, gy, gx+3, gy+3], fill=(22, 18, 14))

        truss_y = int(H * 0.11)
        draw.rectangle([int(W*0.04), truss_y, int(W*0.96), truss_y + 7], fill=(30, 30, 30))
        for lx in range(int(W*0.07), int(W*0.94), int(W*0.08)):
            draw.ellipse([lx-9, truss_y-5, lx+9, truss_y+12], fill=(210, 185, 85))

        crowd_y = int(H * 0.82)
        for xp in range(0, W, 13):
            _draw_human(draw, xp, crowd_y, s=0.52, color=(8, 6, 5))
        for xp in range(6, W, 17):
            _draw_human(draw, xp, crowd_y + 20, s=0.72, color=(12, 9, 7))

        _draw_human(draw, W // 2, int(H * 0.61), s=2.3, color=(7, 5, 4), raised_arm=True)
        mx = W // 2 + int(W * 0.03)
        draw.line([(mx, int(H*0.46)), (mx, int(H*0.57))], fill=(45, 45, 45), width=2)
        draw.ellipse([mx-5, int(H*0.44), mx+5, int(H*0.47)], fill=(55, 55, 55))

        self.bg = _to_np(img)
        self.ftop = ftop
        self.truss_y = truss_y
        self.crowd_y = crowd_y
        self.spots = [
            {'xf': 0.25, 'ph': 0.0,  'sw': 0.07, 'col': ac.copy()},
            {'xf': 0.50, 'ph': 1.57, 'sw': 0.04, 'col': np.array([245., 220., 170.])},
            {'xf': 0.75, 'ph': 3.14, 'sw': 0.06, 'col': np.array([ac[0]*0.7, ac[1]*0.9, ac[2]])},
        ]

    def render(self, t: float) -> np.ndarray:
        if self._fb:
            return self._fb.render(t)
        frame = self.bg.copy()
        for sp in self.spots:
            sway = math.sin(t * self.speed * 0.45 + sp['ph']) * sp['sw']
            bx = int((sp['xf'] + sway) * self.W)
            col = sp['col']
            for row in range(self.truss_y + 7, self.ftop):
                rt = (row - self.truss_y) / max(self.ftop - self.truss_y, 1)
                hw = max(1, int(rt * 30 + 2))
                x0 = max(0, bx - hw)
                x1 = min(self.W, bx + hw)
                alpha = (1.0 - rt * 0.55) * 0.30 * self.intensity
                frame[row, x0:x1] = np.clip(frame[row, x0:x1] + col * alpha, 0, 255)
        flicker = 0.05 + 0.03 * math.sin(t * self.speed * 4.1) * self.intensity
        frame[self.ftop:min(int(self.H*0.80), self.H)] = np.clip(
            frame[self.ftop:min(int(self.H*0.80), self.H)] +
            np.array([175., 130., 65.]) * flicker, 0, 255)
        bob = int(math.sin(t * self.speed * 1.9) * 2)
        if bob != 0:
            cy = self.crowd_y
            src_y = max(0, cy + bob)
            end_y = min(self.H, src_y + 55)
            frame[cy:min(cy + 55, self.H)] = self.bg[src_y:end_y]
        return np.clip(frame, 0, 255).astype(np.uint8)


class CityNights:
    """
    Night-time city skyline — buildings, rain, street reflections, bokeh.
    Best for: Hip-hop, R&B, Trap, Drill, Dark pop, Neo-soul
    """

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.W, self.H = W, H
        self.speed = speed
        self.intensity = intensity
        self.ac = ac.copy()

        if not _PIL_SCENE:
            self._fb = NeonTunnel(XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre)
            return
        self._fb = None

        img = _pil_bg(W, H, (2, 4, 14))
        draw = ImageDraw.Draw(img)

        sky_h = int(H * 0.68)
        _vgrad(draw, W, 0, sky_h, (2, 4, 14), (8, 10, 28))

        ground_y = int(H * 0.72)
        _vgrad(draw, W, sky_h, H, (8, 10, 28), (4, 6, 18))

        building_specs = [
            (0.02, 0.18, 0.55), (0.12, 0.10, 0.42), (0.20, 0.22, 0.48),
            (0.30, 0.14, 0.36), (0.38, 0.18, 0.44), (0.48, 0.26, 0.52),
            (0.58, 0.12, 0.38), (0.65, 0.20, 0.46), (0.74, 0.16, 0.40),
            (0.82, 0.14, 0.52), (0.88, 0.08, 0.34),
        ]
        win_cols = [(220, 200, 140), (180, 160, 100), (200, 180, 120)]
        for (x_frac, w_frac, h_frac) in building_specs:
            bx0 = int(x_frac * W)
            bx1 = int((x_frac + w_frac) * W)
            btop = int((1.0 - h_frac) * sky_h)
            draw.rectangle([bx0, btop, bx1, sky_h], fill=(12, 10, 16))
            for wy in range(btop + 8, sky_h - 5, 10):
                for wx in range(bx0 + 4, bx1 - 3, 8):
                    if (wx * 7 + wy * 13) % 5 != 0:
                        wc = win_cols[(wx + wy) % len(win_cols)]
                        draw.rectangle([wx, wy, wx+4, wy+5], fill=wc)

        for lx in range(int(W*0.08), W, int(W*0.18)):
            draw.line([(lx, ground_y), (lx, H)], fill=(50, 50, 60), width=2)
            draw.ellipse([lx-10, ground_y-12, lx+10, ground_y+12],
                         fill=(int(ac[0]*0.6), int(ac[1]*0.6), int(ac[2]*0.6)))

        ground_arr = _to_np(img)
        sky_strip = ground_arr[int(H*0.55):sky_h].copy()
        refl_h = sky_h - int(H*0.55)
        if refl_h > 0 and sky_h + refl_h <= H:
            flipped = sky_strip[::-1] * 0.3
            ground_arr[sky_h:sky_h + refl_h] = np.clip(
                ground_arr[sky_h:sky_h + refl_h] + flipped, 0, 255)
        self.bg = ground_arr
        self.sky_h = sky_h
        self.ground_y = ground_y

        np.random.seed(7)
        n_drops = 280
        self.rain_x = np.random.uniform(0, W, n_drops).astype(np.float32)
        self.rain_y = np.random.uniform(0, H, n_drops).astype(np.float32)
        self.rain_speed = np.random.uniform(180, 380, n_drops).astype(np.float32)
        self.rain_len = np.random.uniform(6, 18, n_drops).astype(np.float32)
        self.bokeh_x = np.random.uniform(0, W, 35).astype(np.float32)
        self.bokeh_y = np.random.uniform(0, sky_h, 35).astype(np.float32)
        self.bokeh_r = np.random.uniform(3, 12, 35).astype(np.float32)
        self.bokeh_ph = np.random.uniform(0, TAU, 35).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        if self._fb:
            return self._fb.render(t)
        frame = self.bg.copy()
        y_now = (self.rain_y + self.rain_speed * t * self.speed) % self.H
        rain_color = np.array([160., 170., 200.])
        alpha = 0.45 * self.intensity
        for i in range(len(self.rain_x)):
            rx = int(self.rain_x[i])
            ry = int(y_now[i])
            ry2 = min(self.H - 1, int(ry + self.rain_len[i]))
            if 0 <= rx < self.W and ry2 > ry:
                frame[ry:ry2, max(0, rx-1):rx+1] = np.clip(
                    frame[ry:ry2, max(0, rx-1):rx+1] + rain_color * alpha, 0, 255)
        for i in range(len(self.bokeh_x)):
            pulse = 0.6 + 0.4 * math.sin(t * self.speed * 1.2 + self.bokeh_ph[i])
            bx = int(self.bokeh_x[i])
            by = int(self.bokeh_y[i])
            br = int(self.bokeh_r[i])
            col = self.ac * pulse * 0.7 * self.intensity
            y0 = max(0, by - br); y1 = min(self.H, by + br)
            x0 = max(0, bx - br); x1 = min(self.W, bx + br)
            if y1 > y0 and x1 > x0:
                frame[y0:y1, x0:x1] = np.clip(frame[y0:y1, x0:x1] + col, 0, 255)
        return np.clip(frame, 0, 255).astype(np.uint8)


class StudioSession:
    """
    Recording studio interior — console, monitors, mic, VU meters, warm glow.
    Best for: R&B, Soul, Lo-fi, Pop production, Singer-songwriter
    """

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.W, self.H = W, H
        self.speed = speed
        self.intensity = intensity
        self.ac = ac.copy()

        if not _PIL_SCENE:
            self._fb = GalaxySpiral(XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre)
            return
        self._fb = None

        img = _pil_bg(W, H, (6, 4, 10))
        draw = ImageDraw.Draw(img)

        _vgrad(draw, W, 0, H, (6, 4, 10), (14, 10, 20))
        _vgrad(draw, W, int(H*0.6), H, (14, 10, 20), (20, 14, 28))

        warm_x = int(W * 0.78)
        for r in range(0, int(W * 0.55), 4):
            fade = max(0, 1.0 - r / (W * 0.55))
            col = (int(200*fade*0.8), int(140*fade*0.6), int(60*fade*0.3))
            if col[0] > 0:
                x0 = max(0, warm_x - r); x1 = min(W, warm_x + r)
                row_y = int(H * 0.35)
                draw.line([(x0, row_y), (x1, row_y)], fill=col)

        console_top = int(H * 0.58)
        console_bot = int(H * 0.82)
        draw.rectangle([int(W*0.04), console_top, int(W*0.96), console_bot], fill=(15, 12, 18))
        draw.rectangle([int(W*0.04), console_top, int(W*0.96), console_top+4], fill=(35, 30, 40))
        for fx in range(int(W*0.07), int(W*0.92), int(W*0.04)):
            fh = int(H * 0.08)
            draw.rectangle([fx, console_top+8, fx+int(W*0.025), console_top+8+fh], fill=(8, 6, 10))
            draw.rectangle([fx+2, console_top+8+fh//2, fx+int(W*0.025)-2, console_top+8+fh//2+5],
                           fill=(180, 180, 200))
        for kx in range(int(W*0.08), int(W*0.90), int(W*0.055)):
            ky = console_top + int(H * 0.11)
            draw.ellipse([kx-5, ky-5, kx+5, ky+5], fill=(25, 22, 30))
            draw.ellipse([kx-3, ky-3, kx+3, ky+3], fill=(40, 36, 48))

        for sx, sy in [(int(W*0.08), int(H*0.28)), (int(W*0.68), int(H*0.28))]:
            sw, sh = int(W*0.18), int(H*0.26)
            draw.rectangle([sx, sy, sx+sw, sy+sh], fill=(10, 8, 14))
            draw.rectangle([sx+4, sy+4, sx+sw-4, sy+sh-4], fill=(8, 6, 12))
            draw.ellipse([sx+sw//2-12, sy+sh-25, sx+sw//2+12, sy+sh-3], fill=(20, 16, 24))

        mic_x, mic_y = int(W * 0.50), int(H * 0.30)
        draw.line([(mic_x, mic_y + int(H*0.15)), (mic_x, mic_y + int(H*0.24))], fill=(40,40,45), width=2)
        draw.line([(mic_x - int(W*0.04), mic_y + int(H*0.24)),
                   (mic_x + int(W*0.04), mic_y + int(H*0.24))], fill=(40,40,45), width=2)
        draw.ellipse([mic_x-10, mic_y, mic_x+10, mic_y+int(H*0.05)], fill=(55, 52, 60))
        draw.ellipse([mic_x-7, mic_y+3, mic_x+7, mic_y+int(H*0.04)], fill=(45, 42, 50))

        screen_x, screen_y = int(W*0.28), int(H*0.10)
        screen_w, screen_h = int(W*0.44), int(H*0.20)
        draw.rectangle([screen_x, screen_y, screen_x+screen_w, screen_y+screen_h], fill=(4, 8, 6))
        draw.rectangle([screen_x+2, screen_y+2, screen_x+screen_w-2, screen_y+screen_h-2], fill=(2, 6, 4))

        self.bg = _to_np(img)
        self.console_top = console_top
        self.screen = (screen_x, screen_y, screen_w, screen_h)

        self.vu_x = [int(W * 0.07 + i * W * 0.055) for i in range(14)]
        self.vu_freq = [1.8 + i * 0.18 for i in range(14)]
        self.vu_phase = [i * 0.6 for i in range(14)]
        self.rec_phase = 0.0

    def render(self, t: float) -> np.ndarray:
        if self._fb:
            return self._fb.render(t)
        frame = self.bg.copy()

        sx, sy, sw, sh = self.screen
        wf_pts_x = np.linspace(sx + 4, sx + sw - 4, 120, dtype=np.int32)
        mid_y = sy + sh // 2
        for i in range(len(wf_pts_x) - 1):
            phase = i / 120 * TAU * 3 + t * self.speed * 2.5
            amp = int((math.sin(phase) * 0.5 + math.sin(phase * 2.1 + 1.0) * 0.3) *
                      sh * 0.35 * self.intensity)
            y1 = max(sy + 2, min(sy + sh - 2, mid_y - amp))
            y2 = max(sy + 2, min(sy + sh - 2, mid_y - amp + 1))
            x1 = wf_pts_x[i]
            frame[y1:y2+1, x1:x1+2] = np.clip(
                frame[y1:y2+1, x1:x1+2] +
                np.array([0., int(180*self.intensity), int(100*self.intensity)]), 0, 255)

        vu_max_h = int(self.H * 0.07)
        for i, vx in enumerate(self.vu_x):
            amp = 0.5 + 0.4 * math.sin(t * self.speed * self.vu_freq[i] + self.vu_phase[i])
            amp = max(0.05, min(1.0, amp))
            bar_h = int(vu_max_h * amp)
            vy0 = self.console_top - bar_h - 4
            vy1 = self.console_top - 4
            green_t = min(1.0, amp * 1.4)
            rc = int(20 + 200 * green_t * self.intensity)
            gc = int(160 * (1 - green_t) * self.intensity + 220 * green_t * self.intensity)
            bc = int(20 * self.intensity)
            frame[vy0:vy1, max(0,vx-3):vx+3] = np.clip(
                frame[vy0:vy1, max(0,vx-3):vx+3] + np.array([rc, gc, bc], dtype=np.float32),
                0, 255)

        blink = math.sin(t * self.speed * 3.0 + self.rec_phase)
        if blink > 0.5:
            frame[int(self.H*0.06):int(self.H*0.09),
                  int(self.W*0.12):int(self.W*0.18)] = np.clip(
                frame[int(self.H*0.06):int(self.H*0.09),
                      int(self.W*0.12):int(self.W*0.18)] +
                np.array([160., 20., 20.]) * self.intensity, 0, 255)

        warm_alpha = 0.06 + 0.02 * math.sin(t * self.speed * 0.7) * self.intensity
        frame[:, int(self.W*0.65):] = np.clip(
            frame[:, int(self.W*0.65):] +
            np.array([200., 140., 60.]) * warm_alpha, 0, 255)

        return np.clip(frame, 0, 255).astype(np.uint8)


class GoldenHour:
    """
    Golden-hour outdoor landscape — sunset sky, silhouette hills, sun rays.
    Best for: Country, Folk, Singer-songwriter, Indie, Gospel, Acoustic pop
    """

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.W, self.H = W, H
        self.speed = speed * 0.5
        self.intensity = intensity
        self.ac = ac.copy()

        if not _PIL_SCENE:
            self._fb = AuroraCurtains(XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre)
            return
        self._fb = None

        img = _pil_bg(W, H)
        draw = ImageDraw.Draw(img)

        hor_y = int(H * 0.62)
        _vgrad(draw, W, 0,     int(H*0.25), (20, 30, 80),   (40, 50, 110))
        _vgrad(draw, W, int(H*0.25), int(H*0.50), (40, 50, 110),  (180, 100, 40))
        _vgrad(draw, W, int(H*0.50), hor_y,  (180, 100, 40),  (240, 150, 50))
        _vgrad(draw, W, hor_y, H,     (30,  20,  8),  (10,  8,  4))

        hill_pts1 = [(0, H)]
        for i in range(41):
            xp = int(i / 40 * W)
            base = hor_y + int(H * 0.02)
            yp = base - int((math.sin(i * 0.22) * 0.5 + math.sin(i * 0.37) * 0.3) * H * 0.10)
            hill_pts1.append((xp, yp))
        hill_pts1.append((W, H))
        draw.polygon(hill_pts1, fill=(8, 12, 5))

        hill_pts2 = [(0, H)]
        for i in range(41):
            xp = int(i / 40 * W)
            base = hor_y + int(H * 0.06)
            yp = base - int((math.sin(i * 0.18 + 1.2) * 0.5 + math.sin(i * 0.29) * 0.4) * H * 0.06)
            hill_pts2.append((xp, yp))
        hill_pts2.append((W, H))
        draw.polygon(hill_pts2, fill=(12, 16, 8))

        tree_positions = [int(W*f) for f in [0.06, 0.14, 0.22, 0.71, 0.79, 0.88, 0.95]]
        for tx in tree_positions:
            ty = hor_y - int(H * 0.01)
            th = int(H * 0.12)
            draw.polygon([(tx, ty-th), (tx - int(W*0.03), ty), (tx + int(W*0.03), ty)],
                         fill=(5, 10, 4))
            draw.polygon([(tx, ty-th-int(H*0.06)),
                          (tx - int(W*0.02), ty-th+int(H*0.02)),
                          (tx + int(W*0.02), ty-th+int(H*0.02))], fill=(5, 10, 4))

        sun_x = int(W * 0.62)
        sun_y = hor_y - int(H * 0.04)
        sun_r = int(H * 0.055)
        draw.ellipse([sun_x-sun_r, sun_y-sun_r, sun_x+sun_r, sun_y+sun_r], fill=(255, 220, 90))
        for hr in range(sun_r + 4, sun_r + int(H*0.09), 4):
            fade = max(0, 1.0 - (hr - sun_r) / (H * 0.09))
            c = int(255 * fade * 0.6)
            draw.ellipse([sun_x-hr, sun_y-hr//2, sun_x+hr, sun_y+hr//2],
                         outline=(c, int(c*0.7), 0), width=1)

        self.bg = _to_np(img)
        self.sun_x = sun_x
        self.sun_y = sun_y
        self.sun_r = sun_r
        self.hor_y = hor_y
        np.random.seed(11)
        n_p = 60
        self.px = np.random.uniform(0, W, n_p).astype(np.float32)
        self.py = np.random.uniform(0, hor_y, n_p).astype(np.float32)
        self.psp = np.random.uniform(0.4, 1.2, n_p).astype(np.float32)
        self.pph = np.random.uniform(0, TAU, n_p).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        if self._fb:
            return self._fb.render(t)
        frame = self.bg.copy()

        n_rays = 12
        for i in range(n_rays):
            angle = (i / n_rays) * TAU + t * self.speed * 0.08
            ray_len = int(self.H * 0.55)
            end_x = int(self.sun_x + math.cos(angle) * ray_len)
            end_y = int(self.sun_y + math.sin(angle) * ray_len * 0.6)
            ray_alpha = (0.05 + 0.03 * math.sin(t * self.speed * 1.5 + i)) * self.intensity
            for step in range(0, ray_len, 3):
                frac = step / ray_len
                rx = int(self.sun_x + math.cos(angle) * step)
                ry = int(self.sun_y + math.sin(angle) * step * 0.6)
                if 0 <= rx < self.W and 0 <= ry < self.H:
                    fade = (1.0 - frac) * ray_alpha
                    frame[ry, rx] = np.clip(frame[ry, rx] + np.array([255., 220., 90.]) * fade,
                                            0, 255)

        haze = 0.04 + 0.015 * math.sin(t * self.speed * 0.9) * self.intensity
        frame[self.hor_y - int(self.H*0.05):self.hor_y + int(self.H*0.02)] = np.clip(
            frame[self.hor_y - int(self.H*0.05):self.hor_y + int(self.H*0.02)] +
            np.array([240., 180., 80.]) * haze, 0, 255)

        px_now = (self.px + t * self.speed * self.psp * 15) % self.W
        py_now = (self.py - t * self.speed * self.psp * 8) % self.hor_y
        for i in range(len(px_now)):
            glow = 0.4 + 0.3 * math.sin(t * self.speed * 2.0 + self.pph[i])
            px_i = int(px_now[i])
            py_i = int(py_now[i])
            if 0 <= px_i < self.W and 0 <= py_i < self.H:
                frame[py_i, px_i] = np.clip(
                    frame[py_i, px_i] + np.array([255., 240., 160.]) * glow * 0.3 * self.intensity,
                    0, 255)

        return np.clip(frame, 0, 255).astype(np.uint8)


class NeonCityscape:
    """
    Neon-drenched urban night — glowing signs, rain puddles, pedestrians.
    Best for: Electronic, EDM, Synthwave, Dark pop, Trap, Club
    """

    def __init__(self, XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre):
        self.W, self.H = W, H
        self.speed = speed
        self.intensity = intensity
        self.ac = ac.copy()

        if not _PIL_SCENE:
            self._fb = PlasmaFractal(XX, YY, R, THETA, bg, ac, W, H, speed, intensity, genre)
            return
        self._fb = None

        img = _pil_bg(W, H, (2, 2, 6))
        draw = ImageDraw.Draw(img)

        street_y = int(H * 0.70)
        _vgrad(draw, W, 0, street_y, (2, 2, 6), (6, 4, 12))
        _vgrad(draw, W, street_y, H, (8, 8, 16), (4, 4, 10))

        np.random.seed(17)
        rng = np.random.RandomState(17)
        building_data = []
        x_cur = 0
        while x_cur < W:
            bw = rng.randint(int(W*0.08), int(W*0.20))
            bh_frac = rng.uniform(0.30, 0.65)
            building_data.append((x_cur, bw, bh_frac))
            x_cur += bw + rng.randint(0, 4)

        for (bx, bw, bh_frac) in building_data:
            btop = int(street_y * (1 - bh_frac))
            draw.rectangle([bx, btop, bx+bw, street_y], fill=(6, 4, 10))
            for wy in range(btop + 6, street_y - 4, 9):
                for wx in range(bx + 4, bx + bw - 3, 7):
                    if (wx * 11 + wy * 17) % 7 != 0:
                        wc_idx = (wx + wy) % 3
                        wc = [(200, 180, 100), (180, 200, 220), (220, 180, 200)][wc_idx]
                        wbright = rng.uniform(0.4, 1.0)
                        draw.rectangle([wx, wy, wx+4, wy+5],
                                       fill=(int(wc[0]*wbright), int(wc[1]*wbright), int(wc[2]*wbright)))

        neon_data = []
        n_cols = [(int(ac[0]), int(ac[1]), int(ac[2])),
                  (200, 50, 255), (50, 220, 255), (255, 50, 100),
                  (50, 255, 180), (255, 200, 50)]
        for (bx, bw, bh_frac) in building_data[:8]:
            btop = int(street_y * (1 - bh_frac))
            sign_y = btop + rng.randint(int(H*0.04), int(H*0.10))
            sign_x = bx + int(bw * 0.1)
            sign_w = int(bw * 0.8)
            sign_h = int(H * 0.04)
            col = n_cols[len(neon_data) % len(n_cols)]
            draw.rectangle([sign_x, sign_y, sign_x+sign_w, sign_y+sign_h],
                           outline=col, width=2)
            neon_data.append({'x': sign_x, 'y': sign_y, 'w': sign_w, 'h': sign_h,
                               'col': np.array(col, dtype=np.float32),
                               'phase': rng.uniform(0, TAU)})

        ped_imgs = []
        for px_f in [0.15, 0.38, 0.60, 0.82]:
            pi = _pil_bg(W, H, (0, 0, 0))
            pi_rgba = pi.convert('RGBA')
            pi_rgba.putalpha(0)
            di = ImageDraw.Draw(pi_rgba)
            px_i = int(px_f * W)
            _draw_human(di, px_i, street_y, s=0.85, color=(14, 10, 16, 255))
            ped_imgs.append((px_i, _to_np(pi_rgba.convert('RGB'))))

        self.bg = _to_np(img)
        self.street_y = street_y
        self.neon_data = neon_data
        self.ped_base = [px_i for (px_i, _) in ped_imgs]
        self.ped_speed = [rng.uniform(8, 22) * (1 if i%2==0 else -1) for i in range(4)]

        np.random.seed(23)
        n_d = 320
        self.rain_x = np.random.uniform(0, W, n_d).astype(np.float32)
        self.rain_y = np.random.uniform(0, H, n_d).astype(np.float32)
        self.rain_sp = np.random.uniform(200, 420, n_d).astype(np.float32)
        self.rain_ln = np.random.uniform(5, 15, n_d).astype(np.float32)
        self.rain_ax = np.random.uniform(-0.12, -0.06, n_d).astype(np.float32)

    def render(self, t: float) -> np.ndarray:
        if self._fb:
            return self._fb.render(t)
        frame = self.bg.copy()

        for nd in self.neon_data:
            flicker = 0.6 + 0.4 * math.sin(t * self.speed * 3.5 + nd['phase'])
            glow_alpha = 0.18 * flicker * self.intensity
            col = nd['col']
            nx0 = max(0, nd['x'] - 4); nx1 = min(self.W, nd['x'] + nd['w'] + 4)
            ny0 = max(0, nd['y'] - 4); ny1 = min(self.H, nd['y'] + nd['h'] + 4)
            if ny1 > ny0 and nx1 > nx0:
                frame[ny0:ny1, nx0:nx1] = np.clip(
                    frame[ny0:ny1, nx0:nx1] + col * glow_alpha, 0, 255)
            inner_a = 0.7 * flicker * self.intensity
            iy0 = max(0, nd['y']); iy1 = min(self.H, nd['y'] + nd['h'])
            ix0 = max(0, nd['x']); ix1 = min(self.W, nd['x'] + nd['w'])
            if iy1 > iy0 and ix1 > ix0:
                frame[iy0:iy1, ix0:ix1] = np.clip(
                    frame[iy0:iy1, ix0:ix1] + col * inner_a, 0, 255)

        sy = self.street_y
        refl_src = frame[max(0, sy-int(self.H*0.12)):sy].copy()
        refl_h = refl_src.shape[0]
        if refl_h > 0 and sy + refl_h <= self.H:
            frame[sy:sy+refl_h] = np.clip(
                frame[sy:sy+refl_h] + refl_src[::-1] * 0.22, 0, 255)

        y_now = (self.rain_y + self.rain_sp * t * self.speed) % self.H
        x_now = (self.rain_x + self.rain_ax * self.rain_sp * t * self.speed) % self.W
        for i in range(len(x_now)):
            rx = int(x_now[i]); ry = int(y_now[i])
            ry2 = min(self.H-1, int(ry + self.rain_ln[i]))
            if 0 <= rx < self.W and ry2 > ry:
                frame[ry:ry2, max(0,rx-1):rx+1] = np.clip(
                    frame[ry:ry2, max(0,rx-1):rx+1] +
                    np.array([120., 130., 180.]) * 0.4 * self.intensity, 0, 255)

        for i, (pb, ps) in enumerate(zip(self.ped_base, self.ped_speed)):
            px_now = int(pb + ps * t * self.speed) % self.W
            pi_img = Image.new('RGB', (self.W, self.H), (0, 0, 0))
            pi_draw = ImageDraw.Draw(pi_img)
            walk_bob = int(math.sin(t * self.speed * 4.0 + i) * 2)
            _draw_human(pi_draw, px_now, sy + walk_bob, s=0.82, color=(16, 12, 20))
            ped_arr = _to_np(pi_img)
            mask = (ped_arr.sum(axis=2) > 30).astype(np.float32)[:, :, None]
            frame = frame * (1 - mask) + ped_arr.astype(np.float32) * mask

        return np.clip(frame, 0, 255).astype(np.uint8)


# ── Scene Prompt → Style Mapping ──────────────────────────────────────────────

_SCENE_KEYWORDS = {
    'concert_stage': [
        'concert', 'stage', 'crowd', 'perform', 'live', 'show', 'gig',
        'audience', 'venue', 'spotlight', 'tour', 'arena', 'festival',
        'microphone', 'mic', 'artist on stage', 'singer', 'rapper performing',
    ],
    'city_nights': [
        'city', 'night', 'urban', 'rain', 'street', 'downtown', 'metropolis',
        'skyline', 'buildings', 'rooftop', 'alley', 'downtown', 'skyscraper',
        'nighttime', 'car lights', 'traffic',
    ],
    'studio_session': [
        'studio', 'record', 'session', 'mixing', 'producer', 'booth',
        'microphone', 'console', 'track', 'beats', 'headphones', 'engineer',
        'music production', 'recording booth',
    ],
    'golden_hour': [
        'outdoor', 'sunset', 'sunrise', 'nature', 'golden', 'field',
        'sky', 'landscape', 'outside', 'horizon', 'countryside', 'hills',
        'trees', 'daylight', 'sunlight', 'open air',
    ],
    'neon_cityscape': [
        'neon', 'club', 'bar', 'lounge', 'disco', 'nightclub', 'dance',
        'rave', 'underground', 'synthwave', 'cyberpunk', 'futuristic',
        'glowing', 'lights', 'party scene',
    ],
}

_SCENE_GENRE_MAP = {
    'hip-hop':    'city_nights',
    'trap':       'neon_cityscape',
    'drill':      'city_nights',
    'r&b':        'studio_session',
    'soul':       'studio_session',
    'pop':        'concert_stage',
    'electronic': 'neon_cityscape',
    'edm':        'neon_cityscape',
    'afrobeats':  'concert_stage',
    'latin':      'concert_stage',
    'country':    'golden_hour',
    'indie':      'golden_hour',
    'folk':       'golden_hour',
    'rock':       'concert_stage',
    'metal':      'concert_stage',
    'gospel':     'golden_hour',
    'ambient':    'studio_session',
}


def parse_scene_prompt(prompt: str, genre: str = '') -> str:
    """
    Map a free-text scene description to the best matching scene style.
    Falls back to genre-based scene, then 'concert_stage'.
    """
    text = prompt.lower()
    scores: dict = {k: 0 for k in _SCENE_KEYWORDS}
    for style, keywords in _SCENE_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[style] += 1
    best = max(scores, key=lambda k: scores[k])
    if scores[best] > 0:
        return best
    if genre and genre.lower() in _SCENE_GENRE_MAP:
        return _SCENE_GENRE_MAP[genre.lower()]
    return 'concert_stage'


# ── Style Registry & Genre Defaults ───────────────────────────────────────────

STYLES = {
    'plasma_fractal':  PlasmaFractal,
    'galaxy_spiral':   GalaxySpiral,
    'neon_tunnel':     NeonTunnel,
    'aurora_curtains': AuroraCurtains,
    'warp_speed':      WarpSpeed,
    'liquid_metal':    LiquidMetal,
    'fire_embers':     FireEmbers,
    'crystal_facets':  CrystalFacets,
    'concert_stage':   ConcertStage,
    'city_nights':     CityNights,
    'studio_session':  StudioSession,
    'golden_hour':     GoldenHour,
    'neon_cityscape':  NeonCityscape,
}

SCENE_STYLES = {
    'concert_stage', 'city_nights', 'studio_session', 'golden_hour', 'neon_cityscape'
}

GENRE_DEFAULTS = {
    'hip-hop':    'city_nights',
    'trap':       'neon_cityscape',
    'drill':      'city_nights',
    'r&b':        'studio_session',
    'soul':       'studio_session',
    'pop':        'concert_stage',
    'electronic': 'neon_cityscape',
    'edm':        'neon_cityscape',
    'afrobeats':  'concert_stage',
    'latin':      'concert_stage',
    'country':    'golden_hour',
    'indie':      'golden_hour',
    'folk':       'golden_hour',
    'rock':       'concert_stage',
    'metal':      'concert_stage',
    'gospel':     'golden_hour',
    'minimal':    'crystal_facets',
    'ambient':    'studio_session',
}


# ── Entry Point ────────────────────────────────────────────────────────────────

def main():
    cfg = json.loads(sys.argv[1] if len(sys.argv) > 1 else '{}')

    W           = int(cfg.get('width',        1080))
    H           = int(cfg.get('height',       1920))
    dur         = float(cfg.get('duration',   15.0))
    fps         = int(cfg.get('fps',          30))
    scale       = int(cfg.get('render_scale', 2))   # internal resolution divisor
    genre       = cfg.get('genre',            'default').lower()
    speed       = float(cfg.get('speed',      1.0))
    intensity   = float(cfg.get('intensity',  0.88))
    eq_bars     = bool(cfg.get('eq_bars',     True))
    eq_h_frac   = float(cfg.get('eq_height',  0.18))
    n_eq_bars   = int(cfg.get('eq_n_bars',    40))

    topic  = cfg.get('topic',  '')
    tone   = cfg.get('tone',   'default')

    # ── Neural-net style and parameter prediction ──────────────────────────────
    # If the caller passes an explicit style, honour it but still apply NN color
    # science (hue/sat/val adjustments) to make the palette music-appropriate.
    explicit_style = cfg.get('style', '')
    nn_params: dict = {}

    if _NN_AVAILABLE and genre != 'default':
        try:
            nn_params = _vnn.predict_visual_params(
                genre, topic, tone,
                temperature=0.65,   # slight randomness for visual variety
            )
        except Exception:
            nn_params = {}

    # scene_prompt: free-text description → auto-select scene style
    scene_prompt = cfg.get('scene_prompt', '').strip()

    # Style selection: explicit cfg → scene_prompt → NN prediction → genre lookup → fallback
    if explicit_style and explicit_style in STYLES:
        style = explicit_style
    elif scene_prompt:
        style = parse_scene_prompt(scene_prompt, genre)
    elif nn_params.get('style') and nn_params['style'] in STYLES:
        style = nn_params['style']
    else:
        style = GENRE_DEFAULTS.get(genre, 'concert_stage')
        if style not in STYLES:
            style = 'concert_stage'

    # NN overrides for speed / intensity (only if not explicitly passed)
    if nn_params:
        if 'speed' not in cfg:
            speed     = nn_params.get('speed',     speed)
        if 'intensity' not in cfg:
            intensity = nn_params.get('intensity', intensity)

    # Parse base colours
    bg_hex = str(cfg.get('bg', '0x1a1a2e'))
    ac_hex = str(cfg.get('ac', '0xe94560'))

    # Apply NN colour science (HSV hue/sat/val adjustments) when available
    if nn_params.get('adjust_color'):
        adj = nn_params['adjust_color']
        bg  = adj(bg_hex)
        ac  = adj(ac_hex)
    else:
        bg = parse_hex(bg_hex)
        ac = parse_hex(ac_hex)

    # Internal render resolution (scale down for speed, FFmpeg upscales)
    rW = W // scale
    rH = H // scale

    # Precompute static coordinate grids at internal resolution
    x      = np.linspace(-1.0, 1.0, rW, dtype=np.float32)
    y      = np.linspace(-1.0, 1.0, rH, dtype=np.float32)
    XX, YY = np.meshgrid(x, y)
    R      = np.sqrt(XX ** 2 + YY ** 2).astype(np.float32)
    THETA  = np.arctan2(YY, XX).astype(np.float32)

    StyleClass = STYLES[style]
    gen = StyleClass(XX, YY, R, THETA, bg, ac, rW, rH, speed, intensity, genre)

    num_frames = int(dur * fps)
    stdout = sys.stdout.buffer

    # Pre-render EQ params at full W resolution (bars are 1D, negligible cost)
    for fi in range(num_frames):
        t = fi / fps

        # Render background at internal resolution
        frame = gen.render(t)                  # rH × rW × 3  uint8

        # Upscale to output resolution using numpy repeat (fast, nearest-neighbour)
        if scale > 1:
            frame = frame.repeat(scale, axis=0).repeat(scale, axis=1)
            # Trim if repeat overshot
            frame = frame[:H, :W, :]

        # Equalizer bars overlay at output resolution
        if eq_bars:
            eq = make_eq_frame(W, H, t, ac, eq_h_frac, n_eq_bars)
            frame = blend_eq(frame, eq, H)

        stdout.write(frame.tobytes())

    stdout.flush()


if __name__ == '__main__':
    main()
