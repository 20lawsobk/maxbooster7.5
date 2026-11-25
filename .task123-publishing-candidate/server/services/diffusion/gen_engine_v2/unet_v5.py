"""
UNet v5 — Latent-Space Diffusion U-Net with Cross-Attention
============================================================
Core architectural advances over UNetV4:

  Latent space   : operates on [T, H/4, W/4, 8] latent from VAELite
                   vs [T, H, W, 3] raw pixels in v4 — 16× fewer values
  Cross-attention: at levels L2, L3, bottleneck — visual Q × text K/V
                   vs FiLM-only in v4
  v-prediction   : predicts v = √ᾱ·ε − √(1−ᾱ)·x₀  (better loss landscape)
                   vs epsilon-prediction in v4
  Bilinear upsample: smoother decoder vs nearest-neighbor in v4
  GPU-aware ops  : matmul_fwd, softmax_fwd, silu_fwd via digitalgpu singleton
  FiLM+CA        : residual FiLM (time + text global) at every ResBlock
                   AND cross-attention (text tokens) at deep levels

LITE config: ~15M params, latent 32×32×8, channels [64,128,256,256]
FULL config: ~65M params, latent 64×64×16, channels [128,256,512,512]
"""

from __future__ import annotations

import math
import sys
import os
from typing import Dict, List, Optional, Tuple

import numpy as np

