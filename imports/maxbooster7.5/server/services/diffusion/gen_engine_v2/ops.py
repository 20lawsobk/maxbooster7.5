"""
ops.py — GPU-Aware Primitive Operations for Gen Engine v2
==========================================================
All Gen Engine v2 modules import from here instead of
duplicating digitalgpu boilerplate.

Pattern (same as layers.py):
  FORWARD  — uses gpu.matmul / gpu.conv2d / gpu.softmax / gpu.silu
             (routes to CUDA / MPS if available, NumPy otherwise)
  BACKWARD — pure NumPy analytical gradients
             (GPUContext has no autograd; matches layers.py convention)

API
---
  from .ops import GPU, matmul_fwd, conv2d_fwd, softmax_fwd, silu_fwd, ln_fwd
  from .ops import im2col, col2im, bilinear_up2x, bilinear_up2x_back

GPU singleton is initialised once; all modules share the same instance.
"""

from __future__ import annotations

import math
import os
import sys
from typing import Optional, Tuple

import numpy as np

# ── Locate and import digitalgpu ───────────────────────────────────────────
# digitalgpu lives at  server/services/digitalgpu.py
# gen_engine_v2 is at  server/services/diffusion/gen_engine_v2/
# So we walk two levels up from diffusion/ to reach services/

_HERE     = os.path.dirname(os.path.abspath(__file__))          # gen_engine_v2/
_DIFF_DIR = os.path.dirname(_HERE)                               # diffusion/
_SVC_DIR  = os.path.dirname(_DIFF_DIR)                          # services/

