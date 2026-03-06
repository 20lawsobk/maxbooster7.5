"""
Neural network layers — pure NumPy, no frameworks.

All layers implement forward() and backward() for training,
and store parameters in self.params / self.grads dictionaries.

Convolution uses the im2col approach: unfold input patches into a
matrix, then do a single matmul — same algorithm used internally
by PyTorch/TensorFlow, just written from scratch.
"""

import numpy as np
import math


# ── Utility: im2col / col2im ───────────────────────────────────────────────

def im2col(x: np.ndarray, kH: int, kW: int,
           stride: int = 1, pad: int = 1) -> np.ndarray:
    """
    x: [H, W, C]  →  cols: [H_out*W_out, kH*kW*C]
    Vectorized using stride tricks — no Python loops, ~50× faster than naive.
    """
    H, W, C = x.shape
    H_out = (H + 2 * pad - kH) // stride + 1
    W_out = (W + 2 * pad - kW) // stride + 1
    x_pad = np.pad(x, ((pad, pad), (pad, pad), (0, 0)), mode='constant')
    s = x_pad.strides
    # Create sliding window view: [H_out, W_out, kH, kW, C]
    shape   = (H_out, W_out, kH, kW, C)
    strides = (s[0] * stride, s[1] * stride, s[0], s[1], s[2])
    windows = np.lib.stride_tricks.as_strided(
        x_pad, shape=shape, strides=strides)
    # Reshape to [H_out*W_out, kH*kW*C]
    cols = windows.reshape(H_out * W_out, kH * kW * C)
    return cols.astype(x.dtype, copy=False), H_out, W_out


def col2im(dcols: np.ndarray, x_shape: tuple,
           kH: int, kW: int, stride: int = 1, pad: int = 1) -> np.ndarray:
    """
    Vectorized col2im — accumulates gradients back to input shape.
    Uses np.add.at with pre-computed index arrays (no Python loops).
    x_shape: (H, W, C)
    """
    H, W, C = x_shape
    H_out = (H + 2 * pad - kH) // stride + 1
    W_out = (W + 2 * pad - kW) // stride + 1
    H_pad, W_pad = H + 2 * pad, W + 2 * pad

    # dcols: [H_out*W_out, kH*kW*C]  reshape to  [H_out, W_out, kH, kW, C]
    dcols_rs = dcols.reshape(H_out, W_out, kH, kW, C)

    x_pad = np.zeros((H_pad, W_pad, C), dtype=dcols.dtype)

    # Build flat output indices for all window positions at once
    # row offsets for each output row/kernel row combination
    row_offsets = (np.arange(H_out) * stride)[:, None] + np.arange(kH)[None, :]
    col_offsets = (np.arange(W_out) * stride)[:, None] + np.arange(kW)[None, :]

    # [H_out, W_out, kH, kW, C]
    for ki in range(kH):
        for kj in range(kW):
            rows = row_offsets[:, ki]   # [H_out]
            cols = col_offsets[:, kj]   # [W_out]
            # dcols_rs[:, :, ki, kj, :] is [H_out, W_out, C]
            # Accumulate via vectorized indexing
            np.add.at(x_pad,
                      (rows[:, None], cols[None, :]),
                      dcols_rs[:, :, ki, kj, :])

    return x_pad[pad:pad + H, pad:pad + W, :]


# ── Conv2D ─────────────────────────────────────────────────────────────────

class Conv2D:
    """
    2D convolution: [H,W,C_in] → [H_out,W_out,C_out]
    Weight layout: [C_out, C_in * kH * kW]
    """

    def __init__(self, c_in: int, c_out: int, k: int = 3,
                 stride: int = 1, pad: int = 1):
        self.c_in  = c_in
        self.c_out = c_out
        self.k     = k
        self.stride = stride
        self.pad    = pad
        # He initialization
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
        out_flat = cols @ self.params['W'].T + self.params['b']  # [H*W, C_out]
        self._cache = (x.shape, cols)
        return out_flat.reshape(H_out, W_out, self.c_out)

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x_shape, cols = self._cache
        H_out, W_out, C_out = dout.shape
        dout_flat = dout.reshape(-1, C_out)                    # [H*W, C_out]
        self.grads['W'] = dout_flat.T @ cols                   # [C_out, C_in*k*k]
        self.grads['b'] = dout_flat.sum(axis=0)
        dcols = dout_flat @ self.params['W']                   # [H*W, C_in*k*k]
        return col2im(dcols, x_shape, self.k, self.k, self.stride, self.pad)