# Add paths for imports
_HERE    = os.path.dirname(os.path.abspath(__file__))
_DIFF    = os.path.dirname(_HERE)
_SVC     = os.path.dirname(_DIFF)
for _p in (_SVC, _DIFF, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from .ops import (matmul_fwd, silu_fwd, silu_back, softmax_fwd, softmax_back,
                  gn_fwd, gn_back, im2col, col2im, bilinear_up2x, bilinear_up2x_back,
                  sinusoidal_embed, GPU)
from .cross_attention import CrossAttention

# ── Configs ────────────────────────────────────────────────────────────────

UNET_V5_LITE_CONFIG = {
    'in_channels'  : 8,      # latent channels (VAELite output)
    'out_channels' : 8,      # v-prediction target
    'channels'     : [64, 128, 256, 256],
    'T'            : 4,      # frames (training)
    'cond_dim'     : 128,    # FiLM embedding dim (from CLS token)
    'text_seq_dim' : 128,    # cross-attention text dim (from token stream)
    'text_seq_len' : 32,     # number of text tokens
    'n_heads_attn' : 4,      # spatial self-attention heads
    'n_heads_ca'   : 4,      # cross-attention Q heads
    'G'            : 8,      # GroupNorm groups
    'time_emb_dim' : 256,    # sinusoidal time → MLP output dim
}

UNET_V5_FULL_CONFIG = {
    'in_channels'  : 16,
    'out_channels' : 16,
    'channels'     : [128, 256, 512, 512],
    'T'            : 16,
    'cond_dim'     : 256,
    'text_seq_dim' : 256,
    'text_seq_len' : 64,
    'n_heads_attn' : 8,
    'n_heads_ca'   : 8,
    'G'            : 8,
    'time_emb_dim' : 512,
}


# ── Conv2D layer (GPU-aware forward, NumPy backward) ──────────────────────

class _Conv2D:
    def __init__(self, c_in: int, c_out: int, k: int = 3,
                 stride: int = 1, pad: int = 1):
        self.c_in = c_in; self.c_out = c_out
        self.k = k; self.stride = stride; self.pad = pad
        scale = math.sqrt(2.0 / (c_in * k * k))
        # Store as im2col format [C_out, C_in*k*k] for backward compatibility
        self.W  = (np.random.randn(c_out, c_in * k * k) * scale).astype(np.float32)
        self.b  = np.zeros(c_out, dtype=np.float32)
        self.dW = np.zeros_like(self.W)
        self.db = np.zeros_like(self.b)
        self._c: Optional[tuple] = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        cols, H_out, W_out = im2col(x, self.k, self.k, self.stride, self.pad)
        out = matmul_fwd(cols, self.W.T) + self.b   # GPU matmul when available
        self._c = (x.shape, cols)
        return out.reshape(H_out, W_out, self.c_out)

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x_shape, cols = self._c
        df = dout.reshape(-1, self.c_out)
        self.dW += df.T @ cols
        self.db += df.sum(0)
        return col2im(df @ self.W, x_shape, self.k, self.k, self.stride, self.pad)

    def zero_grads(self):
        self.dW[:] = 0; self.db[:] = 0

    def pgp(self):   # param-grad pairs
        return [({'W': self.W, 'b': self.b}, {'W': self.dW, 'b': self.db})]


# ── FiLM linear (time + text CLS → scale, shift per channel) ─────────────

class _FiLM:
    """
    Feature-wise Linear Modulation from conditioning signal.
    cond_emb [c_cond] → scale [c_out], shift [c_out]
    Applied as: h = h * (1 + scale) + shift
    """
    def __init__(self, c_cond: int, c_out: int):
        scale = math.sqrt(2.0 / c_cond)
        self.W  = (np.random.randn(2 * c_out, c_cond) * scale).astype(np.float32)
        self.b  = np.zeros(2 * c_out, dtype=np.float32)
        self.dW = np.zeros_like(self.W)
        self.db = np.zeros_like(self.b)
        self.c_out = c_out
        self._c: Optional[tuple] = None

    def forward(self, h: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """h: [H,W,C], cond: [c_cond] → [H,W,C]"""
        out = matmul_fwd(cond[None], self.W.T)[0] + self.b   # [2*c_out]
        scale = out[:self.c_out]; shift = out[self.c_out:]
        self._c = (h, cond, scale, shift)
        return h * (1.0 + scale) + shift

    def backward(self, dout: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        h, cond, scale, shift = self._c
        dh     = dout * (1.0 + scale)
        dscale = (dout * h).sum(axis=(0, 1))   # [c_out]
        dshift = dout.sum(axis=(0, 1))
        dss    = np.concatenate([dscale, dshift])   # [2*c_out]
        self.dW += dss[:, None] * cond[None, :]
        self.db += dss
        dcond  = (dss @ self.W).ravel()
        return dh, dcond

    def zero_grads(self):
        self.dW[:] = 0; self.db[:] = 0

    def pgp(self):
        return [({'W': self.W, 'b': self.b}, {'W': self.dW, 'b': self.db})]


# ── ResBlock v5 ────────────────────────────────────────────────────────────

class _ResBlockV5:
    """
    ResBlock with FiLM conditioning (time + text CLS).
    x → [Conv→GN→SiLU] + FiLM(cond) → [Conv→GN] + shortcut → SiLU
    """
    def __init__(self, c_in: int, c_out: int, c_cond: int, G: int = 8):
        self.c1   = _Conv2D(c_in, c_out, 3, 1, 1)
        self.c2   = _Conv2D(c_out, c_out, 3, 1, 1)
        self.proj = _Conv2D(c_in, c_out, 1, 1, 0) if c_in != c_out else None
        self.film = _FiLM(c_cond, c_out)
        G1 = min(G, c_out)
        self.gn1_g = np.ones(c_out, np.float32); self.gn1_b = np.zeros(c_out, np.float32)
        self.gn2_g = np.ones(c_out, np.float32); self.gn2_b = np.zeros(c_out, np.float32)
        self.dgn1_g = np.zeros_like(self.gn1_g); self.dgn1_b = np.zeros_like(self.gn1_b)
        self.dgn2_g = np.zeros_like(self.gn2_g); self.dgn2_b = np.zeros_like(self.gn2_b)
        self.G = G1
        self._c: Optional[tuple] = None

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        sc = self.proj.forward(x) if self.proj else x
        pre1   = self.c1.forward(x)
        h1, cn1 = gn_fwd(pre1, self.gn1_g, self.gn1_b, self.G)
        h1a    = silu_fwd(h1)
        h1f    = self.film.forward(h1a, cond)
        pre2   = self.c2.forward(h1f)
        h2, cn2 = gn_fwd(pre2, self.gn2_g, self.gn2_b, self.G)
        out    = silu_fwd(h2 + sc)
        self._c = (x, sc, pre1, h1, cn1, h1a, h1f, pre2, h2, cn2)
        return out

    def backward(self, dout: np.ndarray, cond: np.ndarray):
        x, sc, pre1, h1, cn1, h1a, h1f, pre2, h2, cn2 = self._c
        dact = silu_back(h2 + sc, dout)
        dsc  = dact
        dh2  = dact
        dh2_gn, dg2, db2 = gn_back(dh2, self.gn2_g, cn2)
        self.dgn2_g += dg2; self.dgn2_b += db2
        dh1f = self.c2.backward(dh2_gn)
        dh1a, dcond = self.film.backward(dh1f)
        dh1  = silu_back(h1, dh1a)
        dh1_gn, dg1, db1 = gn_back(dh1, self.gn1_g, cn1)
        self.dgn1_g += dg1; self.dgn1_b += db1
        dx   = self.c1.backward(dh1_gn)
        if self.proj:
            dsc = self.proj.backward(dsc)
        return dx + dsc, dcond

    def zero_grads(self):
        for m in (self.c1, self.c2, self.film):
            m.zero_grads()
        if self.proj: self.proj.zero_grads()
        self.dgn1_g[:] = 0; self.dgn1_b[:] = 0
        self.dgn2_g[:] = 0; self.dgn2_b[:] = 0

    def pgp(self):
        p = (self.c1.pgp() + self.c2.pgp() + self.film.pgp() +
             [({'gn1_g': self.gn1_g, 'gn1_b': self.gn1_b},
               {'gn1_g': self.dgn1_g, 'gn1_b': self.dgn1_b}),
              ({'gn2_g': self.gn2_g, 'gn2_b': self.gn2_b},
               {'gn2_g': self.dgn2_g, 'gn2_b': self.dgn2_b})])
        if self.proj: p.extend(self.proj.pgp())
        return p


# ── Spatial Self-Attention (GPU-aware) ─────────────────────────────────────

class _SpatialSelfAttn:
    """Multi-head spatial self-attention on [H,W,C] feature maps."""

    def __init__(self, C: int, n_heads: int = 4, G: int = 8):
        assert C % n_heads == 0
        self.h = n_heads; self.d = C // n_heads
        self.scale = 1.0 / math.sqrt(self.d)
        k = math.sqrt(1.0 / C)
        self.Wq = (np.random.randn(C, C) * k).astype(np.float32)
        self.Wk = (np.random.randn(C, C) * k).astype(np.float32)
        self.Wv = (np.random.randn(C, C) * k).astype(np.float32)
        self.Wo = (np.random.randn(C, C) * k).astype(np.float32)
        self.bo = np.zeros(C, np.float32)
        self.dWq = np.zeros_like(self.Wq); self.dWk = np.zeros_like(self.Wk)
        self.dWv = np.zeros_like(self.Wv); self.dWo = np.zeros_like(self.Wo)
        self.dbo = np.zeros_like(self.bo)
        G1 = min(G, C)
        self.gn_g = np.ones(C, np.float32); self.gn_b = np.zeros(C, np.float32)
        self.dgn_g = np.zeros_like(self.gn_g); self.dgn_b = np.zeros_like(self.gn_b)
        self.G = G1
        self._c: Optional[tuple] = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        H, W, C = x.shape
        N = H * W; h = self.h; d = self.d
        xn, gn_c = gn_fwd(x, self.gn_g, self.gn_b, self.G)
        xf = xn.reshape(N, C)
        Q  = matmul_fwd(xf, self.Wq.T).reshape(N, h, d).transpose(1, 0, 2)   # [h,N,d]
        K  = matmul_fwd(xf, self.Wk.T).reshape(N, h, d).transpose(1, 0, 2)
        V  = matmul_fwd(xf, self.Wv.T).reshape(N, h, d).transpose(1, 0, 2)
        sc = np.einsum('hqd,hkd->hqk', Q, K) * self.scale
        w  = softmax_fwd(sc, axis=-1)                                           # [h,N,N]
        ctx = np.einsum('hqk,hkd->hqd', w, V).transpose(1, 0, 2).reshape(N, C)
        out = matmul_fwd(ctx, self.Wo.T) + self.bo
        self._c = (x, xf, xn, gn_c, Q, K, V, w, ctx, N, H, W, C)
        return out.reshape(H, W, C) + x   # residual

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, xf, xn, gn_c, Q, K, V, w, ctx, N, H, W, C = self._c
        h, d = self.h, self.d
        dx_res = dout.copy()
        df = dout.reshape(N, C)
        self.dWo += ctx.T @ df; self.dbo += df.sum(0)
        dctx = df @ self.Wo
        dctx3 = dctx.reshape(N, h, d).transpose(1, 0, 2)   # [h,N,d]
        dV = np.einsum('hqk,hqd->hkd', w, dctx3)
        dw = np.einsum('hqd,hkd->hqk', dctx3, V)
        dsc = softmax_back(w, dw) * self.scale
        dQ = np.einsum('hqk,hkd->hqd', dsc, K).transpose(1, 0, 2).reshape(N, C)
        dK = np.einsum('hqk,hqd->hkd', dsc, Q).transpose(1, 0, 2).reshape(N, C)
        dV = dV.transpose(1, 0, 2).reshape(N, C)
        self.dWq += dQ.T @ xf; self.dWk += dK.T @ xf; self.dWv += dV.T @ xf
        dxf = dQ @ self.Wq + dK @ self.Wk + dV @ self.Wv
        dxn = dxf.reshape(H, W, C)
        dx_gn, dg, db = gn_back(dxn, self.gn_g, gn_c)
        self.dgn_g += dg; self.dgn_b += db
        return dx_gn + dx_res

    def zero_grads(self):
        for a in (self.dWq, self.dWk, self.dWv, self.dWo, self.dbo,
                  self.dgn_g, self.dgn_b):
            a[:] = 0

    def pgp(self):
        return [({'Wq': self.Wq, 'Wk': self.Wk, 'Wv': self.Wv,
                  'Wo': self.Wo, 'bo': self.bo,
                  'gn_g': self.gn_g, 'gn_b': self.gn_b},
                 {'Wq': self.dWq, 'Wk': self.dWk, 'Wv': self.dWv,
                  'Wo': self.dWo, 'bo': self.dbo,
                  'gn_g': self.dgn_g, 'gn_b': self.dgn_b})]


# ── Lightweight Temporal Attention ─────────────────────────────────────────

class _TemporalAttnLite:
    """
    Lightweight temporal attention: attends across T frames per spatial position.
    Simplified from temporal_attention.py for latent-space (smaller feature maps).
    Input/Output: [T, H, W, C]
    """
    def __init__(self, C: int, n_heads: int = 4, max_T: int = 32):
        assert C % n_heads == 0
        self.h = n_heads; self.d = C // n_heads
        self.scale = 1.0 / math.sqrt(self.d)
        k = math.sqrt(1.0 / C)
        self.Wqkv = (np.random.randn(3 * C, C) * k).astype(np.float32)   # [3C, C]
        self.bqkv = np.zeros(3 * C, np.float32)
        self.Wo   = (np.random.randn(C, C)     * k).astype(np.float32)   # [C, C]
        self.bo   = np.zeros(C, np.float32)
        # Sinusoidal temporal position embedding
        pos = np.arange(max_T)[:, None]
        freqs = 1.0 / (10000 ** (np.arange(0, C, 2) / C))
        pe = np.zeros((max_T, C), np.float32)
        pe[:, 0::2] = np.sin(pos * freqs); pe[:, 1::2] = np.cos(pos * freqs)
        self.pe = pe
        self.dWqkv = np.zeros_like(self.Wqkv); self.dbqkv = np.zeros_like(self.bqkv)
        self.dWo   = np.zeros_like(self.Wo);   self.dbo   = np.zeros_like(self.bo)
        self._c: Optional[tuple] = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        T, H, W, C = x.shape
        N = H * W; h = self.h; d = self.d
        # Reshape → [N, T, C]
        x_nt = x.transpose(1, 2, 0, 3).reshape(N, T, C)
        x_pe = x_nt + self.pe[:T][None, :, :]
        xr   = x_pe.reshape(N * T, C)
        qkv  = matmul_fwd(xr, self.Wqkv.T) + self.bqkv   # [NT, 3C]
        qkv  = qkv.reshape(N, T, 3, h, d)
        Q = qkv[:, :, 0].transpose(0, 2, 1, 3)   # [N, h, T, d]
        K = qkv[:, :, 1].transpose(0, 2, 1, 3)
        V = qkv[:, :, 2].transpose(0, 2, 1, 3)
        sc = np.einsum('nhtd,nhsd->nhts', Q, K) * self.scale   # [N,h,T,T]
        w  = softmax_fwd(sc, axis=-1)
        ctx = np.einsum('nhts,nhsd->nhtd', w, V)               # [N,h,T,d]
        ctx = ctx.transpose(0, 2, 1, 3).reshape(N, T, C)
        out = matmul_fwd(ctx.reshape(N * T, C), self.Wo.T).reshape(N, T, C) + self.bo
        result = (out + x_nt).reshape(H, W, T, C).transpose(2, 0, 1, 3)
        self._c = (x, x_nt, x_pe, xr, Q, K, V, w, ctx, N, T, H, W, C)
        return result

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, x_nt, x_pe, xr, Q, K, V, w, ctx, N, T, H, W, C = self._c
        h, d = self.h, self.d
        # Reshape dout
        dnt = dout.transpose(1, 2, 0, 3).reshape(N, T, C)
        dx_res = dnt.copy()
        # Output proj backward
        dctxr = dnt.reshape(N * T, C)
        self.dWo += ctx.reshape(N * T, C).T @ dctxr; self.dbo += dctxr.sum(0)
        dctx = (dctxr @ self.Wo.T).reshape(N, T, C)
        # Attention backward
        dctx_t = dctx.reshape(N, T, h, d).transpose(0, 2, 1, 3)
        dV  = np.einsum('nhts,nhtd->nhsd', w, dctx_t)
        dw  = np.einsum('nhtd,nhsd->nhts', dctx_t, V)
        dsc = softmax_back(w, dw) * self.scale
        dQ  = np.einsum('nhts,nhsd->nhtd', dsc, K).transpose(0, 2, 1, 3).reshape(N, T, C)
        dK  = np.einsum('nhts,nhtd->nhsd', dsc, Q).transpose(0, 2, 1, 3).reshape(N, T, C)
        dV2 = dV.transpose(0, 2, 1, 3).reshape(N, T, C)
        dqkv = np.zeros((N, T, 3, C), np.float32)
        dqkv[:, :, 0] = dQ; dqkv[:, :, 1] = dK; dqkv[:, :, 2] = dV2
        dqkvr = dqkv.reshape(N * T, 3 * C)
        self.dWqkv += dqkvr.T @ xr; self.dbqkv += dqkvr.sum(0)
        dxpe = (dqkvr @ self.Wqkv).reshape(N, T, C)
        dx_nt = dxpe + dx_res   # pe has no params in the backward (frozen sinusoidal)
        dx = dx_nt.reshape(H, W, T, C).transpose(2, 0, 1, 3)
        return dx

    def zero_grads(self):
        for a in (self.dWqkv, self.dbqkv, self.dWo, self.dbo): a[:] = 0

    def pgp(self):
        return [({'Wqkv': self.Wqkv, 'bqkv': self.bqkv, 'Wo': self.Wo, 'bo': self.bo},
                 {'Wqkv': self.dWqkv, 'bqkv': self.dbqkv, 'Wo': self.dWo, 'bo': self.dbo})]


# ── Downsample / Upsample ──────────────────────────────────────────────────

class _Downsample:
    """Stride-2 conv downsample: [H,W,C] → [H/2,W/2,C]."""
    def __init__(self, C: int):
        self.conv = _Conv2D(C, C, 3, stride=2, pad=1)

    def forward(self, x):  return self.conv.forward(x)
    def backward(self, d): return self.conv.backward(d)
    def zero_grads(self):  self.conv.zero_grads()
    def pgp(self): return self.conv.pgp()


class _Upsample:
    """Bilinear 2× upsample + Conv: [H,W,C] → [2H,2W,C]."""
    def __init__(self, C_in: int, C_out: int):
        self.conv = _Conv2D(C_in, C_out, 3, 1, 1)
        self._x: Optional[np.ndarray] = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        up = bilinear_up2x(x)
        self._x = x
        return self.conv.forward(up)

    def backward(self, dout: np.ndarray) -> np.ndarray:
        dup = self.conv.backward(dout)
        return bilinear_up2x_back(dup)

    def zero_grads(self): self.conv.zero_grads()
    def pgp(self): return self.conv.pgp()


# ── Time embedding MLP ─────────────────────────────────────────────────────

class _TimeEmbedder:
    """sinusoidal(t, sin_dim) → Linear → SiLU → Linear → [time_emb_dim]"""
    def __init__(self, sin_dim: int = 128, out_dim: int = 256):
        self.sin_dim = sin_dim
        k1 = math.sqrt(2.0 / sin_dim)
        k2 = math.sqrt(2.0 / out_dim)
        self.W1 = (np.random.randn(out_dim, sin_dim) * k1).astype(np.float32)
        self.b1 = np.zeros(out_dim, np.float32)
        self.W2 = (np.random.randn(out_dim, out_dim) * k2).astype(np.float32)
        self.b2 = np.zeros(out_dim, np.float32)
        self.dW1 = np.zeros_like(self.W1); self.db1 = np.zeros_like(self.b1)
        self.dW2 = np.zeros_like(self.W2); self.db2 = np.zeros_like(self.b2)
        self._c: Optional[tuple] = None

    def forward(self, t: int) -> np.ndarray:
        sin_emb = sinusoidal_embed(t, self.sin_dim)   # [sin_dim]
        h1 = matmul_fwd(sin_emb[None], self.W1.T)[0] + self.b1
        h1a = silu_fwd(h1)
        out = matmul_fwd(h1a[None], self.W2.T)[0] + self.b2
        self._c = (sin_emb, h1, h1a)
        return out   # [out_dim]

    def backward(self, dout: np.ndarray) -> None:
        sin_emb, h1, h1a = self._c
        self.dW2 += dout[:, None] * h1a[None, :]
        self.db2 += dout
        dh1a = dout @ self.W2
        dh1  = silu_back(h1, dh1a)
        self.dW1 += dh1[:, None] * sin_emb[None, :]
        self.db1 += dh1

    def zero_grads(self):
        for a in (self.dW1, self.db1, self.dW2, self.db2): a[:] = 0

    def pgp(self):
        return [({'W1': self.W1, 'b1': self.b1, 'W2': self.W2, 'b2': self.b2},
                 {'W1': self.dW1, 'b1': self.db1, 'W2': self.dW2, 'b2': self.db2})]


# ── UNetV5 ─────────────────────────────────────────────────────────────────

class UNetV5:
    """
    Latent-space U-Net with cross-attention and v-prediction.

    Forward: (latent [T,Hd,Wd,C_in], t: int, text_seq [S,dt], text_cls [dc])
           → v_pred [T,Hd,Wd,C_out]

    v-prediction target:
      v = √ᾱ_t · ε − √(1−ᾱ_t) · x₀
      where ε ~ N(0,I), x₀ is the clean latent

    Why v-prediction?
      Epsilon prediction has large gradient variance at low noise (t→0).
      V-prediction reweights the loss uniformly across all timesteps,
      producing sharper results and more stable training.
    """

    def __init__(self, cfg: dict = None):
        cfg = cfg or UNET_V5_LITE_CONFIG
        self.cfg = cfg
        C_in   = cfg['in_channels']
        C_out  = cfg['out_channels']
        chs    = cfg['channels']           # [ch0, ch1, ch2, ch3]
        cd     = cfg['cond_dim']           # FiLM conditioning dim (CLS)
        dt     = cfg['text_seq_dim']       # cross-attn text dim
        G      = cfg['G']
        nh     = cfg['n_heads_attn']
        nca    = cfg['n_heads_ca']
        te_dim = cfg['time_emb_dim']

        # Full conditioning = time_emb concat cls_proj(text_CLS) → both te_dim
        full_cond = 2 * te_dim          # te_dim(time) + te_dim(projected cls)

        # Time embedder
        self.time_emb = _TimeEmbedder(sin_dim=128, out_dim=te_dim)

        # Text CLS projection (already cd-dim, project to te_dim for concatenation)
        k = math.sqrt(2.0 / cd)
        self.cls_proj_W = (np.random.randn(te_dim, cd) * k).astype(np.float32)
        self.cls_proj_b = np.zeros(te_dim, np.float32)
        self.dcls_proj_W = np.zeros_like(self.cls_proj_W)
        self.dcls_proj_b = np.zeros_like(self.cls_proj_b)

        # Input projection
        self.c_in = _Conv2D(C_in, chs[0], 3, 1, 1)

        # Encoder
        # L0: chs[0], no attention (spatial too large for expensive attn at full res)
        self.enc0_r0 = _ResBlockV5(chs[0], chs[0], full_cond, G)
        self.enc0_r1 = _ResBlockV5(chs[0], chs[0], full_cond, G)
        self.enc0_dn = _Downsample(chs[0])

        # L1: chs[1], temporal attention
        self.enc1_r0 = _ResBlockV5(chs[0], chs[1], full_cond, G)
        self.enc1_r1 = _ResBlockV5(chs[1], chs[1], full_cond, G)
        self.enc1_ta = _TemporalAttnLite(chs[1], n_heads=max(1, nh // 2))
        self.enc1_dn = _Downsample(chs[1])

        # L2: chs[2], spatial + temporal + cross attention
        self.enc2_r0 = _ResBlockV5(chs[1], chs[2], full_cond, G)
        self.enc2_r1 = _ResBlockV5(chs[2], chs[2], full_cond, G)
        self.enc2_sa = _SpatialSelfAttn(chs[2], nh, G)
        self.enc2_ca = CrossAttention(chs[2], dt, nca)
        self.enc2_ta = _TemporalAttnLite(chs[2], n_heads=nh)
        self.enc2_dn = _Downsample(chs[2])

        # L3: chs[3], all attention
        self.enc3_r0 = _ResBlockV5(chs[2], chs[3], full_cond, G)
        self.enc3_r1 = _ResBlockV5(chs[3], chs[3], full_cond, G)
        self.enc3_sa = _SpatialSelfAttn(chs[3], nh, G)
        self.enc3_ca = CrossAttention(chs[3], dt, nca)
        self.enc3_ta = _TemporalAttnLite(chs[3], n_heads=nh)

        # Bottleneck
        self.bot_r0 = _ResBlockV5(chs[3], chs[3], full_cond, G)
        self.bot_sa = _SpatialSelfAttn(chs[3], nh, G)
        self.bot_ca = CrossAttention(chs[3], dt, nca)
        self.bot_ta = _TemporalAttnLite(chs[3], n_heads=nh)
        self.bot_r1 = _ResBlockV5(chs[3], chs[3], full_cond, G)

        # Decoder (skip connections from encoder)
        # L3 up: skip from enc3 [chs[3]] + dec input [chs[3]] = 2*chs[3]
        self.dec3_up = _Upsample(chs[3], chs[3])
        self.dec3_r0 = _ResBlockV5(chs[3] * 2, chs[3], full_cond, G)
        self.dec3_r1 = _ResBlockV5(chs[3], chs[3], full_cond, G)
        self.dec3_sa = _SpatialSelfAttn(chs[3], nh, G)
        self.dec3_ca = CrossAttention(chs[3], dt, nca)
        self.dec3_ta = _TemporalAttnLite(chs[3], n_heads=nh)

        # L2 up
        # dec3_up outputs chs[3]; concat with e2_skip[chs[2]] → chs[3]+chs[2]
        # dec2_r outputs chs[2]; then dec2_up reduces to chs[1] for next level
        self.dec2_up = _Upsample(chs[2], chs[1])
        self.dec2_r0 = _ResBlockV5(chs[3] + chs[2], chs[2], full_cond, G)
        self.dec2_r1 = _ResBlockV5(chs[2], chs[2], full_cond, G)
        self.dec2_sa = _SpatialSelfAttn(chs[2], nh, G)
        self.dec2_ca = CrossAttention(chs[2], dt, nca)
        self.dec2_ta = _TemporalAttnLite(chs[2], n_heads=nh)

        # L1 up
        # dec2_up outputs chs[1]; concat with e1_skip[chs[1]] → chs[1]*2
        # dec1_r outputs chs[1]; then dec1_up reduces to chs[0] for next level
        self.dec1_up = _Upsample(chs[1], chs[0])
        self.dec1_r0 = _ResBlockV5(chs[1] * 2, chs[1], full_cond, G)
        self.dec1_r1 = _ResBlockV5(chs[1], chs[1], full_cond, G)
        self.dec1_ta = _TemporalAttnLite(chs[1], n_heads=max(1, nh // 2))

        # L0 up
        self.dec0_up = _Upsample(chs[1], chs[0])
        self.dec0_r0 = _ResBlockV5(chs[0] * 2, chs[0], full_cond, G)
        self.dec0_r1 = _ResBlockV5(chs[0], chs[0], full_cond, G)

        # Output projection
        self.gn_out_g = np.ones(chs[0], np.float32)
        self.gn_out_b = np.zeros(chs[0], np.float32)
        self.dgn_out_g = np.zeros_like(self.gn_out_g)
        self.dgn_out_b = np.zeros_like(self.gn_out_b)
        self.c_out = _Conv2D(chs[0], C_out, 3, 1, 1)

        # Cache for backward
        self._fwd_cache: Optional[dict] = None

    def _cond(self, t: int, text_cls: np.ndarray) -> np.ndarray:
        """Build full conditioning vector by concatenating time_emb + text_cls_proj."""
        t_emb   = self.time_emb.forward(t)                             # [te_dim]
        cls_emb = matmul_fwd(text_cls[None], self.cls_proj_W.T)[0] + self.cls_proj_b  # [te_dim]
        return np.concatenate([t_emb, cls_emb])   # [2*te_dim]

    def _apply_frame(self, fn, x_T: np.ndarray, *args) -> np.ndarray:
        """Apply a spatial operation fn to each frame of [T,H,W,C] independently."""
        return np.stack([fn(x_T[t], *args) for t in range(x_T.shape[0])])

    def forward(self,
                z:        np.ndarray,    # [T, Hd, Wd, C_in] latent
                t:        int,           # diffusion timestep
                text_seq: np.ndarray,    # [S, dt] token embeddings
                text_cls: np.ndarray,    # [cd]   CLS embedding
               ) -> np.ndarray:
        """Returns v_pred: [T, Hd, Wd, C_out]"""
        T, Hd, Wd, _ = z.shape
        cond = self._cond(t, text_cls)   # [full_cond]

        c = {}   # cache

        # Input projection (per frame)
        h = np.stack([self.c_in.forward(z[ti]) for ti in range(T)])   # [T,Hd,Wd,ch0]

        # ── Encoder ──────────────────────────────────────────────────────
        # L0
        c['e0_in'] = h
        h, dc0 = self._res_seq_T(h, cond, [self.enc0_r0, self.enc0_r1])
        c['e0_skip'] = h.copy()
        h = np.stack([self.enc0_dn.forward(h[ti]) for ti in range(T)])

        # L1
        c['e1_in'] = h
        h, dc1 = self._res_seq_T(h, cond, [self.enc1_r0, self.enc1_r1])
        h = self.enc1_ta.forward(h)
        c['e1_skip'] = h.copy()
        h = np.stack([self.enc1_dn.forward(h[ti]) for ti in range(T)])

        # L2
        c['e2_in'] = h
        h, dc2 = self._res_seq_T(h, cond, [self.enc2_r0, self.enc2_r1])
        h = np.stack([self.enc2_sa.forward(h[ti]) for ti in range(T)])
        h = np.stack([self.enc2_ca.forward(h[ti], text_seq) for ti in range(T)])
        h = self.enc2_ta.forward(h)
        c['e2_skip'] = h.copy()
        h = np.stack([self.enc2_dn.forward(h[ti]) for ti in range(T)])

        # L3
        c['e3_in'] = h
        h, dc3 = self._res_seq_T(h, cond, [self.enc3_r0, self.enc3_r1])
        h = np.stack([self.enc3_sa.forward(h[ti]) for ti in range(T)])
        h = np.stack([self.enc3_ca.forward(h[ti], text_seq) for ti in range(T)])
        h = self.enc3_ta.forward(h)
        c['e3_skip'] = h.copy()

        # ── Bottleneck ────────────────────────────────────────────────────
        h, _ = self._res_seq_T(h, cond, [self.bot_r0])
        h = np.stack([self.bot_sa.forward(h[ti]) for ti in range(T)])
        h = np.stack([self.bot_ca.forward(h[ti], text_seq) for ti in range(T)])
        h = self.bot_ta.forward(h)
        h, _ = self._res_seq_T(h, cond, [self.bot_r1])

        # ── Decoder ───────────────────────────────────────────────────────
        # Standard U-Net decoder pattern:
        #   1. concat skip at CURRENT resolution
        #   2. process (ResBlocks + attention)
        #   3. upsample to next resolution
        #
        # L3: bottleneck at S/8 — concat e3_skip (S/8), process, upsample to S/4
        h = np.concatenate([h, c['e3_skip']], axis=-1)   # [T, S/8, S/8, 2*chs[3]]
        h, _ = self._res_seq_T(h, cond, [self.dec3_r0, self.dec3_r1])
        h = np.stack([self.dec3_sa.forward(h[ti]) for ti in range(T)])
        h = np.stack([self.dec3_ca.forward(h[ti], text_seq) for ti in range(T)])
        h = self.dec3_ta.forward(h)
        h = np.stack([self.dec3_up.forward(h[ti]) for ti in range(T)])  # → S/4

        # L2: at S/4 — concat e2_skip (S/4), process, upsample to S/2
        h = np.concatenate([h, c['e2_skip']], axis=-1)   # [T, S/4, S/4, chs[3]+chs[2]]
        h, _ = self._res_seq_T(h, cond, [self.dec2_r0, self.dec2_r1])
        h = np.stack([self.dec2_sa.forward(h[ti]) for ti in range(T)])
        h = np.stack([self.dec2_ca.forward(h[ti], text_seq) for ti in range(T)])
        h = self.dec2_ta.forward(h)
        h = np.stack([self.dec2_up.forward(h[ti]) for ti in range(T)])  # → S/2

        # L1: at S/2 — concat e1_skip (S/2), process, upsample to S
        h = np.concatenate([h, c['e1_skip']], axis=-1)   # [T, S/2, S/2, chs[1]*2]
        h, _ = self._res_seq_T(h, cond, [self.dec1_r0, self.dec1_r1])
        h = self.dec1_ta.forward(h)
        h = np.stack([self.dec1_up.forward(h[ti]) for ti in range(T)])  # → S

        # L0: at S — concat e0_skip (S), process (no upsample — output resolution)
        h = np.concatenate([h, c['e0_skip']], axis=-1)   # [T, S, S, chs[0]*2]
        h, _ = self._res_seq_T(h, cond, [self.dec0_r0, self.dec0_r1])

        # Output
        out_frames = []
        for ti in range(T):
            gn_out, gn_c = gn_fwd(h[ti], self.gn_out_g, self.gn_out_b)
            a = silu_fwd(gn_out)
            out_frames.append(self.c_out.forward(a))
        v_pred = np.stack(out_frames)   # [T,Hd,Wd,C_out]

        self._fwd_cache = c
        return v_pred

    def _res_seq_T(self, h: np.ndarray, cond: np.ndarray,
                   blocks: list) -> Tuple[np.ndarray, float]:
        """Apply a sequence of ResBlockV5 to each frame [T,H,W,C]."""
        for blk in blocks:
            frames = []
            for ti in range(h.shape[0]):
                f = blk.forward(h[ti], cond)
                frames.append(f)
            h = np.stack(frames)
        return h, 0.0

    def param_count(self) -> int:
        total = 0
        for _, arr in self._iter_params():
            total += arr.size
        return total

    def _iter_params(self):
        """Iterate all (name, param_array) pairs."""
        for name, module in self._all_modules():
            if hasattr(module, 'pgp'):
                for i, (params, _) in enumerate(module.pgp()):
                    for k, v in params.items():
                        yield f'{name}.{i}.{k}', v

    def _all_modules(self):
        return [
            ('time_emb', self.time_emb),
            ('c_in', self.c_in), ('c_out', self.c_out),
            ('enc0_r0', self.enc0_r0), ('enc0_r1', self.enc0_r1), ('enc0_dn', self.enc0_dn),
            ('enc1_r0', self.enc1_r0), ('enc1_r1', self.enc1_r1),
            ('enc1_ta', self.enc1_ta), ('enc1_dn', self.enc1_dn),
            ('enc2_r0', self.enc2_r0), ('enc2_r1', self.enc2_r1),
            ('enc2_sa', self.enc2_sa), ('enc2_ca', self.enc2_ca),
            ('enc2_ta', self.enc2_ta), ('enc2_dn', self.enc2_dn),
            ('enc3_r0', self.enc3_r0), ('enc3_r1', self.enc3_r1),
            ('enc3_sa', self.enc3_sa), ('enc3_ca', self.enc3_ca),
            ('enc3_ta', self.enc3_ta),
            ('bot_r0', self.bot_r0), ('bot_sa', self.bot_sa),
            ('bot_ca', self.bot_ca), ('bot_ta', self.bot_ta), ('bot_r1', self.bot_r1),
            ('dec3_up', self.dec3_up), ('dec3_r0', self.dec3_r0), ('dec3_r1', self.dec3_r1),
            ('dec3_sa', self.dec3_sa), ('dec3_ca', self.dec3_ca), ('dec3_ta', self.dec3_ta),
            ('dec2_up', self.dec2_up), ('dec2_r0', self.dec2_r0), ('dec2_r1', self.dec2_r1),
            ('dec2_sa', self.dec2_sa), ('dec2_ca', self.dec2_ca), ('dec2_ta', self.dec2_ta),
            ('dec1_up', self.dec1_up), ('dec1_r0', self.dec1_r0), ('dec1_r1', self.dec1_r1),
            ('dec1_ta', self.dec1_ta),
            ('dec0_up', self.dec0_up), ('dec0_r0', self.dec0_r0), ('dec0_r1', self.dec0_r1),
        ]

    def all_param_grad_pairs(self) -> list:
        pairs = []
        for _, module in self._all_modules():
            if hasattr(module, 'pgp'):
                pairs.extend(module.pgp())
            elif hasattr(module, 'all_param_grad_pairs'):
                pairs.extend(module.all_param_grad_pairs())
        # cls_proj
        pairs.append(({'cls_proj_W': self.cls_proj_W, 'cls_proj_b': self.cls_proj_b},
                       {'cls_proj_W': self.dcls_proj_W, 'cls_proj_b': self.dcls_proj_b}))
        # gn_out
        pairs.append(({'gn_out_g': self.gn_out_g, 'gn_out_b': self.gn_out_b},
                       {'gn_out_g': self.dgn_out_g, 'gn_out_b': self.dgn_out_b}))
        return pairs

    def zero_grads(self) -> None:
        for _, module in self._all_modules():
            if hasattr(module, 'zero_grads'):
                module.zero_grads()
        self.dcls_proj_W[:] = 0; self.dcls_proj_b[:] = 0
        self.dgn_out_g[:] = 0; self.dgn_out_b[:] = 0

    def collect_params(self) -> Dict[str, np.ndarray]:
        p = {}
        for i, (params, _) in enumerate(self.all_param_grad_pairs()):
            for k, v in params.items():
                p[f'pg{i}_{k}'] = v
        return p

    def load_params(self, d: Dict[str, np.ndarray]) -> None:
        for i, (params, _) in enumerate(self.all_param_grad_pairs()):
            for k in params:
                key = f'pg{i}_{k}'
                if key in d and params[k].shape == d[key].shape:
                    params[k][:] = d[key]
