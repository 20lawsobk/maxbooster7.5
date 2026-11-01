"""
Super-Resolution and Temporal Upsampler UNet.

Takes a low-resolution latent (from the base diffusion model) and upsamples
it to the target resolution using a 3-D UNet with the same diffusion loop.

Designed for a two-stage cascade:
  Stage 1 (base): 256×256, 16 frames
  Stage 2 (SR):   512×512, 32 frames  (this module)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, List, Tuple


class ResBlockSR(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, time_dim: int = 256):
        super().__init__()
        self.norm1 = nn.GroupNorm(min(32, in_ch), in_ch)
        self.conv1 = nn.Conv3d(in_ch, out_ch, 3, padding=1)
        self.norm2 = nn.GroupNorm(min(32, out_ch), out_ch)
        self.conv2 = nn.Conv3d(out_ch, out_ch, 3, padding=1)
        self.skip  = nn.Conv3d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        self.t_proj = nn.Linear(time_dim, out_ch * 2)

    def forward(self, x: torch.Tensor, t_emb: torch.Tensor) -> torch.Tensor:
        h = F.silu(self.norm1(x))
        h = self.conv1(h)
        # Timestep scale + shift
        ts = self.t_proj(F.silu(t_emb))[:, :, None, None, None]  # [B, 2C, 1, 1, 1]
        scale, shift = ts.chunk(2, dim=1)
        h = F.silu(self.norm2(h) * (1 + scale) + shift)
        h = self.conv2(h)
        return h + self.skip(x)


class DownBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, time_dim: int,
                 downsample: bool = True, n_res: int = 2):
        super().__init__()
        self.res = nn.ModuleList([
            ResBlockSR(in_ch if i == 0 else out_ch, out_ch, time_dim)
            for i in range(n_res)
        ])
        self.down = (
            nn.Conv3d(out_ch, out_ch, kernel_size=3, stride=(1, 2, 2), padding=1)
            if downsample else nn.Identity()
        )

    def forward(self, x: torch.Tensor, t: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        for r in self.res:
            x = r(x, t)
        skip = x
        x = self.down(x)
        return x, skip


class UpBlock(nn.Module):
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int, time_dim: int,
                 upsample: bool = True, n_res: int = 2):
        super().__init__()
        self.res = nn.ModuleList([
            ResBlockSR(in_ch + skip_ch if i == 0 else out_ch, out_ch, time_dim)
            for i in range(n_res)
        ])
        self.up = (
            nn.ConvTranspose3d(in_ch, in_ch, kernel_size=(1, 4, 4),
                               stride=(1, 2, 2), padding=(0, 1, 1))
            if upsample else nn.Identity()
        )

    def forward(self, x: torch.Tensor, skip: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        x = self.up(x)
        x = torch.cat([x, skip], dim=1)
        for r in self.res:
            x = r(x, t)
        return x


class SRUNet3D(nn.Module):
    """
    3-D U-Net for spatiotemporal super-resolution in latent space.

    Input:  low-res noisy latent z_t  [B, latent_ch, T,  H,  W ]
    Output: noise prediction           [B, latent_ch, T', H', W']
             (T' = T, H' = H*sr_factor, W' = W*sr_factor, sr_factor default=2)

    The model is conditioned on:
      - diffusion timestep (t)
      - low-resolution latent (concatenated as extra channels)
      - optional music/text conditioning token
    """
    def __init__(self, cfg: dict):
        super().__init__()
        latent_ch = cfg.get("latent_ch", 16)
        base_ch   = cfg.get("base_ch", 128)
        ch_mult   = cfg.get("ch_mult", [1, 2, 4])
        time_dim  = cfg.get("time_dim", 256)
        n_res     = cfg.get("n_res_per_block", 2)

        # Sinusoidal timestep projection
        self.time_mlp = nn.Sequential(
            nn.Linear(time_dim, time_dim * 4),
            nn.SiLU(),
            nn.Linear(time_dim * 4, time_dim),
        )
        self.time_dim = time_dim

        # Input: noisy latent + low-res latent (bilinearly upsampled as conditioning)
        in_ch = latent_ch * 2
        self.in_conv = nn.Conv3d(in_ch, base_ch, 3, padding=1)

        # Encoder
        self.downs: nn.ModuleList = nn.ModuleList()
        ch = base_ch
        ch_list = []
        for i, m in enumerate(ch_mult):
            out_ch = base_ch * m
            self.downs.append(DownBlock(ch, out_ch, time_dim,
                                        downsample=(i < len(ch_mult) - 1), n_res=n_res))
            ch_list.append(out_ch)
            ch = out_ch

        # Middle
        self.mid = nn.Sequential(
            ResBlockSR(ch, ch, time_dim),
            ResBlockSR(ch, ch, time_dim),
        )

        # Decoder
        self.ups: nn.ModuleList = nn.ModuleList()
        for i in reversed(range(len(ch_mult))):
            skip_ch = ch_list[i]
            out_ch = base_ch * ch_mult[max(0, i - 1)]
            self.ups.append(UpBlock(ch, skip_ch, out_ch, time_dim,
                                    upsample=(i < len(ch_mult) - 1), n_res=n_res))
            ch = out_ch

        self.out_norm = nn.GroupNorm(min(32, ch), ch)
        self.out_conv = nn.Conv3d(ch, latent_ch, 3, padding=1)

    def _time_embed(self, t: torch.Tensor) -> torch.Tensor:
        half = self.time_dim // 2
        import math
        freqs = torch.exp(
            -math.log(10000.0) * torch.arange(half, device=t.device).float() / half
        )
        args = t[:, None].float() * freqs[None, :]
        emb = torch.cat([args.sin(), args.cos()], dim=-1)
        return self.time_mlp(emb)

    def forward(
        self,
        z_t: torch.Tensor,
        z_lr: torch.Tensor,
        t: torch.Tensor,
        cond: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        z_t:  noisy high-res latent  [B, C, T, H, W]
        z_lr: low-res latent         [B, C, T, H/sr, W/sr]  — upsampled before call
        t:    diffusion timestep     [B]
        cond: conditioning tokens    [B, L, D]  (unused in base impl — extensible)
        """
        # Upsample low-res to match z_t spatial dims
        z_lr_up = F.interpolate(z_lr, size=z_t.shape[2:], mode="trilinear", align_corners=False)
        x = torch.cat([z_t, z_lr_up], dim=1)     # [B, 2C, T, H, W]

        t_emb = self._time_embed(t)               # [B, time_dim]

        x = self.in_conv(x)

        skips = []
        for down in self.downs:
            x, skip = down(x, t_emb)
            skips.append(skip)

        for r in self.mid:
            x = r(x, t_emb)

        for up, skip in zip(self.ups, reversed(skips)):
            x = up(x, skip, t_emb)

        x = F.silu(self.out_norm(x))
        return self.out_conv(x)
