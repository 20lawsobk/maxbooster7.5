"""
MaxCore DigitalGPU — LocalGPUBackend (auto-detecting dispatcher)

Selects the best available Phase 2 backend at runtime:
  1. NumbaBackend   — Numba JIT parallel (available, preferred)
  2. LocalCPUBackend — NumPy/OpenBLAS fallback

Future slots (Phase 2+):
  3. CuPyBackend    — CUDA via CuPy (when CUDA GPU available)
  4. TritonBackend  — Triton-compiled CUDA kernels (peak performance)
  5. WebGLBackend   — Browser GPU via WebGL2 (client-side inference)

The backend API is identical across all implementations.
DigitalGPU.set_backend() can hot-swap at any time.
"""

import numpy as np

try:
    from .numba_backend import NumbaBackend
    _NUMBA_BACKEND = NumbaBackend(warmup=False)
    _NUMBA_OK = True
except Exception as e:
    _NUMBA_BACKEND = None
    _NUMBA_OK = False

try:
    from .cpu_backend import LocalCPUBackend
    _CPU_BACKEND = LocalCPUBackend()
    _CPU_OK = True
except Exception:
    _CPU_OK = False


class LocalGPUBackend:
    """
    Phase 2 auto-detecting dispatcher.

    Priority order: Numba JIT → NumPy/OpenBLAS
    Exposes the same interface as LocalCPUBackend — drop-in replacement.
    """

    def __init__(self):
        if _NUMBA_OK:
            self._impl = _NUMBA_BACKEND
            self._impl_name = "Numba-JIT"
        elif _CPU_OK:
            self._impl = _CPU_BACKEND
            self._impl_name = "NumPy-OpenBLAS"
        else:
            raise RuntimeError("No compute backend available")

        self.name = f"LocalGPUBackend[{self._impl_name}]"

    @property
    def implementation(self):
        return self._impl_name

    def gemm(self, A, B, bias=None, dtype=np.float32):
        return self._impl.gemm(A, B, bias=bias, dtype=dtype)

    def fused_linear_silu(self, A, W, bias):
        """Fused Linear + SiLU — only NumbaBackend has true fusion."""
        if hasattr(self._impl, 'fused_linear_silu'):
            return self._impl.fused_linear_silu(A, W, bias)
        out = self._impl.gemm(A, W.T, bias=bias)
        return self._impl.act(out, kind='silu')

    def attention(self, Q, K, V, scale, mask=None, dtype=np.float32):
        return self._impl.attention(Q, K, V, scale=scale, mask=mask, dtype=dtype)

    def conv2d_im2col(self, cols, W, bias=None, dtype=np.float32,
                      fuse_act=None):
        if hasattr(self._impl, 'conv2d_im2col'):
            return self._impl.conv2d_im2col(cols, W, bias=bias, dtype=dtype,
                                             fuse_act=fuse_act)
        out = self._impl.gemm(cols, W.T, bias=bias, dtype=dtype)
        if fuse_act:
            out = self._impl.act(out, kind=fuse_act)
        return out

    def reduce(self, x, op='sum', axis=-1, keepdims=False, dtype=np.float32):
        return self._impl.reduce(x, op=op, axis=axis, keepdims=keepdims, dtype=dtype)

    def softmax(self, x, axis=-1, dtype=np.float32):
        return self._impl.softmax(x, axis=axis, dtype=dtype)

    def act(self, x, kind='silu', dtype=np.float32):
        return self._impl.act(x, kind=kind, dtype=dtype)

    def layer_norm(self, x, gamma, beta, axis=-1, eps=1e-5, dtype=np.float32):
        return self._impl.layer_norm(x, gamma, beta, axis=axis, eps=eps, dtype=dtype)

    def element_add(self, A, B, dtype=np.float32):
        return self._impl.element_add(A, B, dtype=dtype)

    def element_mul(self, A, B, dtype=np.float32):
        return self._impl.element_mul(A, B, dtype=dtype)

    def upsample2x(self, x):
        return self._impl.upsample2x(x)

    def pool2x(self, x):
        return self._impl.pool2x(x)

    @staticmethod
    def flops_gemm(M, N, K): return 2 * M * N * K
    @staticmethod
    def flops_attention(N, h, d): return 4 * h * N * N * d + 5 * h * N * N
    @staticmethod
    def bytes_gemm(M, N, K, itemsize=4):
        return (M*K + K*N) * itemsize, M*N*itemsize


def get_best_backend():
    """Return the fastest available backend instance."""
    try:
        return LocalGPUBackend()
    except Exception:
        from .cpu_backend import LocalCPUBackend
        return LocalCPUBackend()
