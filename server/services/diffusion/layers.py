"""
Neural network layers v2 — pure NumPy, no frameworks.

Upgrades over v1:
  - SelfAttention2D    : multi-head spatial self-attention (transformer-style)
  - ResBlock           : residual ConvBlock with projection shortcut
  - GroupNorm          : group normalisation (more stable than BN at small batches)
  - EMA                : exponential moving average of model weights
  - Depthwise+Pointwise: factored convolution option for speed
  - Cosine activation  : optional swish/cosine mix

All layers implement forward() and backward() for full backprop training.
Convolution via vectorized im2col (stride tricks) — no Python loops.
"""

import numpy as np
import math
import sys as _sys
import os as _os


def _f16safe(arr: np.ndarray) -> np.ndarray:
    """Clip to float16 range then cast — prevents ±inf from overflowing caches."""
    return np.clip(arr, -65504.0, 65504.0).astype(np.float16)


def _f32safe(arr16: np.ndarray) -> np.ndarray:
    """Restore a float16 cache to float32, clamping any residual ±inf/NaN to zero."""
    return np.nan_to_num(arr16.astype(np.float32), nan=0.0, posinf=65504.0, neginf=-65504.0)

_services_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _services_dir not in _sys.path:
    _sys.path.insert(0, _services_dir)
try:
    from digitalgpu import get_gpu as _get_gpu
    # Only activate GPU path when CUDA or MPS hardware is present.
    # digitalgpu.conv2d expects raw 4-D (B,C,H,W) input with its own
    # im2col, which is incompatible with the pre-computed 2-D `cols`
    # matrix that Conv2D.forward() passes.  On the numpy/CPU tier the
    # GPU branch must be disabled or every step crashes with:
    #   "not enough values to unpack (expected 4, got 2)"
    _GPU_AVAILABLE = _get_gpu().acceleration_tier in ('cuda', 'mps')
except Exception:
    _GPU_AVAILABLE = False


# ── Utility: im2col / col2im ───────────────────────────────────────────────

def im2col(x: np.ndarray, kH: int, kW: int,
           stride: int = 1, pad: int = 1) -> np.ndarray:
    """
    x: [H, W, C]  →  cols: [H_out*W_out, kH*kW*C]
    Vectorized — no Python loops, ~50× faster than naive.
    """
    H, W, C = x.shape
    H_out = (H + 2 * pad - kH) // stride + 1
    W_out = (W + 2 * pad - kW) // stride + 1
    x_pad = np.pad(x, ((pad, pad), (pad, pad), (0, 0)), mode='constant')
    s = x_pad.strides
    shape   = (H_out, W_out, kH, kW, C)
    strides = (s[0] * stride, s[1] * stride, s[0], s[1], s[2])
    windows = np.lib.stride_tricks.as_strided(x_pad, shape=shape, strides=strides)
    cols = windows.reshape(H_out * W_out, kH * kW * C)
    return cols.astype(x.dtype, copy=False), H_out, W_out


def col2im(dcols: np.ndarray, x_shape: tuple,
           kH: int, kW: int, stride: int = 1, pad: int = 1) -> np.ndarray:
    """col2im: vectorized scatter with np.add.at (kH*kW iterations, no more)."""
    H, W, C = x_shape
    H_out = (H + 2 * pad - kH) // stride + 1
    W_out = (W + 2 * pad - kW) // stride + 1
    dcols_rs = dcols.reshape(H_out, W_out, kH, kW, C)
    x_pad = np.zeros((H + 2 * pad, W + 2 * pad, C), dtype=dcols.dtype)
    row_offsets = (np.arange(H_out) * stride)[:, None] + np.arange(kH)[None, :]
    col_offsets = (np.arange(W_out) * stride)[:, None] + np.arange(kW)[None, :]
    for ki in range(kH):
        for kj in range(kW):
            np.add.at(x_pad,
                      (row_offsets[:, ki, None], col_offsets[:, kj][None, :]),
                      dcols_rs[:, :, ki, kj, :])
    return x_pad[pad:pad + H, pad:pad + W, :]


# ── Conv2D ─────────────────────────────────────────────────────────────────

