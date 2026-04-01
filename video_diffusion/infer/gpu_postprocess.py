"""
DigitalGPU Frame Post-Processing Pipeline (Server-Side)

PyTorch-CUDA equivalent of the client-side DigitalGPUInferenceBridge.ts WebGL chain.
Both pipelines produce visually identical output — the server-side version is used
for final frame baking before MP4 encoding; the client-side version provides real-time
audio-reactive rendering in the browser.

Pipeline (mirrors WebGL passes exactly):
  1. Colour grading  — shadows / midtones / highlights matrix + exposure + gamma
  2. Bloom           — separable Gaussian on bright regions (3 passes)
  3. Film grain      — procedural noise overlay (time-seeded per frame)
  4. Chromatic ab.   — RGB channel spatial offset
  5. Vignette        — radial darkening
  6. BPM flash       — energy-scaled brightness pulse locked to beat boundaries

Server adds two things the client WebGL cannot do:
  a. Temporal consistency — optical-flow-lite smoothing across frames
  b. BPM-locked flashes   — exact beat boundary timing from CreativeContext

Input:  torch.Tensor  [B, 3, H, W]  float32  [0, 1]
Output: torch.Tensor  [B, 3, H, W]  float32  [0, 1]
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn.functional as F

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.digital_gpu import get_digital_gpu


# ── Scene presets (mirrors DigitalGPUInferenceBridge.ts SCENE_PRESETS exactly) ─

SCENE_PRESETS: Dict[str, Dict] = {
    "concert_stage": {
        "bloom":       {"threshold": 0.60, "intensity": 1.8, "radius": 2.5},
        "color":       {"brightness": 0.05, "contrast": 1.20, "saturation": 1.4,
                        "exposure": 0.30, "gamma": 0.90,
                        "shadows": (-0.02, -0.01, 0.05),
                        "midtones": (0.02,  0.01, -0.01),
                        "highlights": (0.05, 0.02, -0.03),
                        "temperature": 2.0, "vibrance": 0.30, "film_grain": 0.02},
        "chroma_ab":   {"amount": 0.003},
        "vignette":    {"intensity": 0.7, "radius": 0.6, "softness": 0.4},
    },
    "city_nights": {
        "bloom":       {"threshold": 0.50, "intensity": 2.2, "radius": 3.0},
        "color":       {"brightness": -0.05, "contrast": 1.30, "saturation": 1.2,
                        "exposure": 0.10, "gamma": 1.00,
                        "shadows": (0.0, 0.02, 0.08),
                        "midtones": (0.0, 0.0, 0.03),
                        "highlights": (0.02, 0.0, -0.02),
                        "temperature": -3.0, "vibrance": 0.40, "film_grain": 0.03},
        "chroma_ab":   {"amount": 0.005},
        "vignette":    {"intensity": 0.8, "radius": 0.55, "softness": 0.35},
    },
    "studio_session": {
        "bloom":       {"threshold": 0.75, "intensity": 0.8, "radius": 1.5},
        "color":       {"brightness": 0.02, "contrast": 1.10, "saturation": 0.9,
                        "exposure": 0.00, "gamma": 1.00,
                        "shadows": (0.03, 0.02, 0.0),
                        "midtones": (0.01, 0.01, 0.0),
                        "highlights": (0.02, 0.01, 0.0),
                        "temperature": 5.0, "vibrance": 0.10, "film_grain": 0.015},
        "chroma_ab":   {"amount": 0.001},
        "vignette":    {"intensity": 0.5, "radius": 0.65, "softness": 0.40},
    },
    "golden_hour": {
        "bloom":       {"threshold": 0.55, "intensity": 1.5, "radius": 4.0},
        "color":       {"brightness": 0.08, "contrast": 1.15, "saturation": 1.5,
                        "exposure": 0.40, "gamma": 0.85,
                        "shadows": (0.05, 0.02, -0.03),
                        "midtones": (0.08, 0.04, -0.02),
                        "highlights": (0.12, 0.06, -0.04),
                        "temperature": 12.0, "vibrance": 0.50, "film_grain": 0.01},
        "chroma_ab":   {"amount": 0.002},
        "vignette":    {"intensity": 0.4, "radius": 0.70, "softness": 0.50},
    },
    "neon_cityscape": {
        "bloom":       {"threshold": 0.45, "intensity": 2.8, "radius": 3.5},
        "color":       {"brightness": -0.02, "contrast": 1.40, "saturation": 1.8,
                        "exposure": 0.20, "gamma": 0.95,
                        "shadows": (-0.03, 0.0, 0.08),
                        "midtones": (0.0, -0.02, 0.05),
                        "highlights": (0.05, -0.02, 0.08),
                        "temperature": -5.0, "vibrance": 0.60, "film_grain": 0.025},
        "chroma_ab":   {"amount": 0.007},
        "vignette":    {"intensity": 0.9, "radius": 0.50, "softness": 0.30},
    },
    "neon_tunnel": {
        "bloom":       {"threshold": 0.40, "intensity": 3.0, "radius": 4.0},
        "color":       {"brightness": -0.04, "contrast": 1.45, "saturation": 2.0,
                        "exposure": 0.25, "gamma": 0.90,
                        "shadows": (-0.05, 0.0, 0.12),
                        "midtones": (0.0, -0.03, 0.08),
                        "highlights": (0.08, -0.04, 0.12),
                        "temperature": -8.0, "vibrance": 0.70, "film_grain": 0.03},
        "chroma_ab":   {"amount": 0.009},
        "vignette":    {"intensity": 1.0, "radius": 0.45, "softness": 0.25},
    },
    "plasma_fractal": {
        "bloom":       {"threshold": 0.35, "intensity": 2.5, "radius": 5.0},
        "color":       {"brightness": 0.0, "contrast": 1.35, "saturation": 2.2,
                        "exposure": 0.15, "gamma": 0.88,
                        "shadows": (0.0, -0.02, 0.06),
                        "midtones": (-0.02, 0.0, 0.04),
                        "highlights": (0.06, 0.0, 0.10),
                        "temperature": -6.0, "vibrance": 0.80, "film_grain": 0.015},
        "chroma_ab":   {"amount": 0.006},
        "vignette":    {"intensity": 0.6, "radius": 0.55, "softness": 0.40},
    },
    "galaxy_spiral": {
        "bloom":       {"threshold": 0.30, "intensity": 2.0, "radius": 6.0},
        "color":       {"brightness": -0.06, "contrast": 1.25, "saturation": 1.6,
                        "exposure": 0.05, "gamma": 0.92,
                        "shadows": (0.0, 0.0, 0.10),
                        "midtones": (0.0, 0.01, 0.05),
                        "highlights": (0.02, 0.02, 0.08),
                        "temperature": -10.0, "vibrance": 0.50, "film_grain": 0.01},
        "chroma_ab":   {"amount": 0.004},
        "vignette":    {"intensity": 0.8, "radius": 0.50, "softness": 0.45},
    },
    "warp_speed": {
        "bloom":       {"threshold": 0.50, "intensity": 1.5, "radius": 8.0},
        "color":       {"brightness": 0.05, "contrast": 1.30, "saturation": 1.3,
                        "exposure": 0.20, "gamma": 0.95,
                        "shadows": (0.0, 0.0, 0.04),
                        "midtones": (0.01, 0.01, 0.02),
                        "highlights": (0.04, 0.04, 0.06),
                        "temperature": -2.0, "vibrance": 0.30, "film_grain": 0.008},
        "chroma_ab":   {"amount": 0.003},
        "vignette":    {"intensity": 0.5, "radius": 0.60, "softness": 0.50},
    },
    "liquid_metal": {
        "bloom":       {"threshold": 0.65, "intensity": 1.2, "radius": 2.0},
        "color":       {"brightness": 0.02, "contrast": 1.40, "saturation": 0.7,
                        "exposure": 0.10, "gamma": 1.05,
                        "shadows": (0.02, 0.02, 0.02),
                        "midtones": (0.01, 0.01, 0.01),
                        "highlights": (0.06, 0.06, 0.06),
                        "temperature": 1.0, "vibrance": -0.20, "film_grain": 0.02},
        "chroma_ab":   {"amount": 0.002},
        "vignette":    {"intensity": 0.5, "radius": 0.65, "softness": 0.45},
    },
    "fire_embers": {
        "bloom":       {"threshold": 0.45, "intensity": 2.5, "radius": 3.5},
        "color":       {"brightness": 0.05, "contrast": 1.35, "saturation": 1.8,
                        "exposure": 0.30, "gamma": 0.88,
                        "shadows": (0.05, 0.01, -0.02),
                        "midtones": (0.10, 0.03, -0.04),
                        "highlights": (0.15, 0.05, -0.06),
                        "temperature": 18.0, "vibrance": 0.60, "film_grain": 0.025},
        "chroma_ab":   {"amount": 0.004},
        "vignette":    {"intensity": 0.7, "radius": 0.55, "softness": 0.35},
    },
    "crystal_facets": {
        "bloom":       {"threshold": 0.55, "intensity": 1.8, "radius": 3.0},
        "color":       {"brightness": 0.04, "contrast": 1.20, "saturation": 1.4,
                        "exposure": 0.15, "gamma": 0.95,
                        "shadows": (-0.02, 0.0, 0.05),
                        "midtones": (0.0, 0.02, 0.04),
                        "highlights": (0.04, 0.06, 0.10),
                        "temperature": -4.0, "vibrance": 0.50, "film_grain": 0.012},
        "chroma_ab":   {"amount": 0.008},
        "vignette":    {"intensity": 0.4, "radius": 0.70, "softness": 0.50},
    },
    "aurora_curtains": {
        "bloom":       {"threshold": 0.40, "intensity": 2.0, "radius": 5.0},
        "color":       {"brightness": -0.02, "contrast": 1.15, "saturation": 1.7,
                        "exposure": 0.10, "gamma": 0.95,
                        "shadows": (-0.02, 0.04, 0.03),
                        "midtones": (-0.01, 0.06, 0.02),
                        "highlights": (0.0, 0.08, 0.04),
                        "temperature": -7.0, "vibrance": 0.65, "film_grain": 0.01},
        "chroma_ab":   {"amount": 0.003},
        "vignette":    {"intensity": 0.5, "radius": 0.60, "softness": 0.50},
    },
    "default": {
        "bloom":       {"threshold": 0.65, "intensity": 1.2, "radius": 2.0},
        "color":       {"brightness": 0.0, "contrast": 1.10, "saturation": 1.15,
                        "exposure": 0.10, "gamma": 1.00,
                        "shadows": (0.0, 0.0, 0.0),
                        "midtones": (0.0, 0.0, 0.0),
                        "highlights": (0.0, 0.0, 0.0),
                        "temperature": 0.0, "vibrance": 0.10, "film_grain": 0.01},
        "chroma_ab":   {"amount": 0.002},
        "vignette":    {"intensity": 0.5, "radius": 0.65, "softness": 0.40},
    },
}


# ── Individual post-processing operations ──────────────────────────────────────

def _gaussian_kernel_1d(radius: float, device) -> torch.Tensor:
    sigma  = max(radius / 3.0, 0.5)
    size   = int(radius * 2) | 1  # next odd number
    half   = size // 2
    x      = torch.arange(-half, half + 1, dtype=torch.float32, device=device)
    kernel = torch.exp(-x**2 / (2 * sigma**2))
    return kernel / kernel.sum()


def _apply_bloom(
    frames: torch.Tensor,
    threshold: float,
    intensity: float,
    radius: float,
    bpm_energy: float = 0.0,
) -> torch.Tensor:
    """Separable Gaussian bloom on bright pixels. BPM energy scales radius/intensity."""
    B, C, H, W = frames.shape
    dev = frames.device

    energy_boost = 1.0 + bpm_energy * 0.4
    intensity = intensity * energy_boost

    bright = (frames - threshold).clamp(min=0.0)

    k = _gaussian_kernel_1d(radius, dev)
    k_h = k.view(1, 1, 1, -1).expand(C, 1, 1, -1)
    k_v = k.view(1, 1, -1, 1).expand(C, 1, -1, 1)
    pad = len(k) // 2

    blurred = F.conv2d(bright, k_h, padding=(0, pad), groups=C)
    blurred = F.conv2d(blurred, k_v, padding=(pad, 0), groups=C)

    return (frames + blurred * intensity).clamp(0, 1)


def _apply_color_grading(
    frames: torch.Tensor,
    cfg: Dict,
    temperature_scale: float = 1.0,
) -> torch.Tensor:
    B, C, H, W = frames.shape
    dev = frames.device

    x = frames

    # Exposure (multiplicative)
    x = x * (2.0 ** cfg["exposure"])

    # Gamma (per-pixel power)
    gamma = cfg["gamma"]
    x = x.clamp(min=1e-6).pow(1.0 / gamma)

    # Brightness + Contrast
    x = (x + cfg["brightness"]) * cfg["contrast"]

    # Saturation via luminance
    lum = 0.299 * x[:, 0] + 0.587 * x[:, 1] + 0.114 * x[:, 2]
    lum = lum.unsqueeze(1)
    x   = lum + cfg["saturation"] * (x - lum)

    # Shadows / Midtones / Highlights lift
    for i, key in enumerate(["shadows", "midtones", "highlights"]):
        lift = torch.tensor(cfg[key], device=dev, dtype=torch.float32).view(1, 3, 1, 1)
        if key == "shadows":
            mask = (1 - x).clamp(0, 1) ** 2
        elif key == "midtones":
            mask = 1 - (2 * x - 1).abs().clamp(0, 1)
        else:
            mask = x.clamp(0, 1) ** 2
        x = x + lift * mask

    # Temperature (blue↔yellow shift)
    temp = cfg["temperature"] * temperature_scale / 100.0
    x[:, 0] = x[:, 0] + temp * 0.5
    x[:, 2] = x[:, 2] - temp * 0.5

    # Vibrance (smart saturation boost for less-saturated pixels)
    vibrance = cfg.get("vibrance", 0.0)
    if abs(vibrance) > 0.001:
        lum2 = 0.299 * x[:, 0] + 0.587 * x[:, 1] + 0.114 * x[:, 2]
        sat_mask = 1 - (x - lum2.unsqueeze(1)).abs().max(dim=1, keepdim=True).values
        x = x + vibrance * sat_mask * (x - lum2.unsqueeze(1))

    return x.clamp(0, 1)


def _apply_film_grain(
    frames: torch.Tensor,
    amount: float,
    frame_idx: int = 0,
) -> torch.Tensor:
    if amount < 1e-4:
        return frames
    # Seeded per frame so grain is different each frame (temporal variation)
    g = torch.Generator(device=frames.device)
    g.manual_seed(frame_idx * 1337 + 42)
    noise = torch.randn(*frames.shape, generator=g, device=frames.device) * amount
    return (frames + noise).clamp(0, 1)


def _apply_chromatic_aberration(
    frames: torch.Tensor,
    amount: float,
    bpm_energy: float = 0.0,
) -> torch.Tensor:
    if amount < 1e-5:
        return frames
    B, C, H, W = frames.shape
    dev = frames.device

    energy_boost = 1.0 + bpm_energy * 0.6
    amount = amount * energy_boost

    # Shift R channel slightly right, B channel slightly left
    px = max(1, int(amount * W))
    r = F.pad(frames[:, 0:1, :, px:],  (0, px, 0, 0))
    g = frames[:, 1:2]
    b = F.pad(frames[:, 2:3, :, :W-px], (px, 0, 0, 0))
    return torch.cat([r, g, b], dim=1).clamp(0, 1)


def _apply_vignette(
    frames: torch.Tensor,
    intensity: float,
    radius: float,
    softness: float,
) -> torch.Tensor:
    B, C, H, W = frames.shape
    dev = frames.device

    y = torch.linspace(-1, 1, H, device=dev)
    x = torch.linspace(-1, 1, W, device=dev)
    yy, xx = torch.meshgrid(y, x, indexing="ij")
    dist = torch.sqrt(xx**2 + yy**2).unsqueeze(0).unsqueeze(0)  # [1,1,H,W]

    # Smooth step falloff
    mask = ((dist - radius) / max(softness, 1e-3)).clamp(0, 1)
    mask = mask ** 2
    vignette = 1 - intensity * mask

    return (frames * vignette).clamp(0, 1)


def _apply_bpm_flash(
    frames: torch.Tensor,
    energy: float,
    is_drop: bool,
) -> torch.Tensor:
    """BPM-locked brightness pulse — only server knows exact beat position."""
    if not is_drop or energy < 0.5:
        return frames
    flash_strength = (energy - 0.5) * 0.2 * 2.0  # max +20% brightness at drop
    return (frames * (1 + flash_strength)).clamp(0, 1)


def _apply_temporal_consistency(
    frame: torch.Tensor,
    prev_frame: Optional[torch.Tensor],
    alpha: float = 0.15,
) -> torch.Tensor:
    """
    Lite temporal smoothing: blend current frame slightly toward previous.
    Reduces flickering between diffusion-sampled frames.
    alpha=0 → no smoothing, alpha=1 → full previous frame.
    """
    if prev_frame is None or alpha < 0.01:
        return frame
    return frame * (1 - alpha) + prev_frame * alpha


# ── Main post-processor class ─────────────────────────────────────────────────

class DigitalGPUPostProcessor:
    """
    Server-side DigitalGPU post-processing pipeline.

    Processes a batch or sequence of diffusion-output frames through the
    same visual pipeline as the client's WebGL chain, plus server-only
    enhancements (BPM flash, temporal consistency).
    """

    def __init__(self, style_name: str = "default"):
        self.gpu    = get_digital_gpu()
        self.device = self.gpu.device
        self._set_style(style_name)

    def _set_style(self, style_name: str) -> None:
        self.style_name = style_name
        self.preset     = SCENE_PRESETS.get(style_name, SCENE_PRESETS["default"])

    def process_frames(
        self,
        frames: torch.Tensor,
        style_name: Optional[str] = None,
        bpm_energy: float = 0.0,
        is_drop: bool = False,
        temporal_smooth: bool = True,
    ) -> torch.Tensor:
        """
        Process a sequence of frames.

        frames:         [T, 3, H, W]  float32 [0, 1]  on any device
        bpm_energy:     normalised energy at this beat window (0–1)
        is_drop:        whether this beat is a chorus / drop
        temporal_smooth: enable lite inter-frame smoothing

        Returns [T, 3, H, W] float32 [0, 1] on the same device as input.
        """
        if style_name:
            self._set_style(style_name)

        p       = self.preset
        dev     = self.device
        T, C, H, W = frames.shape

        frames = frames.to(dev)
        out    = torch.zeros_like(frames)
        prev   = None

        for t in range(T):
            f = frames[t:t+1]  # [1, 3, H, W]

            # 1. Color grading
            f = _apply_color_grading(f, p["color"])

            # 2. Bloom (energy-boosted on drops)
            f = _apply_bloom(
                f,
                p["bloom"]["threshold"],
                p["bloom"]["intensity"],
                p["bloom"]["radius"],
                bpm_energy if is_drop else 0.0,
            )

            # 3. Film grain (temporally varied)
            f = _apply_film_grain(f, p["color"]["film_grain"], frame_idx=t)

            # 4. Chromatic aberration (energy-boosted on drops)
            f = _apply_chromatic_aberration(
                f, p["chroma_ab"]["amount"],
                bpm_energy if is_drop else 0.0,
            )

            # 5. Vignette
            f = _apply_vignette(
                f,
                p["vignette"]["intensity"],
                p["vignette"]["radius"],
                p["vignette"]["softness"],
            )

            # 6. BPM flash (server-exclusive — exact beat timing)
            f = _apply_bpm_flash(f, bpm_energy, is_drop)

            # 7. Temporal consistency (server-exclusive)
            if temporal_smooth:
                f = _apply_temporal_consistency(f, prev, alpha=0.12)

            prev      = f.detach()
            out[t:t+1] = f

        return out.clamp(0, 1).to(frames.device)

    def process_batch(
        self,
        batch: torch.Tensor,
        **kwargs,
    ) -> torch.Tensor:
        """
        Process an independent batch [B, 3, H, W] where each image is unrelated.
        (No temporal smoothing — use process_frames for video sequences.)
        """
        kwargs.setdefault("temporal_smooth", False)
        return self.process_frames(batch, **kwargs)

    @staticmethod
    def style_to_scene_name(style_name: str) -> str:
        """Map video_diffusion style name → DigitalGPU scene preset name."""
        return style_name if style_name in SCENE_PRESETS else "default"
