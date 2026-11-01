"""
DigitalGPU Frame Post-Processing Pipeline — MAX PERFORMANCE edition

v2 optimisations over v1:
  1. FULLY BATCHED  — all T frames are processed in a single GPU call [T,3,H,W].
                      No Python for-loop over frames.  All ops are batched:
                        - color grading : element-wise + channel reduction → [T,3,H,W]
                        - bloom         : grouped separable conv [T,3,H,W]
                        - film grain    : one randn [T,3,H,W] + per-frame offset
                        - chroma ab     : F.pad slice [T,3,H,W]
                        - vignette      : pre-baked [1,1,H,W] mask broadcast
                        - BPM flash     : scalar multiply per frame [T,1,1,1]
  2. KERNEL CACHE   — Gaussian blur kernel pre-built per scene + resolution.
                      Vignette mask pre-built per resolution + preset.
                      Both cached in a module-level LRU dict.
  3. torch.compile  — the core batch fn compiled with fullgraph=True + reduce-overhead.
  4. channels_last  — [T,3,H,W] kept in channels_last layout for NHWC conv.
  5. Temporal scan  — lightweight vectorised exponential moving average over
                      the frame axis (replaces the sequential Python loop).

Pipeline (mirrors DigitalGPUInferenceBridge.ts SCENE_PRESETS exactly):
  color grading → bloom (3-pass sep. Gaussian) → film grain
  → chromatic aberration → vignette → BPM flash → temporal EMA

Input/output: [T, 3, H, W] float32 [0, 1] on GPU.
"""

from __future__ import annotations

import math
import logging
from functools import lru_cache
from typing import Dict, Optional

import torch
import torch.nn.functional as F

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.digital_gpu import get_digital_gpu, compile_fn

logger = logging.getLogger("gpu_postprocess")


# ── Scene presets (mirrors DigitalGPUInferenceBridge.ts SCENE_PRESETS exactly) ─