class Conv2D:
    def __init__(self, c_in: int, c_out: int, k: int = 3,
                 stride: int = 1, pad: int = 1):
        self.c_in = c_in; self.c_out = c_out
        self.k = k; self.stride = stride; self.pad = pad
        scale = math.sqrt(2.0 / (c_in * k * k))
        self.params = {
            'W': (np.random.randn(c_out, c_in * k * k) * scale).astype(np.float32),
            'b': np.zeros(c_out, dtype=np.float32),
        }
        self.grads  = {'W': np.zeros_like(self.params['W']),
                       'b': np.zeros_like(self.params['b'])}
        self._cache = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        cols, H_out, W_out = im2col(x, self.k, self.k, self.stride, self.pad)
        if _GPU_AVAILABLE:
            out_flat = _get_gpu().conv2d(cols, self.params['W'],
                                         b=self.params['b'])
        else:
            out_flat = cols @ self.params['W'].T + self.params['b']
        self._cache = (_f16safe(x), H_out, W_out)  # f16 halves cache size
        del cols
        return out_flat.reshape(H_out, W_out, self.c_out)

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x16, H_out, W_out = self._cache
        x = _f32safe(x16)  # restore precision for grad computation
        cols, _, _ = im2col(x, self.k, self.k, self.stride, self.pad)
        dout_flat = dout.reshape(-1, self.c_out)
        self.grads['W'] = dout_flat.T @ cols
        self.grads['b'] = dout_flat.sum(axis=0)
        dcols = dout_flat @ self.params['W']
        return col2im(dcols, x.shape, self.k, self.k, self.stride, self.pad)


# ── Group Normalisation ────────────────────────────────────────────────────

class GroupNorm:
    """
    Group normalisation — more stable than BatchNorm at small-batch / inference.
    Groups channels into G groups and normalises within each group.
    """
    def __init__(self, c: int, G: int = 8, eps: float = 1e-5):
        self.G   = min(G, c)    # can't have more groups than channels
        self.eps = eps
        self.params = {
            'gamma': np.ones(c,  dtype=np.float32),
            'beta':  np.zeros(c, dtype=np.float32),
        }
        self.grads = {'gamma': np.zeros(c, dtype=np.float32),
                      'beta':  np.zeros(c, dtype=np.float32)}
        self._cache = None
        self.training = True      # ignored (GroupNorm same at train/inference)

    def forward(self, x: np.ndarray) -> np.ndarray:
        # x: [H, W, C]
        H, W, C = x.shape
        G = self.G
        CG = C // G
        x_r = x.reshape(H, W, G, CG)
        mean = x_r.mean(axis=(0, 1, 3), keepdims=True)
        var  = x_r.var(axis=(0, 1, 3),  keepdims=True)
        x_hat = (x_r - mean) / np.sqrt(var + self.eps)
        x_hat = x_hat.reshape(H, W, C)
        # mean/var are tiny (G,) vectors — keep f32; x_r and x_hat are large — store f16
        self._cache = (_f16safe(x_r), _f16safe(x_hat), mean, var, H, W, C, G, CG)
        return self.params['gamma'] * x_hat + self.params['beta']

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x_r16, x_hat16, mean, var, H, W, C, G, CG = self._cache
        x_r = _f32safe(x_r16)
        x_hat = _f32safe(x_hat16)
        N = H * W * CG
        std_inv = 1.0 / np.sqrt(var + self.eps)
        self.grads['gamma'] = (dout * x_hat).sum(axis=(0, 1))
        self.grads['beta']  = dout.sum(axis=(0, 1))
        dx_hat = (dout * self.params['gamma']).reshape(H, W, G, CG)
        dvar   = (dx_hat * (x_r - mean) * -0.5 * std_inv ** 3).sum(axis=(0, 1, 3), keepdims=True)
        dmean  = (-dx_hat * std_inv).sum(axis=(0, 1, 3), keepdims=True) \
                 + dvar * (-2 * (x_r - mean)).sum(axis=(0, 1, 3), keepdims=True) / N
        dx = (dx_hat * std_inv + dvar * 2 * (x_r - mean) / N + dmean / N).reshape(H, W, C)
        return dx

    def set_training(self, mode: bool):
        self.training = mode


# ── Batch Norm (kept for compatibility) ────────────────────────────────────

