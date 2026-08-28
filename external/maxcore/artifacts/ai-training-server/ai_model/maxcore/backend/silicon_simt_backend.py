"""SiliconSimt backend — the digital GPU's own from-scratch SIMT engine.

This backend adapts ``ai_model/gpu/silicon_simt_engine.py`` (a genuinely
executing, lockstep-SIMT-with-predication software model of this project's own
synthesized RTL, see that module's docstring for the full architectural
rationale) to the ``Backend`` ABC, so it is a fully interchangeable drop-in
next to ``DigitalGPUBackend``.

  * ``gemm`` / ``mlp`` / ``conv2d``  -> tiled lockstep multiply-accumulate
    (``SiliconSimtEngine.gemm``), folded across arbitrary batch rank.
  * ``attention``                    -> engine-served QK^T / probs@V matmuls;
    ``causal=True`` uses genuine per-position *predicated exclusion*
    (``SiliconSimtEngine.masked_reduce``) for the softmax's max/sum instead
    of the industry-standard additive ``-1e9`` bias every other backend in
    this codebase (including ``DigitalGPUBackend``) uses. An arbitrary
    additive ``mask`` (e.g. an ALiBi-style bias, which is not binary) is still
    applied the conventional additive way, since collapsing a real-valued
    bias into a binary predicate would silently discard information a caller
    may depend on; causal exclusion is exactly and losslessly binary by
    definition, so it is the one place predication is unambiguously correct.
  * ``softmax`` (standalone, unmasked)-> plain numerically-stable NumPy,
    matching how ``DigitalGPUBackend`` scopes its own thin elementwise ops.
  * ``add`` / ``relu`` / ``reduce``  -> first-class vectorized NumPy — the
    engine exposes no kernel for these (same scoping decision
    ``DigitalGPUBackend`` makes; there is no hardware reason to route a plain
    elementwise op through a tiled-GEMM engine).

No silent numpy fallback on engine failure: unlike ``DigitalGPUBackend``
(which defends an existing, more complex legacy engine with a counted
fallback), an exception out of ``SiliconSimtEngine`` here is a real bug in
freshly-written code, not an expected hardware-absence case — it is allowed
to propagate rather than being swallowed into a quieter numpy path.

Performance note (why tiling, not a scalar-per-cycle interpreter, is the
right granularity): a first prototype issued one lockstep cycle per scalar
multiply-accumulate step, gathering each lane's row/column with fancy
indexing. It was numerically correct but took ~18.8s for a realistic
1025x2048 @ 2048x1300 STFT-shaped GEMM (vs ~0.02s for `np.matmul`). Switching
to contiguous tiling with a bounded per-tile FMA (see the engine module's
docstring for why that bounded call is architecturally honest) brought the
same shape down to ~0.02-0.05s -- this is what makes running as this
process's *default* compute path realistic rather than a toy.
"""
from __future__ import annotations

import importlib.util
import os

import numpy as np

from ..observability import METRICS
from ..tensor import Tensor, to_numpy
from .base import Backend
from .cpu_backend import _activate, _stable_softmax

# ── pocket accelerator (lazy: avoids import cycles at package load) ───────────
# Same dedup cache DigitalGPUBackend.gemm() uses -- kept lazy/module-level here
# too so identical GEMMs are deduped regardless of which backend serves them.
_POCKET_ACCEL = None


def _pocket_accel():
    global _POCKET_ACCEL
    if _POCKET_ACCEL is None:
        from ..pdim.pocket_accelerator import get_pocket_accelerator
        _POCKET_ACCEL = get_pocket_accelerator()
    return _POCKET_ACCEL

# ── Load the engine in isolation (no torch, no ai_model.gpu package __init__) ─
_Engine = None
_ENGINE_LOAD_ERROR = None
try:
    _engine_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "gpu", "silicon_simt_engine.py")
    )
    _spec = importlib.util.spec_from_file_location("_maxcore_engine_silicon_simt", _engine_path)
    if _spec and _spec.loader:
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        _Engine = getattr(_mod, "SiliconSimtEngine", None)
except Exception as exc:  # pragma: no cover
    _ENGINE_LOAD_ERROR = repr(exc)
    _Engine = None


