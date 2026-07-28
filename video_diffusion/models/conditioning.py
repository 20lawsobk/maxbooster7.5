"""
Conditioning modules.

TextConditioner:  projects CLIP / LLM embeddings into the DiT token space.
MusicConditioner: encodes music metadata (BPM, energy, style, mood) into a
                  conditioning token that can be concatenated with text tokens.
                  This is the key integration point with Max Booster's
                  CreativeContext — music intelligence from in-house models
                  is injected directly into the diffusion process.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, List


class TextConditioner(nn.Module):
    """Project arbitrary-dim text embeddings to model_dim conditioning tokens."""
    def __init__(self, text_dim: int, model_dim: int, max_len: int = 77):
        super().__init__()
        self.proj = nn.Linear(text_dim, model_dim)
        self.pos  = nn.Parameter(torch.zeros(1, max_len, model_dim))
        nn.init.trunc_normal_(self.pos, std=0.02)

    def forward(self, text_emb: torch.Tensor) -> torch.Tensor:
        """text_emb: [B, L, text_dim] → [B, L, model_dim]"""
        L = text_emb.size(1)
        return self.proj(text_emb) + self.pos[:, :L, :]


class MusicConditioner(nn.Module):
    """
    Encodes music metadata into a single conditioning token [B, 1, model_dim].

    Inputs (all float, normalised 0-1 unless stated):
      bpm_norm       BPM / 200
      energy         mean energy of the beat window
      energy_peak    peak energy of the full track
      style_id       style index 0-12 (embedded)
      beat_norm      beat_index / total_beats (position in track)
      is_drop        1 if this beat is a chorus / drop, else 0
      emotional_heat derived from emotional_goal label
      blend_weight   0-1 for secondary style blending (0 = single style)
    """
    STYLE_COUNT = 13

    EMOTIONAL_HEAT: dict = {
        "curiosity": 0.4, "connection": 0.5, "excitement": 0.8,
        "action": 0.9, "nostalgia": 0.45, "euphoria": 0.95,
        "tension": 0.7, "relief": 0.3, "awe": 0.75, "empathy": 0.5,
    }

    def __init__(self, model_dim: int = 1024):
        super().__init__()
        self.style_emb = nn.Embedding(self.STYLE_COUNT, 64)
        # 7 scalar features + 64-dim style embedding = 71
        self.mlp = nn.Sequential(
            nn.Linear(71, 256),
            nn.SiLU(),
            nn.Linear(256, model_dim),
        )

    def forward(
        self,
        bpm_norm: torch.Tensor,         # [B]
        energy: torch.Tensor,           # [B]
        energy_peak: torch.Tensor,      # [B]
        style_id: torch.Tensor,         # [B] long
        beat_norm: torch.Tensor,        # [B]
        is_drop: torch.Tensor,          # [B] float
        emotional_heat: torch.Tensor,   # [B]
        blend_weight: Optional[torch.Tensor] = None,  # [B]
    ) -> torch.Tensor:
        B = bpm_norm.size(0)
        scalars = torch.stack([
            bpm_norm, energy, energy_peak, beat_norm, is_drop, emotional_heat,
            blend_weight if blend_weight is not None else torch.zeros(B, device=bpm_norm.device),
        ], dim=-1)  # [B, 7]

        style_vec = self.style_emb(style_id)  # [B, 64]
        feat = torch.cat([scalars, style_vec], dim=-1)  # [B, 71]
        token = self.mlp(feat).unsqueeze(1)  # [B, 1, model_dim]
        return token

    @classmethod
    def emotional_heat_from_label(cls, label: str) -> float:
        return cls.EMOTIONAL_HEAT.get(label.lower(), 0.5)


STYLE_NAME_TO_ID = {
    "plasma_fractal":  0, "galaxy_spiral":  1, "neon_tunnel":   2,
    "aurora_curtains": 3, "warp_speed":     4, "liquid_metal":  5,
    "fire_embers":     6, "crystal_facets": 7, "concert_stage": 8,
    "city_nights":     9, "studio_session": 10, "golden_hour":  11,
    "neon_cityscape":  12,
}
