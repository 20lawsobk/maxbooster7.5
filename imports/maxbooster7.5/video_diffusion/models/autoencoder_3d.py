"""
Spatiotemporal 3-D Variational Autoencoder.

Input:  [B, 3, T, H, W]   pixel video (float32, range 0-1)
Latent: [B, C, T', H', W'] compressed representation
Output: [B, 3, T, H, W]   reconstructed video

Spatial  downsampling: 2× per stage (4 stages → 16×)
Temporal downsampling: configurable per stage; default (1,2,2,2) → 8×
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List


class ResBlock3D(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, stride: Tuple[int, int, int] = (1, 1, 1)):
        super().__init__()
        self.conv1 = nn.Conv3d(in_ch, out_ch, 3, stride=stride, padding=1)
        self.conv2 = nn.Conv3d(out_ch, out_ch, 3, padding=1)
        self.skip = (
            nn.Conv3d(in_ch, out_ch, 1, stride=stride)
            if (in_ch != out_ch or stride != (1, 1, 1))
            else nn.Identity()
        )
        self.norm1 = nn.GroupNorm(min(32, in_ch), in_ch)
        self.norm2 = nn.GroupNorm(min(32, out_ch), out_ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.conv1(F.silu(self.norm1(x)))
        h = self.conv2(F.silu(self.norm2(h)))
        return h + self.skip(x)


class AttentionBlock3D(nn.Module):
    """Lightweight self-attention on the spatial-temporal sequence (mid-resolution only)."""
    def __init__(self, ch: int, n_heads: int = 8):
        super().__init__()
        self.norm = nn.GroupNorm(min(32, ch), ch)
        self.attn = nn.MultiheadAttention(ch, n_heads, batch_first=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, T, H, W = x.shape
        h = self.norm(x)
        h = h.view(B, C, T * H * W).transpose(1, 2)  # [B, N, C]
        h, _ = self.attn(h, h, h)
        h = h.transpose(1, 2).view(B, C, T, H, W)
        return x + h


class Encoder3D(nn.Module):
    def __init__(
        self,
        in_ch: int = 3,
        base_ch: int = 128,
        ch_mult: List[int] = (1, 2, 4, 4),
        temporal_down: List[int] = (1, 2, 2, 2),
        latent_ch: int = 16,
    ):
        super().__init__()
        self.in_conv = nn.Conv3d(in_ch, base_ch, 3, padding=1)
        ch = base_ch
        blocks: List[nn.Module] = []
        for i, m in enumerate(ch_mult):
            out_ch = base_ch * m
            stride = (temporal_down[i], 2, 2)
            blocks.append(ResBlock3D(ch, out_ch, stride=stride))
            blocks.append(ResBlock3D(out_ch, out_ch))
            # Mid-resolution attention at the bottleneck stage
            if i == len(ch_mult) - 1:
                blocks.append(AttentionBlock3D(out_ch))
            ch = out_ch
        self.blocks = nn.Sequential(*blocks)
        # Output 2×latent_ch so we can split into mean + log-var
        self.out_conv = nn.Conv3d(ch, latent_ch * 2, 3, padding=1)
        self.latent_ch = latent_ch

    def forward(self, x: torch.Tensor):
        h = self.in_conv(x)
        h = self.blocks(h)
        stats = self.out_conv(h)
        mean, logvar = stats.chunk(2, dim=1)
        logvar = torch.clamp(logvar, -30.0, 20.0)
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        z = mean + eps * std
        return z, mean, logvar


class Decoder3D(nn.Module):
    def __init__(
        self,
        out_ch: int = 3,
        base_ch: int = 128,
        ch_mult: List[int] = (1, 2, 4, 4),
        temporal_down: List[int] = (1, 2, 2, 2),
        latent_ch: int = 16,
    ):
        super().__init__()
        ch = base_ch * ch_mult[-1]
        self.in_conv = nn.Conv3d(latent_ch, ch, 3, padding=1)
        blocks: List[nn.Module] = []
        for i in reversed(range(len(ch_mult))):
            out_chi = base_ch * ch_mult[i]
            td = temporal_down[i]
            blocks.append(ResBlock3D(ch, out_chi))
            if i == len(ch_mult) - 1:
                blocks.append(AttentionBlock3D(out_chi))
            # Upsample: use ConvTranspose3d for learned upsampling
            blocks.append(
                nn.ConvTranspose3d(out_chi, out_chi, kernel_size=(td * 2, 4, 4),
                                   stride=(td, 2, 2), padding=(td // 2, 1, 1))
            )
            ch = out_chi
        self.blocks = nn.Sequential(*blocks)
        self.norm_out = nn.GroupNorm(min(32, ch), ch)
        self.out_conv = nn.Conv3d(ch, out_ch, 3, padding=1)

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        h = self.in_conv(z)
        h = self.blocks(h)
        h = F.silu(self.norm_out(h))
        return torch.sigmoid(self.out_conv(h))


class VideoVAE3D(nn.Module):
    def __init__(self, cfg: dict):
        super().__init__()
        self.encoder = Encoder3D(
            in_ch=cfg.get("in_ch", 3),
            base_ch=cfg.get("base_ch", 128),
            ch_mult=cfg.get("ch_mult", [1, 2, 4, 4]),
            temporal_down=cfg.get("temporal_down", [1, 2, 2, 2]),
            latent_ch=cfg.get("latent_ch", 16),
        )
        self.decoder = Decoder3D(
            out_ch=cfg.get("in_ch", 3),
            base_ch=cfg.get("base_ch", 128),
            ch_mult=cfg.get("ch_mult", [1, 2, 4, 4]),
            temporal_down=cfg.get("temporal_down", [1, 2, 2, 2]),
            latent_ch=cfg.get("latent_ch", 16),
        )
        self.latent_ch = cfg.get("latent_ch", 16)

    def encode(self, x: torch.Tensor):
        return self.encoder(x)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return self.decoder(z)

    def forward(self, x: torch.Tensor):
        z, mean, logvar = self.encode(x)
        x_rec = self.decode(z)
        return x_rec, mean, logvar