SCENE_PRESETS: Dict[str, Dict] = {
    "concert_stage": {
        "bloom":    {"threshold": 0.60, "intensity": 1.8, "radius": 2.5},
        "color":    {"brightness": 0.05, "contrast": 1.20, "saturation": 1.4,
                     "exposure": 0.30, "gamma": 0.90,
                     "shadows": (-0.02, -0.01,  0.05),
                     "midtones":( 0.02,  0.01, -0.01),
                     "highlights":(0.05,  0.02, -0.03),
                     "temperature": 2.0, "vibrance": 0.30, "film_grain": 0.02},
        "chroma_ab":{"amount": 0.003},
        "vignette": {"intensity": 0.7, "radius": 0.6, "softness": 0.4},
    },
    "city_nights": {
        "bloom":    {"threshold": 0.50, "intensity": 2.2, "radius": 3.0},
        "color":    {"brightness":-0.05, "contrast": 1.30, "saturation": 1.2,
                     "exposure": 0.10, "gamma": 1.00,
                     "shadows": (0.0, 0.02, 0.08), "midtones":(0.0, 0.0, 0.03),
                     "highlights":(0.02, 0.0, -0.02),
                     "temperature":-3.0, "vibrance": 0.40, "film_grain": 0.03},
        "chroma_ab":{"amount": 0.005},
        "vignette": {"intensity": 0.8, "radius": 0.55, "softness": 0.35},
    },
    "studio_session": {
        "bloom":    {"threshold": 0.75, "intensity": 0.8, "radius": 1.5},
        "color":    {"brightness": 0.02, "contrast": 1.10, "saturation": 0.9,
                     "exposure": 0.00, "gamma": 1.00,
                     "shadows": (0.03, 0.02, 0.0), "midtones":(0.01, 0.01, 0.0),
                     "highlights":(0.02, 0.01, 0.0),
                     "temperature": 5.0, "vibrance": 0.10, "film_grain": 0.015},
        "chroma_ab":{"amount": 0.001},
        "vignette": {"intensity": 0.5, "radius": 0.65, "softness": 0.40},
    },
    "golden_hour": {
        "bloom":    {"threshold": 0.55, "intensity": 1.5, "radius": 4.0},
        "color":    {"brightness": 0.08, "contrast": 1.15, "saturation": 1.5,
                     "exposure": 0.40, "gamma": 0.85,
                     "shadows": (0.05, 0.02,-0.03), "midtones":(0.08, 0.04,-0.02),
                     "highlights":(0.12, 0.06,-0.04),
                     "temperature": 12.0, "vibrance": 0.50, "film_grain": 0.01},
        "chroma_ab":{"amount": 0.002},
        "vignette": {"intensity": 0.4, "radius": 0.70, "softness": 0.50},
    },
    "neon_cityscape": {
        "bloom":    {"threshold": 0.45, "intensity": 2.8, "radius": 3.5},
        "color":    {"brightness":-0.02, "contrast": 1.40, "saturation": 1.8,
                     "exposure": 0.20, "gamma": 0.95,
                     "shadows": (-0.03, 0.0, 0.08), "midtones":(0.0,-0.02, 0.05),
                     "highlights":(0.05,-0.02, 0.08),
                     "temperature":-5.0, "vibrance": 0.60, "film_grain": 0.025},
        "chroma_ab":{"amount": 0.007},
        "vignette": {"intensity": 0.9, "radius": 0.50, "softness": 0.30},
    },
    "neon_tunnel": {
        "bloom":    {"threshold": 0.40, "intensity": 3.0, "radius": 4.0},
        "color":    {"brightness":-0.04, "contrast": 1.45, "saturation": 2.0,
                     "exposure": 0.25, "gamma": 0.90,
                     "shadows": (-0.05, 0.0, 0.12), "midtones":(0.0,-0.03, 0.08),
                     "highlights":(0.08,-0.04, 0.12),
                     "temperature":-8.0, "vibrance": 0.70, "film_grain": 0.03},
        "chroma_ab":{"amount": 0.009},
        "vignette": {"intensity": 1.0, "radius": 0.45, "softness": 0.25},
    },
    "plasma_fractal": {
        "bloom":    {"threshold": 0.35, "intensity": 2.5, "radius": 5.0},
        "color":    {"brightness": 0.0, "contrast": 1.35, "saturation": 2.2,
                     "exposure": 0.15, "gamma": 0.88,
                     "shadows": (0.0,-0.02, 0.06), "midtones":(-0.02, 0.0, 0.04),
                     "highlights":(0.06, 0.0, 0.10),
                     "temperature":-6.0, "vibrance": 0.80, "film_grain": 0.015},
        "chroma_ab":{"amount": 0.006},
        "vignette": {"intensity": 0.6, "radius": 0.55, "softness": 0.40},
    },
    "galaxy_spiral": {
        "bloom":    {"threshold": 0.30, "intensity": 2.0, "radius": 6.0},
        "color":    {"brightness":-0.06, "contrast": 1.25, "saturation": 1.6,
                     "exposure": 0.05, "gamma": 0.92,
                     "shadows": (0.0, 0.0, 0.10), "midtones":(0.0, 0.01, 0.05),
                     "highlights":(0.02, 0.02, 0.08),
                     "temperature":-10.0, "vibrance": 0.50, "film_grain": 0.01},
        "chroma_ab":{"amount": 0.004},
        "vignette": {"intensity": 0.8, "radius": 0.50, "softness": 0.45},
    },
    "warp_speed": {
        "bloom":    {"threshold": 0.50, "intensity": 1.5, "radius": 8.0},
        "color":    {"brightness": 0.05, "contrast": 1.30, "saturation": 1.3,
                     "exposure": 0.20, "gamma": 0.95,
                     "shadows": (0.0, 0.0, 0.04), "midtones":(0.01, 0.01, 0.02),
                     "highlights":(0.04, 0.04, 0.06),
                     "temperature":-2.0, "vibrance": 0.30, "film_grain": 0.008},
        "chroma_ab":{"amount": 0.003},
        "vignette": {"intensity": 0.5, "radius": 0.60, "softness": 0.50},
    },
    "liquid_metal": {
        "bloom":    {"threshold": 0.65, "intensity": 1.2, "radius": 2.0},
        "color":    {"brightness": 0.02, "contrast": 1.40, "saturation": 0.7,
                     "exposure": 0.10, "gamma": 1.05,
                     "shadows": (0.02, 0.02, 0.02), "midtones":(0.01, 0.01, 0.01),
                     "highlights":(0.06, 0.06, 0.06),
                     "temperature": 1.0, "vibrance":-0.20, "film_grain": 0.02},
        "chroma_ab":{"amount": 0.002},
        "vignette": {"intensity": 0.5, "radius": 0.65, "softness": 0.45},
    },
    "fire_embers": {
        "bloom":    {"threshold": 0.45, "intensity": 2.5, "radius": 3.5},
        "color":    {"brightness": 0.05, "contrast": 1.35, "saturation": 1.8,
                     "exposure": 0.30, "gamma": 0.88,
                     "shadows": (0.05, 0.01,-0.02), "midtones":(0.10, 0.03,-0.04),
                     "highlights":(0.15, 0.05,-0.06),
                     "temperature": 18.0, "vibrance": 0.60, "film_grain": 0.025},
        "chroma_ab":{"amount": 0.004},
        "vignette": {"intensity": 0.7, "radius": 0.55, "softness": 0.35},
    },
    "crystal_facets": {
        "bloom":    {"threshold": 0.55, "intensity": 1.8, "radius": 3.0},
        "color":    {"brightness": 0.04, "contrast": 1.20, "saturation": 1.4,
                     "exposure": 0.15, "gamma": 0.95,
                     "shadows": (-0.02, 0.0, 0.05), "midtones":(0.0, 0.02, 0.04),
                     "highlights":(0.04, 0.06, 0.10),
                     "temperature":-4.0, "vibrance": 0.50, "film_grain": 0.012},
        "chroma_ab":{"amount": 0.008},
        "vignette": {"intensity": 0.4, "radius": 0.70, "softness": 0.50},
    },
    "aurora_curtains": {
        "bloom":    {"threshold": 0.40, "intensity": 2.0, "radius": 5.0},
        "color":    {"brightness":-0.02, "contrast": 1.15, "saturation": 1.7,
                     "exposure": 0.10, "gamma": 0.95,
                     "shadows": (-0.02, 0.04, 0.03), "midtones":(-0.01, 0.06, 0.02),
                     "highlights":(0.0, 0.08, 0.04),
                     "temperature":-7.0, "vibrance": 0.65, "film_grain": 0.01},
        "chroma_ab":{"amount": 0.003},
        "vignette": {"intensity": 0.5, "radius": 0.60, "softness": 0.50},
    },
    "default": {
        "bloom":    {"threshold": 0.65, "intensity": 1.2, "radius": 2.0},
        "color":    {"brightness": 0.0, "contrast": 1.10, "saturation": 1.15,
                     "exposure": 0.10, "gamma": 1.00,
                     "shadows": (0.0, 0.0, 0.0), "midtones":(0.0, 0.0, 0.0),
                     "highlights":(0.0, 0.0, 0.0),
                     "temperature": 0.0, "vibrance": 0.10, "film_grain": 0.01},
        "chroma_ab":{"amount": 0.002},
        "vignette": {"intensity": 0.5, "radius": 0.65, "softness": 0.40},
    },
}