class BatchNorm:
    def __init__(self, c: int, eps: float = 1e-5, momentum: float = 0.1):
        self.eps = eps; self.momentum = momentum
        self.params = {'gamma': np.ones(c, dtype=np.float32),
                       'beta':  np.zeros(c, dtype=np.float32)}
        self.grads  = {'gamma': np.zeros(c, dtype=np.float32),
                       'beta':  np.zeros(c, dtype=np.float32)}
        self.running_mean = np.zeros(c, dtype=np.float32)
        self.running_var  = np.ones(c,  dtype=np.float32)
        self._cache = None; self.training = True

    def forward(self, x):
        if self.training:
            mean = x.mean(axis=(0, 1)); var = x.var(axis=(0, 1))
            self.running_mean = (1-self.momentum)*self.running_mean + self.momentum*mean
            self.running_var  = (1-self.momentum)*self.running_var  + self.momentum*var
        else:
            mean = self.running_mean; var = self.running_var
        x_hat = (x - mean) / np.sqrt(var + self.eps)
        # mean/var are (C,) vectors — keep f32; x and x_hat are large — store f16
        self._cache = (_f16safe(x), _f16safe(x_hat), mean, var)
        return self.params['gamma'] * x_hat + self.params['beta']

    def backward(self, dout):
        x16, x_hat16, mean, var = self._cache
        x = _f32safe(x16)
        x_hat = _f32safe(x_hat16)
        N = x.shape[0] * x.shape[1]
        std_inv = 1.0 / np.sqrt(var + self.eps)
        dx_hat  = dout * self.params['gamma']
        dvar    = (dx_hat * (x-mean) * -0.5 * std_inv**3).sum(axis=(0,1))
        dmean   = (-dx_hat*std_inv).sum(axis=(0,1)) + dvar*(-2*(x-mean)).sum(axis=(0,1))/N
        dx = dx_hat*std_inv + dvar*2*(x-mean)/N + dmean/N
        self.grads['gamma'] = (dout*x_hat).sum(axis=(0,1))
        self.grads['beta']  = dout.sum(axis=(0,1))
        return dx

    def set_training(self, mode: bool): self.training = mode


# ── Activations ────────────────────────────────────────────────────────────

class SiLU:
    """Sigmoid-Linear Unit (Swish) — smooth, used in modern diffusion models."""
    def __init__(self):
        self._sig = None

    def forward(self, x):
        sig = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
        self._sig = _f16safe(sig)  # f16 halves cache; values in [0,1], no overflow risk
        return x * sig

    def backward(self, dout):
        sig = _f32safe(self._sig)  # restore for grad computation
        sig_safe = np.clip(sig, 1e-7, 1.0 - 1e-7)
        x = np.log(sig_safe) - np.log(1.0 - sig_safe)
        return dout * sig * (1.0 + x * (1.0 - sig))

    @property
    def params(self): return {}
    @property
    def grads(self): return {}


class ReLU:
    def __init__(self): self._mask = None
    def forward(self, x): self._mask = x > 0; return np.where(self._mask, x, 0.0)
    def backward(self, dout): return dout * self._mask
    @property
    def params(self): return {}
    @property
    def grads(self): return {}


# ── Linear ─────────────────────────────────────────────────────────────────

class Linear:
    def __init__(self, d_in: int, d_out: int):
        scale = math.sqrt(2.0 / d_in)
        self.params = {
            'W': (np.random.randn(d_out, d_in) * scale).astype(np.float32),
            'b': np.zeros(d_out, dtype=np.float32),
        }
        self.grads = {'W': np.zeros_like(self.params['W']),
                      'b': np.zeros_like(self.params['b'])}
        self._x = None

    def forward(self, x):
        self._x = x
        if _GPU_AVAILABLE:
            return _get_gpu().gemm(x, self.params['W'].T,
                                   bias=self.params['b'])
        return x @ self.params['W'].T + self.params['b']

    def backward(self, dout):
        self.grads['W'] += dout.reshape(-1, dout.shape[-1]).T @ self._x.reshape(-1, self._x.shape[-1])
        self.grads['b'] += dout.reshape(-1, dout.shape[-1]).sum(axis=0)
        return dout @ self.params['W']


# ── Self-Attention 2D ──────────────────────────────────────────────────────

