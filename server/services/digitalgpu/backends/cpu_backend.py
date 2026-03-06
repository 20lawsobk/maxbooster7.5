"""
MaxCore DigitalGPU — LocalCPUBackend

Implements all maxcore.* ops using NumPy + OpenBLAS.
Exploits AVX-512 (confirmed available) through NumPy's vectorized
operations — every matmul goes through OpenBLAS SGEMM automatically.

Backend contract: every method is pure (no side effects) and
returns a new np.ndarray. The profiler is called by the DigitalGPU
layer above, not here, keeping this module clean.
"""

import math
import numpy as np


class LocalCPUBackend:
    """
    Phase 1 backend: NumPy + OpenBLAS on x86_64 with AVX-512.

    All ops are bit-reproducible (same dtype, same input → same output).
    Determinism is guaranteed by default — no hidden non-determinism
    from threading since NumPy's BLAS calls are deterministic for
    fixed inputs on the same machine.
    """

    name = "LocalCPUBackend"

    def gemm(self, A: np.ndarray, B: np.ndarray,
             bias: np.ndarray = None,
             dtype: np.dtype = np.float32) -> np.ndarray:
        """
        General Matrix Multiplication: C = A @ B [+ bias]

        A: [..., M, K]
        B: [K, N]  (already transposed if needed by caller)
        bias: [N] or None
        """
        A = A.astype(dtype, copy=False)
        B = B.astype(dtype, copy=False)
        out = A @ B
        if bias is not None:
            out = out + bias.astype(dtype, copy=False)
        return out

    def attention(self, Q: np.ndarray, K: np.ndarray, V: np.ndarray,
                  scale: float, mask: np.ndarray = None,
                  dtype: np.dtype = np.float32) -> np.ndarray:
        """
        Fused scaled dot-product attention: softmax(QK^T / scale) @ V

        Q: [N, h, d]  (sequence, heads, head_dim)
        K: [N, h, d]
        V: [N, h, d]
        scale: typically 1/sqrt(d)

        Returns: [N, h, d]

        This is the TATTN instruction in the MaxCore ISA.
        """
        Q = Q.astype(dtype, copy=False)
        K = K.astype(dtype, copy=False)
        V = V.astype(dtype, copy=False)

        # attn_logits: [h, N, N]
        attn_logits = np.einsum('nhd,mhd->hnm', Q, K, optimize='optimal') * scale

        if mask is not None:
            attn_logits = attn_logits + mask

        # Numerically stable softmax per head per query position
        attn_logits -= attn_logits.max(axis=-1, keepdims=True)
        attn_weights = np.exp(attn_logits)
        attn_weights /= (attn_weights.sum(axis=-1, keepdims=True) + 1e-9)

        # Weighted sum of values: [N, h, d]
        out = np.einsum('hnm,mhd->nhd', attn_weights, V, optimize='optimal')
        return out, attn_weights

    def conv2d_im2col(self, cols: np.ndarray, W: np.ndarray,
                      bias: np.ndarray = None,
                      dtype: np.dtype = np.float32) -> np.ndarray:
        """
        Convolution via im2col + GEMM (TCONV in MaxCore ISA).

        cols: [H_out*W_out, kH*kW*C_in]  — pre-computed by im2col
        W:    [C_out, kH*kW*C_in]
        Returns: [H_out*W_out, C_out]
        """
        return self.gemm(cols, W.T, bias=bias, dtype=dtype)

    def reduce(self, x: np.ndarray, op: str = 'sum',
               axis: int = -1, keepdims: bool = False,
               dtype: np.dtype = np.float32) -> np.ndarray:
        """
        Deterministic reduction (REDUCE in MaxCore ISA).

        op: 'sum' | 'max' | 'mean' | 'min'
        Deterministic: NumPy's reductions on float32 are order-stable.
        """
        x = x.astype(dtype, copy=False)
        if op == 'sum':
            return x.sum(axis=axis, keepdims=keepdims)
        elif op == 'max':
            return x.max(axis=axis, keepdims=keepdims)
        elif op == 'mean':
            return x.mean(axis=axis, keepdims=keepdims)
        elif op == 'min':
            return x.min(axis=axis, keepdims=keepdims)
        else:
            raise ValueError(f"Unknown reduction op: {op}")

    def softmax(self, x: np.ndarray, axis: int = -1,
                dtype: np.dtype = np.float32) -> np.ndarray:
        """
        Numerically stable softmax.
        Subtracts max before exp to prevent overflow.
        """
        x = x.astype(dtype, copy=False)
        x = x - x.max(axis=axis, keepdims=True)
        ex = np.exp(x)
        return ex / (ex.sum(axis=axis, keepdims=True) + 1e-9)

    def act(self, x: np.ndarray, kind: str = 'silu',
            dtype: np.dtype = np.float32) -> np.ndarray:
        """
        Fused activation (ACT in MaxCore ISA).
        kind: 'silu' | 'gelu' | 'relu'
        """
        x = x.astype(dtype, copy=False)
        if kind == 'silu':
            sig = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
            return x * sig
        elif kind == 'relu':
            return np.maximum(x, 0.0)
        elif kind == 'gelu':
            # Gaussian Error Linear Unit (approximate)
            return x * 0.5 * (1.0 + np.tanh(
                0.7978845608 * (x + 0.044715 * x ** 3)))
        else:
            raise ValueError(f"Unknown activation: {kind}")

    def layer_norm(self, x: np.ndarray, gamma: np.ndarray,
                   beta: np.ndarray, axis: int = -1,
                   eps: float = 1e-5,
                   dtype: np.dtype = np.float32) -> np.ndarray:
        """Layer normalization."""
        x = x.astype(dtype, copy=False)
        mean = x.mean(axis=axis, keepdims=True)
        var  = x.var(axis=axis, keepdims=True)
        x_hat = (x - mean) / np.sqrt(var + eps)
        return gamma * x_hat + beta

    def element_add(self, A: np.ndarray, B: np.ndarray,
                    dtype: np.dtype = np.float32) -> np.ndarray:
        return (A + B).astype(dtype, copy=False)

    def element_mul(self, A: np.ndarray, B: np.ndarray,
                    dtype: np.dtype = np.float32) -> np.ndarray:
        return (A * B).astype(dtype, copy=False)

    def upsample2x(self, x: np.ndarray) -> np.ndarray:
        """Nearest-neighbor 2× upsample: [H, W, C] → [H*2, W*2, C]."""
        H, W, C = x.shape
        out = np.empty((H * 2, W * 2, C), dtype=x.dtype)
        out[0::2, 0::2] = x
        out[1::2, 0::2] = x
        out[0::2, 1::2] = x
        out[1::2, 1::2] = x
        return out

    def pool2x(self, x: np.ndarray) -> np.ndarray:
        """Max pooling 2×2: [H, W, C] → [H/2, W/2, C]."""
        H, W, C = x.shape
        h, w = H // 2, W // 2
        return x[:h * 2, :w * 2].reshape(h, 2, w, 2, C).max(axis=(1, 3))

    @staticmethod
    def flops_gemm(M: int, N: int, K: int) -> int:
        """FLOPs for M×K @ K×N matmul: 2*M*N*K (multiply + add per element)."""
        return 2 * M * N * K

    @staticmethod
    def flops_attention(N: int, h: int, d: int) -> int:
        """
        FLOPs for multi-head attention with N tokens, h heads, d head_dim.
        QK^T: 2*h*N*N*d
        softmax: ~5*h*N*N  (exp + sum + div — approximate)
        @V:     2*h*N*N*d
        """
        return 4 * h * N * N * d + 5 * h * N * N

    @staticmethod
    def bytes_gemm(M: int, N: int, K: int,
                   itemsize: int = 4) -> tuple:
        """Memory traffic for M×K @ K×N: returns (bytes_in, bytes_out)."""
        return (M * K + K * N) * itemsize, M * N * itemsize