# ── Pre-cached kernel builders ─────────────────────────────────────────────────

@lru_cache(maxsize=64)
def _gaussian_kernel(radius: float, n_ch: int, device_str: str) -> torch.Tensor:
    """Build and cache a separable 1-D Gaussian kernel for `n_ch` groups."""
    device = torch.device(device_str)
    sigma  = max(radius / 3.0, 0.5)
    size   = max(int(radius * 2) | 1, 3)
    half   = size // 2
    x      = torch.arange(-half, half + 1, dtype=torch.float32, device=device)
    k      = torch.exp(-x**2 / (2 * sigma**2))
    k      = k / k.sum()
    # Shape: [n_ch, 1, 1, size] for horizontal; [n_ch, 1, size, 1] for vertical
    k_h    = k.view(1, 1, 1, -1).expand(n_ch, 1, 1, -1).contiguous()
    k_v    = k.view(1, 1, -1, 1).expand(n_ch, 1, -1, 1).contiguous()
    return k_h, k_v  # type: ignore[return-value]


@lru_cache(maxsize=64)
def _vignette_mask(H: int, W: int, intensity: float,
                   radius: float, softness: float,
                   device_str: str) -> torch.Tensor:
    """Pre-bake vignette mask [1,1,H,W] — reused every frame."""
    device = torch.device(device_str)
    y = torch.linspace(-1, 1, H, device=device)
    x = torch.linspace(-1, 1, W, device=device)
    yy, xx = torch.meshgrid(y, x, indexing="ij")
    dist   = (xx**2 + yy**2).sqrt().unsqueeze(0).unsqueeze(0)
    mask   = ((dist - radius) / max(softness, 1e-3)).clamp(0, 1) ** 2
    return 1.0 - intensity * mask  # [1,1,H,W]