class SelfAttention2D:
    """
    Multi-head spatial self-attention for 2D feature maps.

    This is the core operation that makes modern generative models (Veo,
    DALL-E, Stable Diffusion) understand global image structure — every
    spatial position attends to every other position simultaneously.

    Input:  [H, W, C]
    Output: [H, W, C]

    Uses scaled dot-product attention: Attention(Q,K,V) = softmax(QK^T/√d)V
    Implements full backward pass for training.
    """

    def __init__(self, c: int, n_heads: int = 4):
        assert c % n_heads == 0, f"channels {c} must be divisible by n_heads {n_heads}"
        self.c = c
        self.n_heads = n_heads
        self.d_head  = c // n_heads
        self.scale   = 1.0 / math.sqrt(self.d_head)

        # Q, K, V projections + output projection
        for name in ('Q', 'K', 'V', 'out'):
            scale_w = math.sqrt(2.0 / c)
            self.params = {} if not hasattr(self, 'params') else self.params
        self.params = {
            'Wq': (np.random.randn(c, c) * math.sqrt(2.0 / c)).astype(np.float32),
            'Wk': (np.random.randn(c, c) * math.sqrt(2.0 / c)).astype(np.float32),
            'Wv': (np.random.randn(c, c) * math.sqrt(2.0 / c)).astype(np.float32),
            'Wo': (np.random.randn(c, c) * math.sqrt(2.0 / c)).astype(np.float32),
            'bo': np.zeros(c, dtype=np.float32),
        }
        self.grads = {k: np.zeros_like(v) for k, v in self.params.items()}
        self.norm  = GroupNorm(c, G=min(8, c))
        self._cache = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        # x: [H, W, C]
        H, W, C = x.shape
        N = H * W
        h = self.n_heads
        d = self.d_head

        # Layer norm (pre-norm architecture — more stable)
        x_norm = self.norm.forward(x)
        x_flat = x_norm.reshape(N, C)       # [N, C]

        if _GPU_AVAILABLE:
            _gpu = _get_gpu()
            Q_flat = _gpu.gemm(x_flat, self.params['Wq'].T)   # [N, C]
            K_flat = _gpu.gemm(x_flat, self.params['Wk'].T)
            V_flat = _gpu.gemm(x_flat, self.params['Wv'].T)
        else:
            Q_flat = x_flat @ self.params['Wq'].T
            K_flat = x_flat @ self.params['Wk'].T
            V_flat = x_flat @ self.params['Wv'].T

        # Split heads: [N, h, d]
        Q = Q_flat.reshape(N, h, d)
        K = K_flat.reshape(N, h, d)
        V = V_flat.reshape(N, h, d)

        # TATTN — fused scaled dot-product attention
        if _GPU_AVAILABLE:
            out_heads, attn_weights = _get_gpu().attention(
                Q, K, V, scale=self.scale)
        else:
            attn_logits = np.einsum('nhd,mhd->hnm', Q, K) * self.scale
            attn_logits -= attn_logits.max(axis=-1, keepdims=True)
            attn_weights = np.exp(attn_logits)
            attn_weights /= attn_weights.sum(axis=-1, keepdims=True) + 1e-9
            out_heads = np.einsum('hnm,mhd->nhd', attn_weights, V)

        out_flat = out_heads.reshape(N, C)

        # Output projection
        if _GPU_AVAILABLE:
            out = _get_gpu().gemm(out_flat, self.params['Wo'].T,
                                  bias=self.params['bo'])
        else:
            out = out_flat @ self.params['Wo'].T + self.params['bo']

        # Store large activation arrays as f16 to halve cache memory
        self._cache = (_f16safe(x), _f16safe(x_norm),
                       _f16safe(x_flat), _f16safe(Q),
                       _f16safe(K), _f16safe(V),
                       _f16safe(attn_weights), _f16safe(out_flat),
                       H, W, C, N)
        # Residual connection: output + input
        return out.reshape(H, W, C) + x

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x16, x_norm16, x_flat16, Q16, K16, V16, attn_weights16, out_flat16, H, W, C, N = self._cache
        x            = _f32safe(x16)
        x_norm       = _f32safe(x_norm16)
        x_flat       = _f32safe(x_flat16)
        Q            = _f32safe(Q16)
        K            = _f32safe(K16)
        V            = _f32safe(V16)
        attn_weights = _f32safe(attn_weights16)
        out_flat     = _f32safe(out_flat16)
        h = self.n_heads
        d = self.d_head

        dout_flat = dout.reshape(N, C)

        # Grad through output projection
        self.grads['Wo'] += dout_flat.T @ out_flat
        self.grads['bo'] += dout_flat.sum(axis=0)
        dout_heads = dout_flat @ self.params['Wo']   # [N, C]
        dout_heads = dout_heads.reshape(N, h, d)

        # Grad through attention weighted sum
        # out_heads[n,h,d] = sum_m attn[h,n,m] * V[m,h,d]
        dV_heads    = np.einsum('hnm,nhd->mhd', attn_weights, dout_heads)  # [N, h, d]
        dattn_weights = np.einsum('nhd,mhd->hnm', dout_heads, V)           # [h, N, N]

        # Grad through softmax
        # d(softmax)/da: for each row: diag(s) - s*s^T
        dattn_logits = attn_weights * (
            dattn_weights - (dattn_weights * attn_weights).sum(axis=-1, keepdims=True))
        dattn_logits *= self.scale

        # Grad through Q, K matmul
        dQ_heads = np.einsum('hnm,mhd->nhd', dattn_logits, K)
        dK_heads = np.einsum('hnm,nhd->mhd', dattn_logits, Q)

        dQ = dQ_heads.reshape(N, C)
        dK = dK_heads.reshape(N, C)
        dV = dV_heads.reshape(N, C)

        self.grads['Wq'] += dQ.T @ x_flat
        self.grads['Wk'] += dK.T @ x_flat
        self.grads['Wv'] += dV.T @ x_flat

        dx_flat = dQ @ self.params['Wq'] + dK @ self.params['Wk'] + dV @ self.params['Wv']
        dx_norm = dx_flat.reshape(H, W, C)

        # Grad through GroupNorm
        dx_gn = self.norm.backward(dx_norm)

        # Residual: dout passes through both branches
        return dout + dx_gn

    def zero_grads(self):
        for k in self.grads: self.grads[k][:] = 0.0
        for k in self.norm.grads: self.norm.grads[k][:] = 0.0

    def all_param_grad_pairs(self):
        return [(self.params, self.grads), (self.norm.params, self.norm.grads)]


