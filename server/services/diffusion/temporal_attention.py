"""
Temporal Attention Module — Video-Native Architecture

Standard 2D spatial attention treats each frame independently.
This module adds 1D temporal attention across T frames at each spatial position.

Factored Space-Time Attention (from Video Diffusion Models, Ho et al. 2022):
  Given feature map x of shape (T, H, W, C):
    1. Spatial attention:  attend across H×W positions  per frame
    2. Temporal attention: attend across T frames        per spatial position

  Complexity:
    Spatial:  O(T × (HW)²) — same as applying 2D attention T times
    Temporal: O(HW × T²)   — cheap for T=8 (only 64 pairs per position)

  vs naive 3D attention: O((THW)²) = O(T²H²W²) — intractable

Temporal Position Encoding:
  Learned sinusoidal embeddings added to the T dimension so the model
  knows the relative order of frames. Critical for motion coherence.

Causal vs bidirectional:
  For training: bidirectional (all frames attend to all — better learning)
  For inference: can be made causal (each frame only attends to past)
  Currently: bidirectional (better for short 8-frame clips)

Usage:
    ta = TemporalAttention1D(channels=256, heads=8, T=8)
    x  = np.random.randn(T, H, W, C).astype(np.float32)
    out = ta.forward(x)          # (T, H, W, C)
    dx  = ta.backward(dout)      # (T, H, W, C)
"""

import numpy as np
import math


def _sinusoidal_pos_embed(T: int, C: int) -> np.ndarray:
    """
    Sinusoidal positional embeddings for T positions, C channels.
    Same formulation as "Attention Is All You Need".
    Shape: (T, C)
    """
    pos  = np.arange(T)[:, None]          # (T, 1)
    dims = np.arange(0, C, 2)             # (C/2,)
    freqs = 1.0 / (10000 ** (dims / C))   # (C/2,)
    pe = np.zeros((T, C), dtype=np.float32)
    pe[:, 0::2] = np.sin(pos * freqs)
    pe[:, 1::2] = np.cos(pos * freqs)
    return pe


