"""Correctness tests: SiliconSimtBackend vs. the reference DigitalGPUBackend / NumPy.

``ai_model.maxcore.backend.silicon_simt_backend.SiliconSimtBackend`` (the
from-scratch, RTL-derived lockstep-SIMT engine) is now the DEFAULT backend
behind the ``ai_model.maxcore.api.DigitalGPU`` facade (see that module's
``_DEFAULT_BACKEND``). This suite validates:

  1. Every kernel it implements (gemm/attention/conv2d/mlp/softmax/reduce/
     add/relu) is numerically equivalent to the legacy ``DigitalGPUBackend``
     AND to independent NumPy ground truth, on both small shapes and the
     worst-realistic-case STFT-sized GEMM this backend must serve as the
     live default.
  2. The default-resolution wiring itself: default-unset now resolves to
     ``silicon_simt``, ``MAXCORE_BACKEND=digital_gpu`` still restores the
     legacy engine exactly, and an explicit ``backend=`` argument always
     wins over the environment.

Runnable two ways:
  * pytest:  uv run pytest ai_model/maxcore/tests/test_silicon_simt_backend.py
  * direct:  uv run python ai_model/maxcore/tests/test_silicon_simt_backend.py
"""
from __future__ import annotations

import os
import sys

import numpy as np

# Make the training-server root importable when run directly.
_SERVER_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

from ai_model.maxcore.backend.cpu_backend import DigitalGPUBackend  # noqa: E402
from ai_model.maxcore.backend.silicon_simt_backend import SiliconSimtBackend  # noqa: E402

RTOL = 1e-3
ATOL = 1e-3

_rng = np.random.default_rng(1234)


def _close(a, b, rtol=RTOL, atol=ATOL):
    return np.allclose(a, b, rtol=rtol, atol=atol)


def _ref_softmax(x, axis=-1):
    x = x - np.max(x, axis=axis, keepdims=True)
    e = np.exp(x)
    return e / np.sum(e, axis=axis, keepdims=True)


def _ref_attention(q, k, v, mask=None, causal=False):
    d = q.shape[-1]
    scores = np.matmul(q, np.swapaxes(k, -1, -2)) / np.sqrt(np.float32(d))
    if causal:
        t_q, t_k = scores.shape[-2], scores.shape[-1]
        cm = np.triu(np.full((t_q, t_k), -1e9, dtype=scores.dtype), k=1)
        scores = scores + cm
    if mask is not None:
        scores = scores + mask
    probs = _ref_softmax(scores, axis=-1)
    return np.matmul(probs, v)


def _ref_conv2d(x, w, bias=None, stride=1, padding=0):
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


def _backends():
    dgpu = DigitalGPUBackend()
    sim = SiliconSimtBackend()
    assert sim.is_available(), f"SiliconSimtBackend engine failed to load: {sim.info()}"
    return dgpu, sim


# ── GEMM ──────────────────────────────────────────────────────────────────────
def test_gemm_matches_reference_small():
    dgpu, sim = _backends()
    a = _rng.standard_normal((37, 61), dtype=np.float32)
    b = _rng.standard_normal((61, 29), dtype=np.float32)
    ref = a @ b
    assert _close(dgpu.gemm(a, b).numpy(), ref)
    assert _close(sim.gemm(a, b).numpy(), ref)


def test_gemm_matches_reference_stft_shape():
    """Worst-realistic-case shape this backend must serve as the live default."""
    dgpu, sim = _backends()
    a = _rng.standard_normal((1025, 2048), dtype=np.float32)
    b = _rng.standard_normal((2048, 1300), dtype=np.float32)
    ref = a @ b
    assert _close(dgpu.gemm(a, b).numpy(), ref, rtol=5e-3, atol=5e-3)
    assert _close(sim.gemm(a, b).numpy(), ref, rtol=5e-3, atol=5e-3)


def test_gemm_bias_activation_variants():
    dgpu, sim = _backends()
    a = _rng.standard_normal((16, 24), dtype=np.float32)
    b = _rng.standard_normal((24, 12), dtype=np.float32)
    bias = _rng.standard_normal((12,), dtype=np.float32)
    for act in (None, "relu", "gelu", "silu", "tanh", "sigmoid"):
        out_d = dgpu.gemm(a, b, bias=bias, activation=act).numpy()
        out_s = sim.gemm(a, b, bias=bias, activation=act).numpy()
        assert _close(out_d, out_s), f"digital_gpu vs silicon_simt mismatch for activation={act}"


