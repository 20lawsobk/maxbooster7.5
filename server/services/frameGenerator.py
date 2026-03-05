#!/usr/bin/env python3
"""
Max Booster — Music Video Frame Generator
NumPy-powered procedural animation engine, music-industry tuned.

Pipes raw RGB24 frames to stdout for FFmpeg to encode.
Usage: python3 frameGenerator.py '<JSON_CONFIG>'

Config keys:
  style       : visual style name (see STYLES dict)
  width       : output width  (default 1080)
  height      : output height (default 1920)
  duration    : seconds (default 15)
  fps         : frames per second (default 30)
  render_scale: internal resolution divisor for speed (default 2 → half-res + FFmpeg upscale)
  bg          : hex background color e.g. '0x1a1a2e'
  ac          : hex accent color    e.g. '0xe94560'
  genre       : music genre for style tuning
  speed       : animation speed multiplier (default 1.0)
  intensity   : visual brightness/saturation 0–1 (default 0.85)
  eq_bars     : bool, render equalizer visualizer (default True)
  eq_height   : fraction of frame height for eq zone (default 0.18)
"""

import sys
import os
import json
import math
import numpy as np

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
}

GENRE_DEFAULTS = {
    'hip-hop':    'neon_tunnel',
    'trap':       'fire_embers',
    'drill':      'neon_tunnel',
    'r&b':        'galaxy_spiral',
    'soul':       'galaxy_spiral',
    'pop':        'plasma_fractal',
    'electronic': 'plasma_fractal',
    'edm':        'warp_speed',
    'afrobeats':  'plasma_fractal',
    'latin':      'plasma_fractal',
    'country':    'aurora_curtains',
    'indie':      'aurora_curtains',
    'folk':       'aurora_curtains',
    'rock':       'liquid_metal',
    'metal':      'fire_embers',
    'minimal':    'crystal_facets',
    'ambient':    'aurora_curtains',
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

    # Style selection: explicit cfg → NN prediction → genre lookup → fallback
    if explicit_style and explicit_style in STYLES:
        style = explicit_style
    elif nn_params.get('style') and nn_params['style'] in STYLES:
        style = nn_params['style']
    else:
        style = GENRE_DEFAULTS.get(genre, 'plasma_fractal')
        if style not in STYLES:
            style = 'plasma_fractal'

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
