"""
Cross-Attention — Text-to-Visual Conditioning (Stable Diffusion style)
======================================================================
Every deep UNetV5 level contains a CrossAttention block that lets the
visual features (Q) attend over the full text-token sequence (K, V).

  Q  : visual features  [H*W, d_visual]  — from UNet spatial feature map
  K,V: text tokens      [seq_len, seq_dim] — from TextEncoderV3

This is the core operation that links language to image: each spatial
position independently decides which text tokens to weight.

Architecture per block:
  Pre-norm → linear Q (from visual) + linear K, V (from text)
           → multi-head scaled dot-product attention
           → output projection
           → residual add to visual stream

Multi-head setup:
  n_heads = 4 (LITE) or 8 (FULL)
  Grouped Query Attention (GQA):
    Full n_heads Q projections
    n_kv_heads ≤ n_heads KV projections (shared across groups)
    → ~25% fewer params, same quality, faster inference

Backprop:
  Full gradient through Q, K, V projections and attention weights.
"""

from __future__ import annotations

import math
from typing import Dict, Optional, Tuple

import numpy as np


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(-1, keepdims=True)
    e = np.exp(x)
    return e / (e.sum(-1, keepdims=True) + 1e-9)


def _softmax_back(w: np.ndarray, dw: np.ndarray) -> np.ndarray:
    """Batched softmax Jacobian-vector product."""
    s = (dw * w).sum(-1, keepdims=True)
    return w * (dw - s)