def test_gemm_batched_and_vector_cases():
    dgpu, sim = _backends()
    # batched [B, M, K] @ [K, N]
    a = _rng.standard_normal((4, 10, 6), dtype=np.float32)
    b = _rng.standard_normal((6, 8), dtype=np.float32)
    assert _close(dgpu.gemm(a, b).numpy(), sim.gemm(a, b).numpy())
    # broadcast batched [B, M, K] @ [B, K, N]
    a2 = _rng.standard_normal((3, 5, 7), dtype=np.float32)
    b2 = _rng.standard_normal((3, 7, 9), dtype=np.float32)
    assert _close(dgpu.gemm(a2, b2).numpy(), sim.gemm(a2, b2).numpy())
    # 1D vector cases
    v = _rng.standard_normal((6,), dtype=np.float32)
    m = _rng.standard_normal((6, 4), dtype=np.float32)
    assert _close(dgpu.gemm(v, m).numpy(), sim.gemm(v, m).numpy())


# ── attention ─────────────────────────────────────────────────────────────────
def test_attention_plain():
    dgpu, sim = _backends()
    q = _rng.standard_normal((2, 5, 8), dtype=np.float32)
    k = _rng.standard_normal((2, 5, 8), dtype=np.float32)
    v = _rng.standard_normal((2, 5, 8), dtype=np.float32)
    ref = _ref_attention(q, k, v)
    assert _close(dgpu.attention(q, k, v).numpy(), ref)
    assert _close(sim.attention(q, k, v).numpy(), ref)


def test_attention_causal():
    dgpu, sim = _backends()
    q = _rng.standard_normal((2, 3, 11, 8), dtype=np.float32)
    k = _rng.standard_normal((2, 3, 11, 8), dtype=np.float32)
    v = _rng.standard_normal((2, 3, 11, 8), dtype=np.float32)
    ref = _ref_attention(q, k, v, causal=True)
    assert _close(dgpu.attention(q, k, v, causal=True).numpy(), ref)
    assert _close(sim.attention(q, k, v, causal=True).numpy(), ref)


def test_attention_masked():
    dgpu, sim = _backends()
    q = _rng.standard_normal((2, 6, 8), dtype=np.float32)
    k = _rng.standard_normal((2, 6, 8), dtype=np.float32)
    v = _rng.standard_normal((2, 6, 8), dtype=np.float32)
    mask = _rng.standard_normal((6, 6), dtype=np.float32) * 0.1
    ref = _ref_attention(q, k, v, mask=mask)
    assert _close(dgpu.attention(q, k, v, mask=mask).numpy(), ref)
    assert _close(sim.attention(q, k, v, mask=mask).numpy(), ref)


# ── conv2d ────────────────────────────────────────────────────────────────────
def test_conv2d_matches_reference():
    dgpu, sim = _backends()
    x = _rng.standard_normal((2, 3, 9, 9), dtype=np.float32)
    w = _rng.standard_normal((4, 3, 3, 3), dtype=np.float32)
    bias = _rng.standard_normal((4,), dtype=np.float32)
    ref = _ref_conv2d(x, w, bias=bias, stride=1, padding=1)
    assert _close(dgpu.conv2d(x, w, bias=bias, stride=1, padding=1).numpy(), ref)
    assert _close(sim.conv2d(x, w, bias=bias, stride=1, padding=1).numpy(), ref)


def test_conv2d_stride2_no_padding():
    dgpu, sim = _backends()
    x = _rng.standard_normal((1, 2, 10, 10), dtype=np.float32)
    w = _rng.standard_normal((3, 2, 3, 3), dtype=np.float32)
    ref = _ref_conv2d(x, w, stride=2, padding=0)
    assert _close(dgpu.conv2d(x, w, stride=2, padding=0).numpy(), ref)
    assert _close(sim.conv2d(x, w, stride=2, padding=0).numpy(), ref)


# ── mlp ───────────────────────────────────────────────────────────────────────
def test_mlp_matches_reference():
    dgpu, sim = _backends()
    x = _rng.standard_normal((10, 16), dtype=np.float32)
    w1 = _rng.standard_normal((16, 32), dtype=np.float32)
    b1 = _rng.standard_normal((32,), dtype=np.float32)
    w2 = _rng.standard_normal((32, 8), dtype=np.float32)
    b2 = _rng.standard_normal((8,), dtype=np.float32)
    h_ref = np.maximum(x @ w1 + b1, 0.0)
    ref = h_ref @ w2 + b2
    assert _close(dgpu.mlp(x, w1, b1, w2, b2).numpy(), ref)
    assert _close(sim.mlp(x, w1, b1, w2, b2).numpy(), ref)