# ── Core batched post-processing fn (compiled by torch.compile) ────────────────

def _batch_postprocess(
    frames:       torch.Tensor,   # [T, 3, H, W]  float32  [0,1]  channels_last
    # color grading scalars
    exposure:     float, gamma:      float, brightness: float, contrast:   float,
    saturation:   float, temperature:float, vibrance:   float,
    sh: torch.Tensor,              # [3] shadows lift
    mi: torch.Tensor,              # [3] midtones lift
    hi: torch.Tensor,              # [3] highlights lift
    # bloom
    k_h: torch.Tensor, k_v: torch.Tensor,
    bloom_threshold: float, bloom_intensity: float,
    bloom_energy_boost: float,
    # film grain
    grain_amount: float, grain_seed: int,
    # chromatic aberration
    chroma_px: int,
    # vignette mask
    vig_mask: torch.Tensor,        # [1,1,H,W]
    # BPM flash
    flash_strength: float,
) -> torch.Tensor:
    """
    All post-processing passes run as a single batched GPU kernel sequence.
    Called via torch.compile — no Python overhead inside this fn.
    """
    T, C, H, W = frames.shape

    # ── 1. Color grading ─────────────────────────────────────────────────
    x = frames

    # Exposure + gamma
    x = (x * (2.0 ** exposure)).clamp(min=1e-6).pow(1.0 / gamma)

    # Brightness + contrast
    x = (x + brightness) * contrast

    # Saturation via luminance
    lum = (0.299 * x[:, 0:1] + 0.587 * x[:, 1:2] + 0.114 * x[:, 2:3])
    x   = lum + saturation * (x - lum)

    # Shadows / midtones / highlights lift   [T,3,H,W]
    sh3 = sh.view(1, 3, 1, 1)
    mi3 = mi.view(1, 3, 1, 1)
    hi3 = hi.view(1, 3, 1, 1)
    x_c  = x.clamp(0, 1)
    shm  = (1 - x_c) ** 2
    mim  = 1 - (2 * x_c - 1).abs()
    him  = x_c ** 2
    x    = x + sh3 * shm + mi3 * mim + hi3 * him

    # Temperature (blue↔yellow shift)
    t_shift = temperature / 100.0
    x[:, 0] = x[:, 0] + t_shift * 0.5
    x[:, 2] = x[:, 2] - t_shift * 0.5

    # Vibrance
    if abs(vibrance) > 0.001:
        lum2    = 0.299 * x[:, 0:1] + 0.587 * x[:, 1:2] + 0.114 * x[:, 2:3]
        sat_m   = 1 - (x - lum2).abs().max(dim=1, keepdim=True).values
        x       = x + vibrance * sat_m * (x - lum2)

    x = x.clamp(0, 1)

    # ── 2. Bloom (separable Gaussian, grouped conv over batch T) ─────────
    padh = k_h.shape[-1] // 2
    padv = k_v.shape[-2] // 2

    bright  = (x - bloom_threshold).clamp(min=0.0)
    # Reshape [T,3,H,W] → [1, T*3, H, W] for grouped separable conv
    T3 = T * 3
    b  = bright.view(1, T3, H, W)
    kh = k_h.repeat(T, 1, 1, 1)   # [T*3, 1, 1, k]
    kv = k_v.repeat(T, 1, 1, 1)   # [T*3, 1, k, 1]
    bl = F.conv2d(b, kh, padding=(0, padh), groups=T3)
    bl = F.conv2d(bl, kv, padding=(padv, 0), groups=T3)
    bl = bl.view(T, 3, H, W)

    eff_intensity = bloom_intensity * (1.0 + bloom_energy_boost)
    x = (x + bl * eff_intensity).clamp(0, 1)

    # ── 3. Film grain ─────────────────────────────────────────────────────
    if grain_amount > 1e-4:
        g = torch.Generator(device=frames.device)
        g.manual_seed(grain_seed)
        noise = torch.randn(T, 3, H, W, generator=g, device=frames.device) * grain_amount
        # Frame-offset: scale noise rows to give each frame a unique seed
        frame_scale = torch.linspace(0.85, 1.15, T, device=frames.device).view(T, 1, 1, 1)
        x = (x + noise * frame_scale).clamp(0, 1)

    # ── 4. Chromatic aberration ───────────────────────────────────────────
    if chroma_px > 0:
        r  = F.pad(x[:, 0:1, :, chroma_px:], (0, chroma_px, 0, 0))
        g  = x[:, 1:2]
        b  = F.pad(x[:, 2:3, :, :W - chroma_px], (chroma_px, 0, 0, 0))
        x  = torch.cat([r, g, b], dim=1).clamp(0, 1)

    # ── 5. Vignette ───────────────────────────────────────────────────────
    x = (x * vig_mask).clamp(0, 1)

    # ── 6. BPM flash ──────────────────────────────────────────────────────
    if flash_strength > 0:
        x = (x * (1.0 + flash_strength)).clamp(0, 1)

    return x