# ── Residual ConvBlock ─────────────────────────────────────────────────────

class ResBlock:
    """
    Residual block: x → [Conv→GN→SiLU→Conv→GN] + shortcut(x)

    If c_in ≠ c_out, the shortcut uses a 1×1 conv to match dimensions.
    This enables training much deeper networks without vanishing gradients.
    """

    def __init__(self, c_in: int, c_out: int):
        self.c_in  = c_in
        self.c_out = c_out
        self.conv1 = Conv2D(c_in,  c_out, k=3, pad=1)
        self.gn1   = GroupNorm(c_out, G=min(8, c_out))
        self.act1  = SiLU()
        self.conv2 = Conv2D(c_out, c_out, k=3, pad=1)
        self.gn2   = GroupNorm(c_out, G=min(8, c_out))
        self.act2  = SiLU()
        # Shortcut projection (1×1) if dimensions mismatch
        self.proj  = Conv2D(c_in, c_out, k=1, pad=0) if c_in != c_out else None
        self._cache = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        shortcut = self.proj.forward(x) if self.proj else x
        h = self.act1.forward(self.gn1.forward(self.conv1.forward(x)))
        h = self.gn2.forward(self.conv2.forward(h))
        # NOTE: self._cache not needed — backward uses sub-module caches only
        return self.act2.forward(h + shortcut)

    def backward(self, dout: np.ndarray) -> np.ndarray:
        dh_act = self.act2.backward(dout)
        # Residual: gradient flows to both branches
        dh = dh_act
        dshortcut = dh_act
        # Main branch
        dh = self.conv2.backward(self.gn2.backward(dh))
        dh = self.conv1.backward(self.gn1.backward(self.act1.backward(dh)))
        # Shortcut branch
        if self.proj:
            dshortcut = self.proj.backward(dshortcut)
        return dh + dshortcut

    def _get_param_grad_pairs(self):
        pairs = [
            (self.conv1.params, self.conv1.grads),
            (self.gn1.params,   self.gn1.grads),
            (self.conv2.params, self.conv2.grads),
            (self.gn2.params,   self.gn2.grads),
        ]
        if self.proj:
            pairs.append((self.proj.params, self.proj.grads))
        return pairs

    def set_training(self, mode: bool):
        self.gn1.set_training(mode)
        self.gn2.set_training(mode)
        if self.proj and hasattr(self.proj, 'set_training'):
            pass

    @property
    def params(self):
        p = {}
        p.update({f'c1_{k}': v for k, v in self.conv1.params.items()})
        p.update({f'g1_{k}': v for k, v in self.gn1.params.items()})
        p.update({f'c2_{k}': v for k, v in self.conv2.params.items()})
        p.update({f'g2_{k}': v for k, v in self.gn2.params.items()})
        if self.proj:
            p.update({f'pr_{k}': v for k, v in self.proj.params.items()})
        return p

    @property
    def grads(self):
        g = {}
        g.update({f'c1_{k}': v for k, v in self.conv1.grads.items()})
        g.update({f'g1_{k}': v for k, v in self.gn1.grads.items()})
        g.update({f'c2_{k}': v for k, v in self.conv2.grads.items()})
        g.update({f'g2_{k}': v for k, v in self.gn2.grads.items()})
        if self.proj:
            g.update({f'pr_{k}': v for k, v in self.proj.grads.items()})
        return g