class TemporalAttention1D:
    """
    Factored temporal attention: attends across T frames at each (h, w) position.

    Input/output: (T, H, W, C)

    Internal flow:
      1. Reshape to (H*W, T, C)   — treat each spatial position as a sequence
      2. Add temporal pos embed    — (T, C) broadcast
      3. Project Q, K, V           — (H*W, T, head_dim) per head
      4. Multi-head self-attention  — attention score (H*W, heads, T, T)
      5. Project output            — (H*W, T, C)
      6. Reshape back to (T, H, W, C)
      7. Residual + LayerNorm
    """

    def __init__(self, C: int, heads: int = 4, T: int = 8):
        self.C     = C
        self.heads = heads
        self.T     = T
        self.d     = C // heads  # head dimension
        assert C % heads == 0, f"C={C} must be divisible by heads={heads}"

        # Learned temporal positional embedding (T, C) — starts as sinusoidal
        self.pos_embed = _sinusoidal_pos_embed(T, C).copy()

        # QKV projection (C → 3C)
        scale = 1.0 / math.sqrt(C)
        self.W_qkv = np.random.randn(C, 3 * C).astype(np.float32) * scale
        self.b_qkv = np.zeros(3 * C, dtype=np.float32)

        # Output projection (C → C)
        self.W_o = np.random.randn(C, C).astype(np.float32) * scale
        self.b_o = np.zeros(C, dtype=np.float32)

        # Layer norm parameters
        self.ln_gamma = np.ones(C,  dtype=np.float32)
        self.ln_beta  = np.zeros(C, dtype=np.float32)

        # Gradient buffers
        self.d_W_qkv = np.zeros_like(self.W_qkv)
        self.d_b_qkv = np.zeros_like(self.b_qkv)
        self.d_W_o   = np.zeros_like(self.W_o)
        self.d_b_o   = np.zeros_like(self.b_o)
        self.d_pos   = np.zeros_like(self.pos_embed)

        self._cache  = None

        # Persistent dict views for optimizer/serialization compatibility
        self._params_dict = {
            'W_qkv': self.W_qkv, 'b_qkv': self.b_qkv,
            'W_o':   self.W_o,   'b_o':   self.b_o,
            'ln_gamma': self.ln_gamma, 'ln_beta': self.ln_beta,
            'pos_embed': self.pos_embed,
        }
        self._grads_dict = {
            'W_qkv': self.d_W_qkv, 'b_qkv': self.d_b_qkv,
            'W_o':   self.d_W_o,   'b_o':   self.d_b_o,
            'ln_gamma': np.zeros_like(self.ln_gamma),
            'ln_beta':  np.zeros_like(self.ln_beta),
            'pos_embed': self.d_pos,
        }

    @property
    def params(self):
        return self._params_dict

    @property
    def grads(self):
        return self._grads_dict

    def _layer_norm(self, x: np.ndarray, eps=1e-5):
        """LayerNorm over last axis. Returns (normalized, mean, var)."""
        mu  = x.mean(axis=-1, keepdims=True)
        var = x.var(axis=-1, keepdims=True)
        xn  = (x - mu) / np.sqrt(var + eps)
        return self.ln_gamma * xn + self.ln_beta, mu, var, xn

    def forward(self, x: np.ndarray) -> np.ndarray:
        """
        x: (T, H, W, C)  →  out: (T, H, W, C)
        """
        T, H, W, C = x.shape
        assert C == self.C, f"Expected C={self.C}, got {C}"

        residual = x.copy()

        # 1. Reshape: (T, H, W, C) → (H*W, T, C)
        x_hw = x.transpose(1, 2, 0, 3).reshape(H * W, T, C)

        # 2. Add positional embedding
        pe      = _sinusoidal_pos_embed(T, C) + self.pos_embed[:T]
        x_pe    = x_hw + pe[None, :, :]          # (H*W, T, C) broadcast

        # 3. Layer norm
        x_norm, mu, var, xn = self._layer_norm(x_pe)

        # 4. QKV projection: (H*W, T, 3C)
        N  = H * W
        xr = x_norm.reshape(N * T, C)                     # (N*T, C)
        qkv = xr @ self.W_qkv + self.b_qkv                # (N*T, 3C)
        qkv = qkv.reshape(N, T, 3, self.heads, self.d)    # (N, T, 3, h, d)
        Q, K, V = qkv[:, :, 0], qkv[:, :, 1], qkv[:, :, 2]
        # Each: (N, T, heads, d)

        # 5. Multi-head attention over T dimension
        scale   = 1.0 / math.sqrt(self.d)
        # (N, heads, T, T)
        Q_t = Q.transpose(0, 2, 1, 3)  # (N, heads, T, d)
        K_t = K.transpose(0, 2, 1, 3)
        V_t = V.transpose(0, 2, 1, 3)
        scores = np.einsum('nhqd,nhkd->nhqk', Q_t, K_t) * scale  # (N, heads, T, T)
        scores -= scores.max(axis=-1, keepdims=True)
        weights = np.exp(scores)
        weights /= weights.sum(axis=-1, keepdims=True) + 1e-9     # (N, heads, T, T)
        attn_out = np.einsum('nhqk,nhkd->nhqd', weights, V_t)     # (N, heads, T, d)

        # 6. Merge heads: (N, T, C)
        attn_out = attn_out.transpose(0, 2, 1, 3).reshape(N, T, C)

        # 7. Output projection
        out_r = attn_out.reshape(N * T, C)
        out   = (out_r @ self.W_o + self.b_o).reshape(N, T, C)

        # 8. Residual
        out_hw = out + x_hw
        # Reshape back: (H*W, T, C) → (T, H, W, C)
        final = out_hw.reshape(H, W, T, C).transpose(2, 0, 1, 3)

        # Cache for backward
        self._cache = (x, residual, x_hw, x_pe, x_norm, mu, var, xn,
                       Q_t, K_t, V_t, weights, attn_out,
                       out_r, out, out_hw, H, W, T, N, pe)
        return final

    def backward(self, dout: np.ndarray) -> np.ndarray:
        """
        dout: (T, H, W, C) → dx: (T, H, W, C)

        Full backprop through temporal attention with gradient accumulation.
        """
        (x, residual, x_hw, x_pe, x_norm, mu, var, xn,
         Q_t, K_t, V_t, weights, attn_out,
         out_r, out, out_hw, H, W, T, N, pe) = self._cache

        C = self.C

        # 8. Residual gradient
        d_out_hw = dout.transpose(1, 2, 0, 3).reshape(N, T, C)
        d_out = d_out_hw.copy()
        d_x_hw_res = d_out_hw.copy()  # gradient flowing to x_hw via residual

        # 7. Output projection backward
        d_out_r = d_out.reshape(N * T, C)
        self.d_W_o += attn_out.reshape(N * T, C).T @ d_out_r
        self.d_b_o += d_out_r.sum(axis=0)
        d_attn_flat = d_out_r @ self.W_o.T          # (N*T, C)
        d_attn = d_attn_flat.reshape(N, T, C)

        # 6. Merge heads backward
        # attn_out = (N, heads, T, d) → (N, T, C)
        d_attn_t = d_attn.reshape(N, T, self.heads, self.d).transpose(0, 2, 1, 3)
        # (N, heads, T, d)

        # 5. Attention backward: d_attn_t = einsum(weights, V_t)
        d_V_t   = np.einsum('nhqk,nhqd->nhkd', weights, d_attn_t)   # (N,h,T,d)
        d_w     = np.einsum('nhqd,nhkd->nhqk', d_attn_t, V_t)        # (N,h,T,T)

        # softmax backward
        sw = (d_w * weights).sum(axis=-1, keepdims=True)
        d_scores = weights * (d_w - sw)
        scale_val = 1.0 / math.sqrt(self.d)
        d_Q_t = np.einsum('nhqk,nhkd->nhqd', d_scores, K_t) * scale_val
        d_K_t = np.einsum('nhqk,nhqd->nhkd', d_scores, Q_t) * scale_val

        # Transpose back: (N, heads, T, d) → (N, T, heads, d)
        d_Q = d_Q_t.transpose(0, 2, 1, 3)  # (N, T, heads, d)
        d_K = d_K_t.transpose(0, 2, 1, 3)
        d_V = d_V_t.transpose(0, 2, 1, 3)

        # 4. QKV projection backward
        d_qkv = np.stack([d_Q, d_K, d_V], axis=2)  # (N, T, 3, heads, d)
        d_qkv_r = d_qkv.reshape(N * T, 3 * C)
        self.d_W_qkv += x_norm.reshape(N * T, C).T @ d_qkv_r
        self.d_b_qkv += d_qkv_r.sum(axis=0)
        d_xnorm = (d_qkv_r @ self.W_qkv.T).reshape(N, T, C)

        # 3. LayerNorm backward (simplified — ignores gamma/beta grads for speed)
        eps = 1e-5
        std_inv = 1.0 / np.sqrt(var + eps)
        d_xn    = d_xnorm * self.ln_gamma
        d_xpe   = std_inv * (d_xn - d_xn.mean(axis=-1, keepdims=True)
                             - xn * (d_xn * xn).mean(axis=-1, keepdims=True))

        # 2. Positional embedding gradient
        self.d_pos[:T] += d_xpe.sum(axis=0)

        # 1. Reshape back to (T, H, W, C)
        d_x_hw = d_xpe + d_x_hw_res
        dx = d_x_hw.reshape(H, W, T, C).transpose(2, 0, 1, 3)

        return dx

    def _get_param_grad_pairs(self):
        return [(self.params, self.grads)]

    def param_count(self) -> int:
        return sum(v.size for v in self.params.values())