class CrossAttention:
    """
    Multi-head cross-attention: visual Q × text K/V.

    Visual input  : [H, W, d_v]   — 2D feature map
    Text input    : [seq_len, d_t] — token embeddings from TextEncoderV3
    Output        : [H, W, d_v]   — updated visual features

    Parameters (LITE per block, d_v=256, d_t=128, h=4, d_head=64):
      Wq : [d_v, h*d_head]   = [256, 256]  = 65,536
      Wk : [d_t, d_head]     = [128, 64]   = 8,192  (single KV head shared)
      Wv : [d_t, d_head]     = [128, 64]   = 8,192
      Wo : [h*d_head, d_v]   = [256, 256]  = 65,536
      LayerNorm : 2×d_v = 512
      Total per block ≈ 148K params
    """

    def __init__(self,
                 d_visual:  int = 256,    # visual feature channels
                 d_text:    int = 128,    # text token dim (from TextEncoderV3)
                 n_heads:   int = 4,      # Q heads
                 n_kv_heads: int = 1,     # KV heads (GQA: shared across Q head groups)
                 eps: float = 1e-6):
        assert n_heads % n_kv_heads == 0, "n_heads must be divisible by n_kv_heads"
        self.h    = n_heads
        self.hkv  = n_kv_heads
        self.grp  = n_heads // n_kv_heads   # Q heads per KV head
        self.dh   = d_visual // n_heads     # head dim
        self.scale = 1.0 / math.sqrt(self.dh)
        self.dv    = d_visual
        self.dt    = d_text
        self.eps   = eps

        kq = math.sqrt(1.0 / d_visual)
        kt = math.sqrt(1.0 / d_text)

        # Q projection: visual → all Q heads
        self.Wq  = (np.random.randn(d_visual, n_heads * self.dh).astype(np.float32) * kq)
        # K, V projections: text → n_kv_heads (GQA)
        self.Wk  = (np.random.randn(d_text, n_kv_heads * self.dh).astype(np.float32) * kt)
        self.Wv  = (np.random.randn(d_text, n_kv_heads * self.dh).astype(np.float32) * kt)
        # Output projection
        self.Wo  = (np.random.randn(n_heads * self.dh, d_visual).astype(np.float32) * kq)
        self.bo  = np.zeros(d_visual, dtype=np.float32)

        # LayerNorm on visual before Q projection (pre-norm)
        self.ln_g = np.ones(d_visual,  dtype=np.float32)
        self.ln_b = np.zeros(d_visual, dtype=np.float32)

        # Gradient arrays
        self.dWq  = np.zeros_like(self.Wq)
        self.dWk  = np.zeros_like(self.Wk)
        self.dWv  = np.zeros_like(self.Wv)
        self.dWo  = np.zeros_like(self.Wo)
        self.dbo  = np.zeros_like(self.bo)
        self.dln_g = np.zeros_like(self.ln_g)
        self.dln_b = np.zeros_like(self.ln_b)

        self._c: Optional[tuple] = None

    # ── LayerNorm helpers ───────────────────────────────────────────────

    def _ln(self, x: np.ndarray):
        """x: [..., C]. Returns (y, cache)."""
        mu  = x.mean(-1, keepdims=True)
        var = x.var(-1, keepdims=True)
        xn  = (x - mu) / np.sqrt(var + self.eps)
        y   = self.ln_g * xn + self.ln_b
        return y, (xn, var)

    def _ln_back(self, dy: np.ndarray, xn: np.ndarray, var: np.ndarray):
        n = xn.shape[-1]
        self.dln_g += (dy * xn).reshape(-1, n).sum(0)
        self.dln_b += dy.reshape(-1, n).sum(0)
        dxn = dy * self.ln_g
        std = np.sqrt(var + self.eps)
        dx  = (dxn - dxn.mean(-1, keepdims=True)
               - xn * (dxn * xn).mean(-1, keepdims=True)) / std
        return dx

    # ── Forward pass ────────────────────────────────────────────────────

    def forward(self,
                x_vis: np.ndarray,
                x_txt: np.ndarray) -> np.ndarray:
        """
        x_vis : [H, W, dv]
        x_txt : [S, dt]
        returns: [H, W, dv]
        """
        H, W, dv = x_vis.shape
        S, dt    = x_txt.shape
        N        = H * W
        h        = self.h
        hkv      = self.hkv
        grp      = self.grp
        dh       = self.dh

        # Pre-norm on visual stream
        x_flat, (xn, var) = self._ln(x_vis.reshape(N, dv))

        # Q from visual: [N, h*dh] → [h, N, dh]
        Q = (x_flat @ self.Wq).reshape(N, h, dh).transpose(1, 0, 2)

        # K, V from text: [S, hkv*dh] → [hkv, S, dh]
        K = (x_txt @ self.Wk).reshape(S, hkv, dh).transpose(1, 0, 2)
        V = (x_txt @ self.Wv).reshape(S, hkv, dh).transpose(1, 0, 2)

        # Expand KV heads to Q heads (GQA broadcast)
        # [hkv, S, dh] → [h, S, dh]
        K_exp = np.repeat(K, grp, axis=0)   # [h, S, dh]
        V_exp = np.repeat(V, grp, axis=0)   # [h, S, dh]

        # Scaled dot-product: [h, N, S]
        scores = np.einsum('hnq,hsk->hns', Q.reshape(h, N, dh),
                           K_exp) * self.scale
        w = _softmax(scores)   # [h, N, S]

        # Weighted sum over text tokens: [h, N, dh]
        ctx = np.einsum('hns,hsd->hnd', w, V_exp)

        # Merge heads → [N, h*dh]
        ctx_flat = ctx.transpose(1, 0, 2).reshape(N, h * dh)

        # Output projection → [N, dv]
        out = ctx_flat @ self.Wo + self.bo

        # Residual + reshape
        result = out.reshape(H, W, dv) + x_vis

        self._c = (x_vis, x_flat, xn, var, x_txt, Q, K, V,
                   K_exp, V_exp, w, ctx, ctx_flat, N, H, W, S)
        return result

    # ── Backward pass ───────────────────────────────────────────────────

    def backward(self,
                 dout: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        dout    : [H, W, dv] — gradient from downstream
        returns : (d_x_vis [H, W, dv], d_x_txt [S, dt])
        """
        (x_vis, x_flat, xn, var, x_txt,
         Q, K, V, K_exp, V_exp, w, ctx, ctx_flat,
         N, H, W, S) = self._c

        h, hkv, grp, dh, dv, dt = (self.h, self.hkv, self.grp,
                                    self.dh, self.dv, self.dt)

        # Residual: dout flows through to x_vis
        dx_vis_res = dout.copy()
        dout_flat  = dout.reshape(N, dv)

        # Output projection backward
        self.dWo += ctx_flat.T @ dout_flat
        self.dbo += dout_flat.sum(0)
        d_ctx_flat = dout_flat @ self.Wo.T           # [N, h*dh]
        d_ctx = d_ctx_flat.reshape(N, h, dh).transpose(1, 0, 2)   # [h, N, dh]

        # Attention backward
        # ctx = einsum(w, V_exp) → [h, N, dh]
        dw     = np.einsum('hnd,hsd->hns', d_ctx, V_exp)  # [h, N, S]
        dV_exp = np.einsum('hns,hnd->hsd', w, d_ctx)      # [h, S, dh]

        # Softmax backward
        dscores = _softmax_back(w, dw) * self.scale        # [h, N, S]

        dQ = np.einsum('hns,hsd->hnd', dscores, K_exp)    # [h, N, dh]
        dK_exp = np.einsum('hns,hnd->hsd', dscores, Q)    # [h, S, dh]

        # GQA: reduce expanded K/V grads back to n_kv_heads
        dK = dK_exp.reshape(hkv, grp, S, dh).sum(1)       # [hkv, S, dh]
        dV = dV_exp.reshape(hkv, grp, S, dh).sum(1)

        # Text gradients (K, V projections)
        dK_flat = dK.transpose(1, 0, 2).reshape(S, hkv * dh)
        dV_flat = dV.transpose(1, 0, 2).reshape(S, hkv * dh)

        self.dWk += x_txt.T @ dK_flat
        self.dWv += x_txt.T @ dV_flat
        d_x_txt = dK_flat @ self.Wk.T + dV_flat @ self.Wv.T   # [S, dt]

        # Q gradient → visual
        dQ_flat = dQ.transpose(1, 0, 2).reshape(N, h * dh)
        self.dWq += x_flat.T @ dQ_flat
        dx_vis_from_Q = (dQ_flat @ self.Wq.T).reshape(N, dv)

        # LayerNorm backward
        dx_vis_ln = self._ln_back(dx_vis_from_Q, xn, var).reshape(H, W, dv)

        dx_vis = dx_vis_ln + dx_vis_res
        return dx_vis, d_x_txt

    # ── Utilities ───────────────────────────────────────────────────────

    def zero_grads(self) -> None:
        for a in (self.dWq, self.dWk, self.dWv, self.dWo, self.dbo,
                  self.dln_g, self.dln_b):
            a[:] = 0.0

    def all_param_grad_pairs(self):
        return [(
            {'Wq': self.Wq, 'Wk': self.Wk, 'Wv': self.Wv,
             'Wo': self.Wo, 'bo': self.bo,
             'ln_g': self.ln_g, 'ln_b': self.ln_b},
            {'Wq': self.dWq, 'Wk': self.dWk, 'Wv': self.dWv,
             'Wo': self.dWo, 'bo': self.dbo,
             'ln_g': self.dln_g, 'ln_b': self.dln_b},
        )]

    def collect_params(self, prefix: str = '') -> Dict[str, np.ndarray]:
        p = self.all_param_grad_pairs()[0][0]
        return {f'{prefix}{k}': v for k, v in p.items()}

    def load_params(self, d: Dict[str, np.ndarray]) -> None:
        for k, arr in d.items():
            if hasattr(self, k):
                getattr(self, k)[:] = arr
