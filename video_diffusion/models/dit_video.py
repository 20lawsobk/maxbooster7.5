"""
Latent Video Diffusion Transformer (DiT).

Accepts a noisy latent z_t [B, C, T, H, W], a diffusion timestep embedding,
and optional conditioning (text + music).  Returns predicted noise in the
same latent space.

Patch tokenisation → sinusoidal 3-D positional encoding →
N × DiTBlock (self-attn + cross-attn for conditioning) → unpatchify.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


# ── Patch embedding ────────────────────────────────────────────────────────────

class PatchEmbed3D(nn.Module):
    def __init__(self, in_ch: int = 16, embed_dim: int = 1024,
                 pt: int = 2, ph: int = 4, pw: int = 4):
        super().__init__()
        self.proj = nn.Conv3d(in_ch, embed_dim,
                              kernel_size=(pt, ph, pw),
                              stride=(pt, ph, pw))
        self.pt, self.ph, self.pw = pt, ph, pw

    def forward(self, z: torch.Tensor) -> Tuple[torch.Tensor, Tuple[int, int, int]]:
        x = self.proj(z)                                    # [B, D, Tp, Hp, Wp]
        B, D, Tp, Hp, Wp = x.shape
        x = x.view(B, D, Tp * Hp * Wp).transpose(1, 2)     # [B, N, D]
        return x, (Tp, Hp, Wp)


# ── Positional encoding ────────────────────────────────────────────────────────

def sinusoidal_3d(T: int, H: int, W: int, dim: int, device) -> torch.Tensor:
    """3-D sinusoidal positional encoding, returned as [1, T*H*W, dim]."""
    assert dim % 6 == 0, "dim must be divisible by 6 for 3-D sinusoidal encoding"
    d = dim // 6
    div = torch.exp(torch.arange(0, d, device=device).float() * -(math.log(10000.0) / d))
    t = torch.arange(T, device=device).float()
    h = torch.arange(H, device=device).float()
    w = torch.arange(W, device=device).float()
    pt = torch.outer(t, div)  # [T, d]
    ph = torch.outer(h, div)  # [H, d]
    pw = torch.outer(w, div)  # [W, d]
    enc_t = torch.cat([pt.sin(), pt.cos()], dim=-1)  # [T, 2d]
    enc_h = torch.cat([ph.sin(), ph.cos()], dim=-1)  # [H, 2d]
    enc_w = torch.cat([pw.sin(), pw.cos()], dim=-1)  # [W, 2d]
    # Broadcast and sum over positions
    pe = (
        enc_t[:, None, None, :]  # [T, 1, 1, 2d]
        + enc_h[None, :, None, :]
        + enc_w[None, None, :, :]
    )  # [T, H, W, 2d]  — last dim is 2d, not dim; extend to dim via cat
    # Repeat to fill dim
    pe = pe.view(T * H * W, 2 * d)
    # Full 6d sinusoidal: concat three pairs
    pe_full = torch.cat([
        enc_t[:, None, None, :].expand(T, H, W, 2 * d).reshape(T * H * W, 2 * d),
        enc_h[None, :, None, :].expand(T, H, W, 2 * d).reshape(T * H * W, 2 * d),
        enc_w[None, None, :, :].expand(T, H, W, 2 * d).reshape(T * H * W, 2 * d),
    ], dim=-1)  # [T*H*W, dim]
    return pe_full.unsqueeze(0)  # [1, N, dim]


# ── Timestep embedding ─────────────────────────────────────────────────────────

class TimeEmbedding(nn.Module):
    def __init__(self, dim: int = 256, out_dim: int = 1024):
        super().__init__()
        self.dim = dim
        self.mlp = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.SiLU(),
            nn.Linear(dim * 4, out_dim),
        )

    def _sinusoidal(self, t: torch.Tensor) -> torch.Tensor:
        half = self.dim // 2
        freqs = torch.exp(
            -math.log(10000.0) * torch.arange(half, device=t.device).float() / half
        )
        args = t[:, None].float() * freqs[None, :]
        return torch.cat([args.sin(), args.cos()], dim=-1)  # [B, dim]

    def forward(self, t: torch.Tensor) -> torch.Tensor:
        return self.mlp(self._sinusoidal(t))  # [B, out_dim]


# ── Adaptive LayerNorm (scale + shift from conditioning) ──────────────────────

class AdaLayerNorm(nn.Module):
    def __init__(self, dim: int, cond_dim: int):
        super().__init__()
        self.norm = nn.LayerNorm(dim, elementwise_affine=False)
        self.linear = nn.Linear(cond_dim, dim * 2)

    def forward(self, x: torch.Tensor, cond: torch.Tensor) -> torch.Tensor:
        # cond: [B, cond_dim] → scale, shift per token
        out = self.linear(cond)                    # [B, 2*dim]
        scale, shift = out.chunk(2, dim=-1)        # [B, dim] each
        scale = scale.unsqueeze(1)                 # [B, 1, dim]
        shift = shift.unsqueeze(1)
        return self.norm(x) * (1 + scale) + shift


# ── DiT block ─────────────────────────────────────────────────────────────────

class DiTBlock(nn.Module):
    def __init__(self, dim: int, n_heads: int, mlp_ratio: float = 4.0, cond_dim: int = 1024):
        super().__init__()
        self.norm1 = AdaLayerNorm(dim, cond_dim)
        self.attn = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.norm2 = AdaLayerNorm(dim, cond_dim)
        # Cross-attention for external conditioning (text / music)
        self.cross_norm = nn.LayerNorm(dim)
        self.cross_attn = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.norm3 = AdaLayerNorm(dim, cond_dim)
        mlp_hidden = int(dim * mlp_ratio)
        self.mlp = nn.Sequential(
            nn.Linear(dim, mlp_hidden),
            nn.GELU(),
            nn.Linear(mlp_hidden, dim),
        )

    def forward(
        self,
        x: torch.Tensor,
        t_cond: torch.Tensor,
        ctx: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        # Self-attention with adaptive norm
        h = self.norm1(x, t_cond)
        attn_out, _ = self.attn(h, h, h)
        x = x + attn_out
        # Cross-attention if conditioning context provided
        if ctx is not None:
            h = self.cross_norm(x)
            ca_out, _ = self.cross_attn(h, ctx, ctx)
            x = x + ca_out
        # Feed-forward
        x = x + self.mlp(self.norm3(x, t_cond))
        return x


# ── Full DiT ──────────────────────────────────────────────────────────────────

class VideoDiT(nn.Module):
    def __init__(self, cfg: dict):
        super().__init__()
        in_ch     = cfg.get("in_ch", 16)
        embed_dim = cfg.get("embed_dim", 1024)
        depth     = cfg.get("depth", 24)
        n_heads   = cfg.get("n_heads", 16)
        pt        = cfg.get("pt", 2)
        ph        = cfg.get("ph", 4)
        pw        = cfg.get("pw", 4)
        time_dim  = cfg.get("time_dim", 256)

        self.patch     = PatchEmbed3D(in_ch, embed_dim, pt, ph, pw)
        self.time_emb  = TimeEmbedding(dim=time_dim, out_dim=embed_dim)
        self.blocks    = nn.ModuleList([
            DiTBlock(embed_dim, n_heads, cond_dim=embed_dim) for _ in range(depth)
        ])
        self.out_norm  = nn.LayerNorm(embed_dim)
        # Project back to patch volume
        self.out_proj  = nn.Linear(embed_dim, in_ch * pt * ph * pw)

        self.pt, self.ph, self.pw = pt, ph, pw
        self.in_ch = in_ch
        self.embed_dim = embed_dim

    def forward(
        self,
        z_t: torch.Tensor,
        t: torch.Tensor,
        cond: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        z_t:  [B, C, T, H, W]  noisy latent
        t:    [B]               diffusion timesteps (long)
        cond: [B, L, D]         optional conditioning tokens (text + music)
        Returns predicted noise [B, C, T, H, W].
        """
        x, (Tp, Hp, Wp) = self.patch(z_t)             # [B, N, D]
        t_emb = self.time_emb(t)                       # [B, D]

        # Add 3-D positional encoding
        pe = sinusoidal_3d(Tp, Hp, Wp, self.embed_dim, z_t.device)
        x = x + pe

        for blk in self.blocks:
            x = blk(x, t_cond=t_emb, ctx=cond)

        x = self.out_norm(x)
        x = self.out_proj(x)                           # [B, N, C*pt*ph*pw]

        # Unpatchify
        B, N, _ = x.shape
        x = x.view(B, Tp, Hp, Wp, self.in_ch, self.pt, self.ph, self.pw)
        x = x.permute(0, 4, 1, 5, 2, 6, 3, 7).contiguous()
        x = x.view(B, self.in_ch, Tp * self.pt, Hp * self.ph, Wp * self.pw)
        return x