for _p in (_SVC_DIR, _DIFF_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from digitalgpu import get_gpu as _get_gpu
    GPU = _get_gpu()
except Exception:
    GPU = None   # CPU-only fallback


def _has_gpu() -> bool:
    return GPU is not None and GPU.has_gpu


# ── matmul ─────────────────────────────────────────────────────────────────

def matmul_fwd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """GPU-accelerated matrix multiply. Backward: pure NumPy (a.T @ dy, dy @ b.T)."""
    if _has_gpu():
        return GPU.matmul(a, b)
    return a @ b


# ── conv2d forward ─────────────────────────────────────────────────────────

def conv2d_fwd(x: np.ndarray, W: np.ndarray,
               b: Optional[np.ndarray] = None,
               stride: int = 1, pad: int = 1) -> np.ndarray:
    """
    GPU-accelerated conv2d forward.
    x : [H, W, C_in]
    W : [C_out, C_in, k, k]   (GPU convention; im2col convention for backward)
    Returns [H_out, W_out, C_out]
    """
    if _has_gpu():
        return GPU.conv2d(x, W, b, stride=stride, padding=pad)
    # NumPy im2col path
    H, Ww, C = x.shape
    kH = kW = W.shape[2]
    cols, H_out, W_out = im2col(x, kH, kW, stride, pad)
    W_flat = W.reshape(W.shape[0], -1)   # [C_out, C_in*k*k]
    out = cols @ W_flat.T
    if b is not None:
        out += b
    return out.reshape(H_out, W_out, W.shape[0])


# ── softmax ────────────────────────────────────────────────────────────────

def softmax_fwd(x: np.ndarray, axis: int = -1) -> np.ndarray:
    """Numerically stable softmax. GPU-accelerated when available."""
    if _has_gpu():
        return GPU.softmax(x, axis=axis)
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / (e.sum(axis=axis, keepdims=True) + 1e-9)


def softmax_back(w: np.ndarray, dw: np.ndarray) -> np.ndarray:
    """Jacobian-vector product through softmax (pure NumPy)."""
    s = (dw * w).sum(axis=-1, keepdims=True)
    return w * (dw - s)


# ── SiLU ───────────────────────────────────────────────────────────────────

def silu_fwd(x: np.ndarray) -> np.ndarray:
    """SiLU / Swish forward. GPU-accelerated when available."""
    if _has_gpu():
        return GPU.silu(x)
    s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
    return x * s


def silu_back(x: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """SiLU backward (pure NumPy)."""
    s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
    return dy * s * (1.0 + x * (1.0 - s))


# ── Layer Norm ─────────────────────────────────────────────────────────────

def ln_fwd(x: np.ndarray,
           gamma: np.ndarray,
           beta:  np.ndarray,
           eps:   float = 1e-6) -> Tuple[np.ndarray, tuple]:
    """
    LayerNorm over last axis. GPU-accelerated (without gamma/beta on GPU;
    affine transform applied after in NumPy for backward compatibility).
    Returns (y, cache) where cache is needed for backward.
    """
    if _has_gpu():
        xn = GPU.layer_norm(x, eps=eps)
    else:
        mu  = x.mean(axis=-1, keepdims=True)
        var = x.var(axis=-1, keepdims=True)
        xn  = (x - mu) / np.sqrt(var + eps)

    y = gamma * xn + beta
    mu2  = x.mean(axis=-1, keepdims=True)
    var2 = x.var(axis=-1, keepdims=True)
    xn2  = (x - mu2) / np.sqrt(var2 + eps)    # recompute for cache
    return y, (xn2, var2)


def ln_back(dy:    np.ndarray,
            gamma: np.ndarray,
            xn:    np.ndarray,
            var:   np.ndarray,
            eps:   float = 1e-6) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    LayerNorm backward (pure NumPy).
    Returns (dx, dgamma, dbeta).
    """
    n = xn.shape[-1]
    std_inv = 1.0 / np.sqrt(var + eps)
    dgamma  = (dy * xn).reshape(-1, n).sum(0)
    dbeta   = dy.reshape(-1, n).sum(0)
    dxn     = dy * gamma
    dx      = std_inv * (dxn
                         - dxn.mean(axis=-1, keepdims=True)
                         - xn * (dxn * xn).mean(axis=-1, keepdims=True))
    return dx, dgamma, dbeta


# ── Group Norm ─────────────────────────────────────────────────────────────

def gn_fwd(x: np.ndarray, gamma: np.ndarray, beta: np.ndarray,
           G: int = 8, eps: float = 1e-5) -> Tuple[np.ndarray, tuple]:
    """GroupNorm forward. x: [H, W, C]."""
    H, W, C = x.shape
    G = min(G, C)
    Cg = C // G
    xr = x.reshape(H, W, G, Cg)
    mu  = xr.mean(axis=(0, 1, 3), keepdims=True)
    var = xr.var(axis=(0, 1, 3),  keepdims=True)
    xn  = (xr - mu) / np.sqrt(var + eps)
    y   = xn.reshape(H, W, C) * gamma + beta
    return y, (xr, xn, mu, var, H, W, C, G, Cg)


def gn_back(dy: np.ndarray, gamma: np.ndarray,
            cache: tuple, eps: float = 1e-5):
    """GroupNorm backward. Returns (dx, dgamma, dbeta)."""
    xr, xn, mu, var, H, W, C, G, Cg = cache
    N = H * W * Cg
    xn_r = xn.reshape(H, W, C)
    dgamma = (dy * xn_r).sum(axis=(0, 1))
    dbeta  = dy.sum(axis=(0, 1))
    dxn    = (dy * gamma).reshape(H, W, G, Cg)
    std_inv = 1.0 / np.sqrt(var + eps)
    dvar   = (dxn * (xr - mu) * -0.5 * std_inv**3).sum(axis=(0, 1, 3), keepdims=True)
    dmean  = ((-dxn * std_inv).sum(axis=(0, 1, 3), keepdims=True)
              + dvar * (-2*(xr-mu)).sum(axis=(0, 1, 3), keepdims=True) / N)
    dx = (dxn * std_inv + dvar * 2*(xr-mu)/N + dmean/N).reshape(H, W, C)
    return dx, dgamma, dbeta


# ── im2col / col2im ────────────────────────────────────────────────────────

def im2col(x: np.ndarray, kH: int, kW: int,
           stride: int = 1, pad: int = 1) -> Tuple[np.ndarray, int, int]:
    """Vectorised im2col — same as layers.py (no Python loops)."""
    H, W, C = x.shape
    H_out = (H + 2*pad - kH) // stride + 1
    W_out = (W + 2*pad - kW) // stride + 1
    xp = np.pad(x, ((pad, pad), (pad, pad), (0, 0)))
    s  = xp.strides
    shape   = (H_out, W_out, kH, kW, C)
    strides = (s[0]*stride, s[1]*stride, s[0], s[1], s[2])
    win  = np.lib.stride_tricks.as_strided(xp, shape=shape, strides=strides)
    cols = win.reshape(H_out*W_out, kH*kW*C).astype(x.dtype, copy=False)
    return cols, H_out, W_out


def col2im(dcols: np.ndarray, x_shape: Tuple[int, int, int],
           kH: int, kW: int, stride: int = 1, pad: int = 1) -> np.ndarray:
    """Vectorised col2im gradient scatter."""
    H, W, C = x_shape
    H_out = (H + 2*pad - kH) // stride + 1
    W_out = (W + 2*pad - kW) // stride + 1
    dc  = dcols.reshape(H_out, W_out, kH, kW, C)
    xp  = np.zeros((H+2*pad, W+2*pad, C), dtype=dcols.dtype)
    for ki in range(kH):
        for kj in range(kW):
            rows = np.arange(H_out) * stride + ki
            cols_ = np.arange(W_out) * stride + kj
            np.add.at(xp, (rows[:, None], cols_[None, :]), dc[:, :, ki, kj, :])
    return xp[pad:pad+H, pad:pad+W, :]


# ── Bilinear upsample 2× ───────────────────────────────────────────────────

def bilinear_up2x(x: np.ndarray) -> np.ndarray:
    """
    Bilinear 2× upsample: [H, W, C] → [2H, 2W, C]
    Higher quality than nearest-neighbor (used in v4).
    Uses linear interpolation along both axes.
    """
    H, W, C = x.shape
    # Up-interpolate rows: [H, W, C] → [2H, W, C]
    row_up = np.empty((2*H, W, C), dtype=x.dtype)
    row_up[0::2] = x
    row_up[1::2] = np.concatenate([
        (x[:-1] + x[1:]) * 0.5,
        x[-1:],
    ], axis=0)
    # Up-interpolate cols: [2H, W, C] → [2H, 2W, C]
    col_up = np.empty((2*H, 2*W, C), dtype=x.dtype)
    col_up[:, 0::2] = row_up
    col_up[:, 1::2] = np.concatenate([
        (row_up[:, :-1] + row_up[:, 1:]) * 0.5,
        row_up[:, -1:],
    ], axis=1)
    return col_up


def bilinear_up2x_back(dout: np.ndarray) -> np.ndarray:
    """Backward of bilinear_up2x via average pooling (approximate)."""
    H2, W2, C = dout.shape
    H, W = H2 // 2, W2 // 2
    # Average the four grid points
    dx = (dout[0::2, 0::2] + dout[1::2, 0::2] * 0.5 +
          dout[0::2, 1::2] * 0.5 + dout[1::2, 1::2] * 0.25)
    return dx


# ── Sinusoidal position embedding ──────────────────────────────────────────

def sinusoidal_embed(t: np.ndarray, dim: int) -> np.ndarray:
    """
    Sinusoidal timestep embedding (Diffusion Models Beat GANs).
    t   : [B] or scalar int   — timestep indices
    dim : embedding dimension
    Returns: [B, dim] or [dim]
    """
    scalar = np.ndim(t) == 0
    t = np.atleast_1d(np.asarray(t, dtype=np.float32))
    half = dim // 2
    freqs = np.exp(-math.log(10000) * np.arange(half) / half).astype(np.float32)
    args  = t[:, None] * freqs[None, :]           # [B, half]
    emb   = np.concatenate([np.sin(args), np.cos(args)], axis=-1)
    if dim % 2 == 1:
        emb = np.concatenate([emb, np.zeros_like(emb[:, :1])], axis=-1)
    return emb[0] if scalar else emb


# ── Adam optimizer (GPU-aware accumulation) ────────────────────────────────

class AdamW:
    """
    AdamW with cosine LR annealing — shared across all Gen Engine v2 modules.
    Works on plain Python lists of (params_dict, grads_dict) pairs.
    """

    def __init__(self, lr: float = 1e-4, betas=(0.9, 0.999),
                 eps: float = 1e-8, weight_decay: float = 1e-2,
                 lr_min: float = 1e-6):
        self.lr0 = lr; self.lr = lr; self.lr_min = lr_min
        self.b1, self.b2 = betas
        self.eps = eps; self.wd = weight_decay
        self.t   = 0
        self._m: dict = {}; self._v: dict = {}

    def cosine_anneal(self, step: int, total_steps: int) -> None:
        t = step / max(total_steps, 1)
        self.lr = self.lr_min + 0.5 * (self.lr0 - self.lr_min) * (1 + math.cos(math.pi * t))

    def step(self, param_grad_pairs: list) -> None:
        self.t += 1
        bc1 = 1.0 - self.b1 ** self.t
        bc2 = 1.0 - self.b2 ** self.t
        for (params, grads) in param_grad_pairs:
            for k, p in params.items():
                g = grads.get(k)
                if g is None or g.shape != p.shape:
                    continue
                uid = id(p)
                if uid not in self._m:
                    self._m[uid] = np.zeros_like(p)
                    self._v[uid] = np.zeros_like(p)
                self._m[uid] = self.b1 * self._m[uid] + (1 - self.b1) * g
                self._v[uid] = self.b2 * self._v[uid] + (1 - self.b2) * g**2
                m_hat = self._m[uid] / bc1
                v_hat = self._v[uid] / bc2
                update = self.lr * m_hat / (np.sqrt(v_hat) + self.eps)
                if self.wd > 0:
                    update += self.lr * self.wd * p
                p -= update
                grads[k][:] = 0.0   # zero grad after step

    def zero_grads(self, param_grad_pairs: list) -> None:
        for _, grads in param_grad_pairs:
            for g in grads.values():
                g[:] = 0.0