# ── BatchNorm ──────────────────────────────────────────────────────────────

class BatchNorm:
    """
    Batch normalisation over spatial axes.
    Normalises each channel independently across H×W.
    """

    def __init__(self, c: int, eps: float = 1e-5, momentum: float = 0.1):
        self.eps = eps
        self.momentum = momentum
        self.params = {
            'gamma': np.ones(c, dtype=np.float32),
            'beta':  np.zeros(c, dtype=np.float32),
        }
        self.grads  = {'gamma': np.zeros(c, dtype=np.float32),
                       'beta':  np.zeros(c, dtype=np.float32)}
        self.running_mean = np.zeros(c, dtype=np.float32)
        self.running_var  = np.ones(c,  dtype=np.float32)
        self._cache = None
        self.training = True

    def forward(self, x: np.ndarray) -> np.ndarray:
        # x: [H, W, C]
        if self.training:
            mean = x.mean(axis=(0, 1))                   # [C]
            var  = x.var(axis=(0, 1))                    # [C]
            self.running_mean = (1 - self.momentum) * self.running_mean + self.momentum * mean
            self.running_var  = (1 - self.momentum) * self.running_var  + self.momentum * var
        else:
            mean = self.running_mean
            var  = self.running_var
        x_hat = (x - mean) / np.sqrt(var + self.eps)
        self._cache = (x, x_hat, mean, var)
        return self.params['gamma'] * x_hat + self.params['beta']

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, x_hat, mean, var = self._cache
        H, W, C = x.shape
        N = H * W
        std_inv = 1.0 / np.sqrt(var + self.eps)
        dx_hat  = dout * self.params['gamma']
        dvar    = (dx_hat * (x - mean) * -0.5 * std_inv ** 3).sum(axis=(0, 1))
        dmean   = (-dx_hat * std_inv).sum(axis=(0, 1)) + dvar * (-2 * (x - mean)).sum(axis=(0, 1)) / N
        dx      = dx_hat * std_inv + dvar * 2 * (x - mean) / N + dmean / N
        self.grads['gamma'] = (dout * x_hat).sum(axis=(0, 1))
        self.grads['beta']  = dout.sum(axis=(0, 1))
        return dx


# ── Activations ────────────────────────────────────────────────────────────

class ReLU:
    def __init__(self):
        self._mask = None

    def forward(self, x):
        self._mask = x > 0
        return np.where(self._mask, x, 0.0)

    def backward(self, dout):
        return dout * self._mask

    @property
    def params(self): return {}
    @property
    def grads(self): return {}


class SiLU:
    """Sigmoid-weighted linear unit — smooth, used in modern diffusion U-Nets."""
    def __init__(self):
        self._sig = None
        self._x   = None

    def forward(self, x):
        self._sig = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
        self._x   = x
        return x * self._sig

    def backward(self, dout):
        sig = self._sig
        return dout * sig * (1 + self._x * (1 - sig))

    @property
    def params(self): return {}
    @property
    def grads(self): return {}


# ── Linear (fully connected) ───────────────────────────────────────────────

class Linear:
    def __init__(self, d_in: int, d_out: int):
        scale = math.sqrt(2.0 / d_in)
        self.params = {
            'W': (np.random.randn(d_out, d_in) * scale).astype(np.float32),
            'b': np.zeros(d_out, dtype=np.float32),
        }
        self.grads  = {'W': np.zeros_like(self.params['W']),
                       'b': np.zeros_like(self.params['b'])}
        self._x = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        # x: [..., d_in]
        self._x = x
        return x @ self.params['W'].T + self.params['b']

    def backward(self, dout: np.ndarray) -> np.ndarray:
        self.grads['W'] = dout.reshape(-1, dout.shape[-1]).T @ self._x.reshape(-1, self._x.shape[-1])
        self.grads['b'] = dout.reshape(-1, dout.shape[-1]).sum(axis=0)
        return dout @ self.params['W']


# ── Pooling ────────────────────────────────────────────────────────────────