# ── softmax ───────────────────────────────────────────────────────────────────
def test_softmax_matches_reference_multi_axis():
    dgpu, sim = _backends()
    x = _rng.standard_normal((4, 6, 8), dtype=np.float32)
    for axis in (-1, 0, 1, 2):
        ref = _ref_softmax(x, axis=axis)
        assert _close(dgpu.softmax(x, axis=axis).numpy(), ref)
        assert _close(sim.softmax(x, axis=axis).numpy(), ref)


# ── reduce ────────────────────────────────────────────────────────────────────
def test_reduce_all_ops():
    dgpu, sim = _backends()
    x = _rng.uniform(0.1, 2.0, size=(5, 7, 3)).astype(np.float32)
    for op in ("sum", "mean", "max", "min", "prod"):
        for axis in (0, 1, -1):
            for keepdims in (False, True):
                ref = getattr(x, op)(axis=axis, keepdims=keepdims)
                out_d = dgpu.reduce(x, op, axis, keepdims=keepdims).numpy()
                out_s = sim.reduce(x, op, axis, keepdims=keepdims).numpy()
                assert _close(out_d, ref)
                assert _close(out_s, ref)


# ── add / relu ────────────────────────────────────────────────────────────────
def test_add_and_relu():
    dgpu, sim = _backends()
    a = _rng.standard_normal((5, 5), dtype=np.float32)
    b = _rng.standard_normal((5, 5), dtype=np.float32)
    assert _close(dgpu.add(a, b).numpy(), a + b)
    assert _close(sim.add(a, b).numpy(), a + b)
    assert _close(dgpu.relu(a).numpy(), np.maximum(a, 0.0))
    assert _close(sim.relu(a).numpy(), np.maximum(a, 0.0))


# ── default-backend resolution wiring ────────────────────────────────────────
def test_default_backend_resolves_to_silicon_simt():
    from ai_model.maxcore.api import DigitalGPU
    old = os.environ.pop("MAXCORE_BACKEND", None)
    try:
        dg = DigitalGPU()
        assert dg.backend.name == "silicon_simt"
    finally:
        if old is not None:
            os.environ["MAXCORE_BACKEND"] = old


def test_maxcore_backend_env_restores_legacy_engine():
    from ai_model.maxcore.api import DigitalGPU
    old = os.environ.get("MAXCORE_BACKEND")
    os.environ["MAXCORE_BACKEND"] = "digital_gpu"
    try:
        dg = DigitalGPU()
        assert dg.backend.name == "digital_gpu"
    finally:
        if old is None:
            os.environ.pop("MAXCORE_BACKEND", None)
        else:
            os.environ["MAXCORE_BACKEND"] = old


def test_explicit_backend_arg_overrides_env():
    from ai_model.maxcore.api import DigitalGPU
    old = os.environ.get("MAXCORE_BACKEND")
    os.environ["MAXCORE_BACKEND"] = "silicon_simt"
    try:
        dg = DigitalGPU(backend="digital_gpu")
        assert dg.backend.name == "digital_gpu"
    finally:
        if old is None:
            os.environ.pop("MAXCORE_BACKEND", None)
        else:
            os.environ["MAXCORE_BACKEND"] = old


def test_registry_lists_silicon_simt():
    from ai_model.maxcore.backend.registry import available
    assert "silicon_simt" in available()


# ── end-to-end under the live default ────────────────────────────────────────
def test_end_to_end_mlp_under_default_backend():
    """Mirrors a real caller: construct DigitalGPU() with no explicit backend
    (the default-unset path every confirmed call site uses) and run an op
    end to end through the facade."""
    from ai_model.maxcore.api import DigitalGPU
    old = os.environ.pop("MAXCORE_BACKEND", None)
    try:
        dg = DigitalGPU()
        x = _rng.standard_normal((8, 16), dtype=np.float32)
        w1 = _rng.standard_normal((16, 32), dtype=np.float32)
        b1 = _rng.standard_normal((32,), dtype=np.float32)
        w2 = _rng.standard_normal((32, 4), dtype=np.float32)
        b2 = _rng.standard_normal((4,), dtype=np.float32)
        out = dg.mlp(x, w1, b1, w2, b2).numpy()
        h_ref = np.maximum(x @ w1 + b1, 0.0)
        ref = h_ref @ w2 + b2
        assert _close(out, ref)
    finally:
        if old is not None:
            os.environ["MAXCORE_BACKEND"] = old


if __name__ == "__main__":
    import traceback

    tests = [(name, fn) for name, fn in list(globals().items())
              if name.startswith("test_") and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    if failed:
        sys.exit(1)