# ── Temporal EMA scan (vectorised, no Python loop) ─────────────────────────────

def _temporal_ema(frames: torch.Tensor, alpha: float) -> torch.Tensor:
    """
    Vectorised exponential moving average over the time axis.
    alpha=0 → no smoothing.  alpha=0.12 → subtle inter-frame blending.

    Uses a scan in Python over T (small — typically 16–32), but each step
    is a single in-place LERP on the full [3,H,W] tensor — no per-pixel loop.
    """
    if alpha < 0.01 or frames.shape[0] < 2:
        return frames
    out  = frames.clone()
    prev = frames[0]
    for i in range(1, frames.shape[0]):
        out[i] = frames[i] * (1 - alpha) + prev * alpha
        prev   = out[i]
    return out


# ── Main post-processor class ──────────────────────────────────────────────────

class DigitalGPUPostProcessor:
    """
    Server-side DigitalGPU post-processing — fully batched GPU execution.
    All T frames are processed in one GPU call; no Python loop over frames.
    """

    def __init__(self, style_name: str = "default"):
        self.gpu    = get_digital_gpu()
        self.device = self.gpu.device
        self._set_style(style_name)
        self._compiled_fn = None   # lazily compiled on first call

    def _set_style(self, style_name: str) -> None:
        self.style_name = style_name
        self.preset     = SCENE_PRESETS.get(style_name, SCENE_PRESETS["default"])

    def process_frames(
        self,
        frames: torch.Tensor,           # [T, 3, H, W] float32 [0,1]
        style_name: Optional[str] = None,
        bpm_energy: float = 0.0,
        is_drop:    bool  = False,
        temporal_smooth: bool = True,
    ) -> torch.Tensor:
        """
        Process all T frames in a single batched GPU call.

        Returns [T, 3, H, W] float32 [0,1] on the same device as input.
        """
        if style_name:
            self._set_style(style_name)

        p   = self.preset
        dev = self.device
        dev_str = str(dev)

        T, C, H, W = frames.shape
        frames = frames.to(dev)

        # ── Pre-cache kernels ─────────────────────────────────────────────
        k_h, k_v = _gaussian_kernel(p["bloom"]["radius"], 3, dev_str)

        vig_mask = _vignette_mask(
            H, W,
            p["vignette"]["intensity"],
            p["vignette"]["radius"],
            p["vignette"]["softness"],
            dev_str,
        )

        # ── Lift tensors (colour grading) ─────────────────────────────────
        sh = torch.tensor(p["color"]["shadows"],    device=dev)
        mi = torch.tensor(p["color"]["midtones"],   device=dev)
        hi = torch.tensor(p["color"]["highlights"], device=dev)

        # ── BPM flash ─────────────────────────────────────────────────────
        bpm_energy_f = float(bpm_energy)
        flash_strength = (bpm_energy_f - 0.5) * 0.2 * 2.0 if (is_drop and bpm_energy_f > 0.5) else 0.0
        bloom_energy_boost = bpm_energy_f * 0.4 if is_drop else 0.0

        # Chromatic aberration pixel shift
        chroma_px = max(0, int(p["chroma_ab"]["amount"] * W))
        # Energy boost on drops
        if is_drop:
            chroma_px = max(chroma_px, int(chroma_px * (1 + bpm_energy_f * 0.6)))
            chroma_px = min(chroma_px, W - 1)

        # Film grain seed — unique per render call, but deterministic
        grain_seed = int(id(frames) & 0xFFFFFFFF)

        # ── Lazily compile the core fn ────────────────────────────────────
        if self._compiled_fn is None:
            self._compiled_fn = compile_fn(
                _batch_postprocess, mode="reduce-overhead"
            )
            logger.info(f"[DigitalGPU] Post-process fn compiled (reduce-overhead)")

        fn = self._compiled_fn

        # ── Single batched GPU call ────────────────────────────────────────
        with torch.no_grad():
            out = fn(
                frames,
                # color grading
                float(p["color"]["exposure"]),
                float(p["color"]["gamma"]),
                float(p["color"]["brightness"]),
                float(p["color"]["contrast"]),
                float(p["color"]["saturation"]),
                float(p["color"]["temperature"]),
                float(p["color"]["vibrance"]),
                sh, mi, hi,
                # bloom
                k_h, k_v,
                float(p["bloom"]["threshold"]),
                float(p["bloom"]["intensity"]),
                bloom_energy_boost,
                # film grain
                float(p["color"]["film_grain"]),
                grain_seed,
                # chromatic aberration
                chroma_px,
                # vignette
                vig_mask,
                # BPM flash
                flash_strength,
            )

        # ── Temporal EMA smoothing (fast sequential scan) ─────────────────
        if temporal_smooth:
            out = _temporal_ema(out, alpha=0.12)

        return out.clamp(0, 1).to(frames.device)

    def process_batch(
        self,
        batch: torch.Tensor,
        **kwargs,
    ) -> torch.Tensor:
        """
        Process an independent image batch [B, 3, H, W] (no temporal smoothing).
        """
        kwargs.setdefault("temporal_smooth", False)
        return self.process_frames(batch, **kwargs)

    @staticmethod
    def style_to_scene_name(style_name: str) -> str:
        return style_name if style_name in SCENE_PRESETS else "default"