class SiliconSimtBackend(Backend):
    """The digital GPU's own from-scratch lockstep-SIMT backend."""

    name = "silicon_simt"

    def __init__(self, lanes: int = 8, m_tile: int | None = None, k_tile: int | None = None,
                 reduce_tile: int | None = None):
        # Any tile size left unspecified is filled in from the resource plan,
        # sized to *this process's own* effective BLAS thread count (not a
        # raw host CPU count -- correct whether this backend is constructed
        # in the single-stream coordinator process or inside a LaneProcessPool
        # worker that only owns a share of the host). On this project's
        # ~4-thread development host this reproduces the exact long-standing
        # defaults (256 / 512 / 128); see resource_plan.gemm_tile_hint.
        if m_tile is None or k_tile is None or reduce_tile is None:
            from ..resource_plan import effective_blas_threads, gemm_tile_hint
            hint = gemm_tile_hint(effective_blas_threads())
            if m_tile is None:
                m_tile = hint.m_tile
            if k_tile is None:
                k_tile = hint.k_tile
            if reduce_tile is None:
                reduce_tile = hint.reduce_tile
        self.engine = (
            _Engine(lanes=lanes, m_tile=m_tile, k_tile=k_tile, reduce_tile=reduce_tile)
            if _Engine is not None else None
        )

    def is_available(self) -> bool:
        return self.engine is not None

    def info(self) -> dict:
        out = {
            "name": self.name,
            "available": self.is_available(),
            "engine_load_error": _ENGINE_LOAD_ERROR,
        }
        if self.engine is not None:
            out.update(self.engine.stats())
        return out

    def create_tensor(self, data, dtype: str = "float32"):
        return Tensor(data, dtype=dtype, device="silicon_simt")

    def _require_engine(self):
        if self.engine is None:
            raise RuntimeError(
                f"SiliconSimtBackend: engine failed to load ({_ENGINE_LOAD_ERROR})"
            )
        return self.engine

    # ── matmul of any rank, every 2D sub-product routed through the engine ────
    def _engine_matmul(self, A: np.ndarray, B: np.ndarray) -> np.ndarray:
        engine = self._require_engine()
        a1, b1 = A.ndim == 1, B.ndim == 1
        if a1:
            A = A[None, :]
        if b1:
            B = B[:, None]
        if A.ndim == 2 and B.ndim == 2:
            out = engine.gemm(A, B)
        elif B.ndim == 2:                                    # [..., M, K] @ [K, N]
            k = A.shape[-1]
            out = engine.gemm(A.reshape(-1, k), B).reshape(*A.shape[:-1], B.shape[1])
        else:                                                # batched (broadcast)
            if A.ndim == 2:
                A = np.broadcast_to(A, tuple(B.shape[:-2]) + A.shape)
            m, k = A.shape[-2], A.shape[-1]
            k2, n = B.shape[-2], B.shape[-1]
            batch = np.broadcast_shapes(A.shape[:-2], B.shape[:-2])
            Ab = np.broadcast_to(A, batch + (m, k)).reshape(-1, m, k)
            Bb = np.broadcast_to(B, batch + (k2, n)).reshape(-1, k2, n)
            out = np.stack([engine.gemm(Ab[i], Bb[i]) for i in range(Ab.shape[0])])
            out = out.reshape(batch + (m, n))
        if a1:
            out = np.squeeze(out, axis=-2)
        if b1:
            out = np.squeeze(out, axis=-1)
        return out

    # ── GEMM ────────────────────────────────────────────────────────────────
    def gemm(self, a, b, bias=None, activation=None):
        A = to_numpy(a).astype(np.float32, copy=False)
        B = to_numpy(b).astype(np.float32, copy=False)
        bias_np = None if bias is None else to_numpy(bias).astype(np.float32, copy=False)

        def _compute() -> np.ndarray:
            with METRICS.timer("silicon_simt.gemm"):
                out = self._engine_matmul(A, B)
                if bias_np is not None:
                    out = out + bias_np
                out = _activate(out, activation)
            METRICS.incr("silicon_simt.gemm")
            return out

        flops = 2.0 * float(A.size) * float(B.shape[-1])
        operands = (A, B) if bias_np is None else (A, B, bias_np)
        out, _src = _pocket_accel().accelerate(
            "gemm", operands, flops, _compute, extra_key=f"|act={activation}")
        return Tensor(out, dtype=None)

    def add(self, a, b):
        return Tensor(to_numpy(a) + to_numpy(b), dtype=None)

    def relu(self, x):
        return Tensor(np.maximum(to_numpy(x), 0.0), dtype=None)

    def softmax(self, x, axis: int = -1):
        X = to_numpy(x).astype(np.float32, copy=False)
        with METRICS.timer("silicon_simt.softmax"):
            out = _stable_softmax(X, axis=axis)
        METRICS.incr("silicon_simt.softmax")
        return Tensor(out, dtype=None)

    # ── attention: engine-served matmuls; genuine predicated causal exclusion ─
    def attention(self, q, k, v, mask=None, causal: bool = False):
        engine = self._require_engine()
        Q = to_numpy(q).astype(np.float32, copy=False)
        K = to_numpy(k).astype(np.float32, copy=False)
        V = to_numpy(v).astype(np.float32, copy=False)
        with METRICS.timer("silicon_simt.attention"):
            d = Q.shape[-1]
            scores = self._engine_matmul(Q, np.swapaxes(K, -1, -2)) / np.sqrt(np.float32(d))
            if mask is not None:
                # Arbitrary real-valued bias (e.g. ALiBi) -- applied additively
                # because collapsing a non-binary bias into a predicate would
                # silently discard information some callers rely on.
                scores = scores + to_numpy(mask).astype(np.float32)
            if causal:
                t_q, t_k = scores.shape[-2], scores.shape[-1]
                # Genuine predicated exclusion: future positions are removed
                # from the max/sum lockstep scan entirely (via masked_reduce's
                # identity-element substitution), not biased with a large
                # negative additive constant. Exclusion is exactly binary
                # here, so predication is lossless -- see module docstring.
                active = np.arange(t_k)[None, :] <= np.arange(t_q)[:, None]
                row_max = engine.masked_reduce(scores, axis=-1, active=active, op="max")
                shifted = scores - row_max[..., None]
                exp = np.where(active, np.exp(shifted), 0.0)
                row_sum = engine.masked_reduce(exp, axis=-1, active=active, op="sum")
                probs = exp / row_sum[..., None]
            else:
                probs = _stable_softmax(scores, axis=-1)
            out = self._engine_matmul(probs, V)
        METRICS.incr("silicon_simt.attention")
        return Tensor(out, dtype=None)

    # ── conv2d: im2col + engine GEMM ──────────────────────────────────────────
    def conv2d(self, x, w, bias=None, stride: int = 1, padding: int = 0):
        X = to_numpy(x).astype(np.float32, copy=False)
        W = to_numpy(w).astype(np.float32, copy=False)
        if X.ndim != 4 or W.ndim != 4:
            raise ValueError("conv2d expects X[N,C,H,W] and W[O,C,kh,kw]")
        n, c, h, ww = X.shape
        o, cw, kh, kw = W.shape
        if cw != c:
            raise ValueError(f"conv2d channel mismatch: input C={c} vs weight C={cw}")
        s, p = stride, padding
        with METRICS.timer("silicon_simt.conv2d"):
            if p > 0:
                X = np.pad(X, ((0, 0), (0, 0), (p, p), (p, p)))
            hp, wp = X.shape[2], X.shape[3]
            ho = (hp - kh) // s + 1
            wo = (wp - kw) // s + 1
            cols = np.empty((n, c, kh, kw, ho, wo), dtype=np.float32)
            for i in range(kh):
                i_max = i + s * ho
                for j in range(kw):
                    j_max = j + s * wo
                    cols[:, :, i, j, :, :] = X[:, :, i:i_max:s, j:j_max:s]
            k_dim = c * kh * kw
            cols2 = cols.reshape(n, k_dim, ho * wo).transpose(1, 0, 2).reshape(k_dim, n * ho * wo)
            wm = W.reshape(o, k_dim)
            gemm_out = self.gemm(wm, cols2).numpy()  # [O, N*P], engine-routed
            out = gemm_out.reshape(o, n, ho, wo).transpose(1, 0, 2, 3)
            if bias is not None:
                out = out + to_numpy(bias).reshape(1, o, 1, 1)
        METRICS.incr("silicon_simt.conv2d")
        return Tensor(np.ascontiguousarray(out), dtype=None)

    # ── mlp: two engine GEMMs (first layer's activation fully fused) ──────────
    def mlp(self, x, w1, b1, w2, b2, activation: str = "relu"):
        h = self.gemm(x, w1, bias=b1, activation=activation)
        out = self.gemm(h, w2, bias=b2)
        METRICS.incr("silicon_simt.mlp")
        return out

    def reduce(self, x, op: str, axis, keepdims: bool = False):
        X = to_numpy(x)
        with METRICS.timer("silicon_simt.reduce"):
            if op == "sum":
                out = X.sum(axis=axis, keepdims=keepdims)
            elif op == "mean":
                out = X.mean(axis=axis, keepdims=keepdims)
            elif op == "max":
                out = X.max(axis=axis, keepdims=keepdims)
            elif op == "min":
                out = X.min(axis=axis, keepdims=keepdims)
            elif op == "prod":
                out = X.prod(axis=axis, keepdims=keepdims)
            else:
                raise ValueError(f"unsupported reduce op '{op}'")
        return Tensor(out, dtype=None)