# ── ConvBlock (kept for compatibility) ────────────────────────────────────

class ConvBlock:
    def __init__(self, c_in: int, c_out: int, k: int = 3, pad: int = 1):
        self.conv = Conv2D(c_in, c_out, k, pad=pad)
        self.bn   = GroupNorm(c_out, G=min(8, c_out))   # upgraded: GN instead of BN
        self.act  = SiLU()

    def forward(self, x):
        return self.act.forward(self.bn.forward(self.conv.forward(x)))

    def backward(self, dout):
        return self.conv.backward(self.bn.backward(self.act.backward(dout)))

    def set_training(self, mode: bool):
        self.bn.set_training(mode)

    @property
    def params(self):
        return {**{f'conv_{k}': v for k, v in self.conv.params.items()},
                **{f'bn_{k}':   v for k, v in self.bn.params.items()}}

    @property
    def grads(self):
        return {**{f'conv_{k}': v for k, v in self.conv.grads.items()},
                **{f'bn_{k}':   v for k, v in self.bn.grads.items()}}


# ── Pooling / Upsample ─────────────────────────────────────────────────────

class MaxPool2x2:
    def __init__(self): self._x = None

    def forward(self, x):
        self._x = x
        H, W, C = x.shape; h, w = H//2, W//2
        return x[:h*2, :w*2].reshape(h, 2, w, 2, C).max(axis=(1, 3))

    def backward(self, dout):
        x = self._x; H, W, C = x.shape; h, w = H//2, W//2
        x_rs = x[:h*2, :w*2].reshape(h, 2, w, 2, C)
        mx   = x_rs.max(axis=(1, 3), keepdims=True)
        mask = (x_rs == mx).astype(np.float32)
        dx_rs = mask * dout[:, None, :, None, :]
        dx_rs /= mask.sum(axis=(1, 3), keepdims=True).clip(1)
        dx = np.zeros_like(x); dx[:h*2, :w*2] = dx_rs.reshape(h*2, w*2, C)
        return dx

    @property
    def params(self): return {}
    @property
    def grads(self): return {}


def upsample2x(x: np.ndarray) -> np.ndarray:
    H, W, C = x.shape
    out = np.empty((H*2, W*2, C), dtype=x.dtype)
    out[0::2, 0::2] = x; out[1::2, 0::2] = x
    out[0::2, 1::2] = x; out[1::2, 1::2] = x
    return out


def upsample2x_backward(dout: np.ndarray) -> np.ndarray:
    return (dout[0::2, 0::2] + dout[1::2, 0::2] +
            dout[0::2, 1::2] + dout[1::2, 1::2])


# ── Adam Optimizer ─────────────────────────────────────────────────────────

