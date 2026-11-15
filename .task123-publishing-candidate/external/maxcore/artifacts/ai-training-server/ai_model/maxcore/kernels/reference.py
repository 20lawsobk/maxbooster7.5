"""Naive reference kernels -- the correctness ground truth every optimized
kernel in this project is checked against, and the "before" side of every
honest speed comparison in the benchmark harness.

These were previously private, duplicated-by-copy-paste helpers living
inside a single test file. They are promoted here as the one source of
truth so the correctness suite (``tests/test_silicon_simt_backend.py``) and
the benchmark harness (``tests/benchmark_gpu_native.py``) import the exact
same definitions instead of two copies silently drifting apart.

``reference_gemm`` is deliberately a pure-Python triple-nested loop -- not
"call NumPy again with different code", which would just benchmark BLAS
against itself. This is the actual "first prototype" style of
implementation ``silicon_simt_engine.py``'s own docstring describes having
moved past (one scalar operation issued at a time, no vectorization, no
tiling). Because it is O(M*K*N) in pure Python, it is only ever run on small
shapes -- at production shapes it would take minutes to hours, which is the
entire point of the comparison: it demonstrates *why* the tiled, lockstep-
SIMT engine is the default execution path, not just asserts that it is.
"""
from __future__ import annotations

import numpy as np


def reference_softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    x = x - np.max(x, axis=axis, keepdims=True)
    e = np.exp(x)
    return e / np.sum(e, axis=axis, keepdims=True)


def reference_attention(q: np.ndarray, k: np.ndarray, v: np.ndarray,
                         mask: np.ndarray | None = None, causal: bool = False) -> np.ndarray:
    d = q.shape[-1]
    scores = np.matmul(q, np.swapaxes(k, -1, -2)) / np.sqrt(np.float32(d))
    if causal:
        t_q, t_k = scores.shape[-2], scores.shape[-1]
        cm = np.triu(np.full((t_q, t_k), -1e9, dtype=scores.dtype), k=1)
        scores = scores + cm
    if mask is not None:
        scores = scores + mask
    probs = reference_softmax(scores, axis=-1)
    return np.matmul(probs, v)


def reference_conv2d(x: np.ndarray, w: np.ndarray, bias: np.ndarray | None = None,
                      stride: int = 1, padding: int = 0) -> np.ndarray:
    n, c, h, ww = x.shape
    o, cw, kh, kw = w.shape
    s, p = stride, padding
    if p > 0:
        x = np.pad(x, ((0, 0), (0, 0), (p, p), (p, p)))
    hp, wp = x.shape[2], x.shape[3]
    ho = (hp - kh) // s + 1
    wo = (wp - kw) // s + 1
    out = np.zeros((n, o, ho, wo), dtype=np.float32)
    for ni in range(n):
        for oi in range(o):
            for i in range(ho):
                for j in range(wo):
                    patch = x[ni, :, i * s:i * s + kh, j * s:j * s + kw]
                    out[ni, oi, i, j] = np.sum(patch * w[oi])
    if bias is not None:
        out = out + bias.reshape(1, o, 1, 1)
    return out


def reference_gemm(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Naive scalar triple-loop GEMM: ``out[i, j] = sum_k a[i, k] * b[k, j]``.
    2D only, no batching/broadcast -- intentionally the simplest possible
    correct implementation. Only ever call this on small shapes (a few dozen
    rows/cols); it is O(M*K*N) pure-Python and is not meant to scale."""
    if a.ndim != 2 or b.ndim != 2:
        raise ValueError("reference_gemm: 2D inputs only")
    m, k = a.shape
    k2, n = b.shape
    if k != k2:
        raise ValueError(f"reference_gemm: inner dims must match ({k} != {k2})")
    out = np.zeros((m, n), dtype=np.float32)
    for i in range(m):
        for j in range(n):
            acc = 0.0
            for kk in range(k):
                acc += float(a[i, kk]) * float(b[kk, j])
            out[i, j] = acc
    return out