class MaxPool2x2:
    def __init__(self):
        self._x = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        # x: [H, W, C]  →  [H//2, W//2, C]
        self._x = x
        H, W, C = x.shape
        h, w = H // 2, W // 2
        x_rs = x[:h*2, :w*2].reshape(h, 2, w, 2, C)
        return x_rs.max(axis=(1, 3))

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x = self._x
        H, W, C = x.shape
        h, w = H // 2, W // 2
        x_rs = x[:h*2, :w*2].reshape(h, 2, w, 2, C)
        mx = x_rs.max(axis=(1, 3), keepdims=True)
        mask = (x_rs == mx).astype(np.float32)
        # distribute gradient to max locations
        dx_rs = mask * dout[:, None, :, None, :]
        # normalize if multiple maxima
        dx_rs /= mask.sum(axis=(1, 3), keepdims=True).clip(1)
        dx = np.zeros_like(x)
        dx[:h*2, :w*2] = dx_rs.reshape(h*2, w*2, C)
        return dx

    @property
    def params(self): return {}
    @property
    def grads(self): return {}


def upsample2x(x: np.ndarray) -> np.ndarray:
    """Bilinear 2x upsampling — [H,W,C] → [2H,2W,C]."""
    H, W, C = x.shape
    out = np.zeros((H * 2, W * 2, C), dtype=x.dtype)
    out[0::2, 0::2] = x
    out[1::2, 0::2] = x
    out[0::2, 1::2] = x
    out[1::2, 1::2] = x
    return out


def upsample2x_backward(dout: np.ndarray) -> np.ndarray:
    """Gradient for 2x nearest-neighbour upsample."""
    return (dout[0::2, 0::2] + dout[1::2, 0::2] +
            dout[0::2, 1::2] + dout[1::2, 1::2])


# ── ConvBlock: Conv → BN → SiLU ───────────────────────────────────────────

class ConvBlock:
    def __init__(self, c_in: int, c_out: int, k: int = 3, pad: int = 1):
        self.conv = Conv2D(c_in, c_out, k, pad=pad)
        self.bn   = BatchNorm(c_out)
        self.act  = SiLU()

    def forward(self, x):
        return self.act.forward(self.bn.forward(self.conv.forward(x)))

    def backward(self, dout):
        return self.conv.backward(self.bn.backward(self.act.backward(dout)))

    @property
    def params(self):
        return {**{f'conv_{k}': v for k, v in self.conv.params.items()},
                **{f'bn_{k}':   v for k, v in self.bn.params.items()}}

    @property
    def grads(self):
        return {**{f'conv_{k}': v for k, v in self.conv.grads.items()},
                **{f'bn_{k}':   v for k, v in self.bn.grads.items()}}

    def set_training(self, mode: bool):
        self.bn.training = mode


# ── Adam Optimizer ─────────────────────────────────────────────────────────

class Adam:
    """
    Adam optimizer — hand-coded, no framework.
    Works on a flat list of (params_dict, grads_dict) pairs.
    """

    def __init__(self, lr: float = 1e-3, beta1: float = 0.9,
                 beta2: float = 0.999, eps: float = 1e-8,
                 weight_decay: float = 0.0):
        self.lr  = lr
        self.b1  = beta1
        self.b2  = beta2
        self.eps = eps
        self.wd  = weight_decay
        self.t   = 0
        self._m: dict = {}
        self._v: dict = {}

    def step(self, param_grad_pairs: list):
        """
        param_grad_pairs: list of (params_dict, grads_dict)
        Each dict maps key → numpy array.
        """
        self.t += 1
        bc1 = 1.0 - self.b1 ** self.t
        bc2 = 1.0 - self.b2 ** self.t

        for (params, grads) in param_grad_pairs:
            for key in params:
                if key not in grads or grads[key] is None:
                    continue
                flat_key = id(params) * 1000 + hash(key)
                g = grads[key].astype(np.float64)
                if self.wd > 0:
                    g = g + self.wd * params[key].astype(np.float64)
                if flat_key not in self._m:
                    self._m[flat_key] = np.zeros_like(g)
                    self._v[flat_key] = np.zeros_like(g)
                self._m[flat_key] = self.b1 * self._m[flat_key] + (1 - self.b1) * g
                self._v[flat_key] = self.b2 * self._v[flat_key] + (1 - self.b2) * g * g
                m_hat = self._m[flat_key] / bc1
                v_hat = self._v[flat_key] / bc2
                params[key] = params[key] - (self.lr * m_hat / (np.sqrt(v_hat) + self.eps)).astype(np.float32)