class Adam:
    """Adam optimizer with cosine LR annealing support."""

    def __init__(self, lr: float = 1e-3, beta1: float = 0.9,
                 beta2: float = 0.999, eps: float = 1e-8,
                 weight_decay: float = 0.0,
                 lr_min: float = 1e-5):
        self.lr0 = lr; self.lr = lr; self.lr_min = lr_min
        self.b1  = beta1; self.b2 = beta2; self.eps = eps; self.wd = weight_decay
        self.t   = 0
        self._m: dict = {}; self._v: dict = {}

    def cosine_anneal(self, step: int, total_steps: int):
        """Cosine annealing schedule: lr drops from lr0 to lr_min smoothly."""
        t = step / max(total_steps, 1)
        self.lr = self.lr_min + 0.5 * (self.lr0 - self.lr_min) * (1 + math.cos(math.pi * t))

    def step(self, param_grad_pairs: list):
        self.t += 1
        bc1 = 1.0 - self.b1 ** self.t
        bc2 = 1.0 - self.b2 ** self.t

        for (params, grads) in param_grad_pairs:
            for key in params:
                if key not in grads or grads[key] is None: continue
                flat_key = id(params) * 1000 + hash(key)
                g = grads[key].astype(np.float32)
                if self.wd > 0:
                    g += self.wd * params[key]          # in-place

                first = flat_key not in self._m
                if first:
                    # np.empty: virtual-only (no memset) so physical pages are
                    # deferred until the copyto calls below — saves ~75 MB peak
                    self._m[flat_key] = np.empty(g.shape, dtype=np.float16)
                    self._v[flat_key] = np.empty(g.shape, dtype=np.float16)

                m = self._m[flat_key]   # float16 view (≈ half the size of f32)
                v = self._v[flat_key]   # float16 view

                # Promote to float32 for numerics; treat uninitialised as zero
                m32 = np.zeros_like(g) if first else m.astype(np.float32)
                v32 = np.zeros_like(g) if first else v.astype(np.float32)

                # Update moments in float32
                g_sq  = g * g
                m32  *= self.b1;  m32 += (1.0 - self.b1) * g     # 1 temp, freed
                v32  *= self.b2;  v32 += (1.0 - self.b2) * g_sq  # 1 temp, freed
                del g, g_sq

                # Store back as float16 (also backs the lazy pages on first step)
                np.copyto(m, m32, casting='unsafe')
                np.copyto(v, v32, casting='unsafe')

                # Bias-corrected update — all in float32, applied in-place to params
                m_hat = m32 / bc1
                v_hat = v32 / bc2
                del m32, v32
                np.sqrt(v_hat, out=v_hat)
                v_hat += self.eps
                m_hat *= self.lr
                m_hat /= v_hat
                del v_hat
                params[key] -= m_hat.astype(np.float32)  # in-place: no new params
                del m_hat


# ── EMA (Exponential Moving Average of weights) ────────────────────────────

class EMA:
    """
    Exponential Moving Average of model weights for better inference quality.

    EMA smooths out noisy gradient updates during training. At inference,
    use EMA weights instead of raw weights for 5-15% quality improvement
    with no extra compute cost.

    decay=0.9999 is standard in modern diffusion models (DDPM, DALL-E 2, etc.)
    """

    def __init__(self, decay: float = 0.9999):
        self.decay  = decay
        self._store: dict = {}   # EMA weight snapshots

    def update(self, param_grad_pairs: list):
        """Update EMA after each optimizer step."""
        for (params, _) in param_grad_pairs:
            for key, val in params.items():
                pk = (id(params), key)
                if pk not in self._store:
                    self._store[pk] = val.astype(np.float32, copy=True)
                else:
                    e = self._store[pk]
                    e *= self.decay                      # in-place: no new EMA array
                    e += (1.0 - self.decay) * val       # 1 temp for (1-d)*val → freed

    def apply(self, param_grad_pairs: list):
        """Swap in EMA weights for inference."""
        backup = {}
        for (params, _) in param_grad_pairs:
            for key in params:
                pk = (id(params), key)
                if pk in self._store:
                    backup[(id(params), key)] = params[key].copy()
                    params[key] = self._store[pk].copy()
        return backup

    def restore(self, param_grad_pairs: list, backup: dict):
        """Restore original weights after inference."""
        for (params, _) in param_grad_pairs:
            for key in params:
                pk = (id(params), key)
                if pk in backup:
                    params[key] = backup[pk]
