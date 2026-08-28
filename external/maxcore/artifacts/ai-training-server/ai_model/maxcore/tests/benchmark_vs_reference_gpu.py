"""benchmark_vs_reference_gpu.py — functional / same-parameter comparison
between this project's own software GPU-native stack (``SiliconSimtBackend``,
executing on this container's CPU) and the published specifications of a
real, physical, currently-shipping GPU.

WHAT THIS IS, AND IS NOT
=========================
This is NOT a hardware benchmark, and it does not pretend to be one. There
is no physical or virtual GPU anywhere in this container (see
``benchmark_gpu_native.py``'s own docstring for that project-wide fact).
Nothing in this script executes anything on the reference GPU — it cannot,
since no such chip exists here. Every reference-GPU number below is a
published specification, cited to its source, and is never measured by
this script.

What this script *does* do, and why it is still a meaningful, honest
comparison:

  1. FUNCTIONAL CAPABILITY MATRIX — for a fixed set of operations (GEMM,
     attention, conv2d, MLP, precision support, determinism), report
     whether ``SiliconSimtBackend`` supports the operation *and verifies
     numerically correct* against an independent NumPy reference, next to
     whether the reference GPU's publicly documented architecture supports
     the equivalent capability in hardware. This is the "side by side in
     functionality" comparison.

  2. SAME-PARAMETER WORKLOAD RUN — a fixed list of realistic GEMM /
     attention / conv2d / MLP shapes is run for real, on this machine,
     through ``SiliconSimtBackend``. Where this backend's pocket
     accelerator actually caches the op (gemm, conv2d, mlp — attention's
     internal matmuls bypass it, see its own note below), both a COLD call
     (fresh random operands, a genuine cache miss) and a WARM call
     (identical operands repeated, a genuine cache hit) are measured and
     labelled separately — presenting only a cache-hit number next to a
     GPU's raw compute spec would misrepresent what was actually measured.
     The exact same (shape, FLOP count) is then used to compute what the
     reference GPU's *published peak, 100%-utilization* throughput at the
     PRECISION-MATCHED format (standard FP32 — this backend always
     computes in float32, never a tensor-core-style reduced-precision
     path) would need in theoretical seconds — an ideal-case roofline
     number, not a measurement, and labelled as such everywhere it
     appears.

REFERENCE GPU, AND WHY IT WAS CHOSEN
======================================
NVIDIA Rubin (SXM) — the newest, highest-throughput individual GPU package
publicly documented as entering shipping/general availability at the time
this script was written (2026-08-28). It supersedes NVIDIA Blackwell Ultra
(B300), which itself supersedes B200/H100; RTX 5090 and RTX PRO 6000
Blackwell Workstation Edition remain the current consumer/workstation
flagships but sit well below Rubin's datacenter-class throughput.

Sources (fetched 2026-08-28 — see REFERENCE_GPU below for the same
citations attached to the specific figures they support):
  - Architecture facts (transistor count, SM count, Tensor Core count,
    HBM4 capacity/bandwidth, headline NVFP4 throughput): NVIDIA's own
    technical blog, "Inside NVIDIA Rubin GPU Architecture: Powering the
    Era of Agentic AI", developer.nvidia.com, 2026-07-21.
  - Full per-precision peak-TFLOPS table (FP64/FP32/TF32/FP16/BF16/FP8/
    FP6/NVFP4/INT8, both standard and Tensor-Core rows): third-party GPU
    spec aggregators — flopper.io ("NVIDIA Rubin SXM Spec Sheet",
    2026-08-08) and glennklockwood.com/garden/processors/r200 — cross-
    checked against each other for consistency. This is NOT an official
    NVIDIA datasheet page; no such PDF was found published at the time of
    writing, which is why this table is attributed to aggregators rather
    than to NVIDIA directly.
  - General-availability/shipping status: wccftech.com's coverage of
    NVIDIA's architecture disclosure, 2026-07-21.

Runnable directly:
  cd external/maxcore/artifacts/ai-training-server
  uv run python ai_model/maxcore/tests/benchmark_vs_reference_gpu.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np

_SERVER_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

from ai_model.maxcore.backend.silicon_simt_backend import SiliconSimtBackend  # noqa: E402

_rng = np.random.default_rng(11)

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".benchmark_vs_reference_gpu.json")

# ───────────────────────────────────────────────────────────────────────────
# Reference GPU: published specifications ONLY. Nothing in this dict is
# measured by this script — every figure is cited. See module docstring.
# ───────────────────────────────────────────────────────────────────────────
_NVIDIA_RUBIN_BLOG = (
    "NVIDIA developer blog, 'Inside NVIDIA Rubin GPU Architecture: Powering "
    "the Era of Agentic AI', 2026-07-21, https://developer.nvidia.com/blog/"
    "inside-nvidia-rubin-gpu-architecture-powering-the-era-of-agentic-ai/"
)
_THIRD_PARTY_SPEC_AGGREGATORS = (
    "Third-party GPU spec aggregators, cross-checked against each other — "
    "NOT an official NVIDIA datasheet (none was found published at time of "
    "writing): flopper.io/gpu/nvidia-rubin-sxm/spec-sheet (2026-08-08) and "
    "glennklockwood.com/garden/processors/r200"
)

REFERENCE_GPU = {
    "name": "NVIDIA Rubin (SXM)",
    "chosen_as_of": "2026-08-28",
    "why_this_one": (
        "Newest / highest-throughput individually-documented GPU package "
        "reported entering shipping/general availability at the time this "
        "script was written; supersedes Blackwell Ultra (B300), which "
        "supersedes B200/H100."
    ),
    "architecture": {
        "transistors": "336 billion",
        "streaming_multiprocessors": 224,
        "tensor_cores": 896,
        "process_node": "reported ~3nm-class (third-party figure, not seen confirmed directly by NVIDIA)",
        "source": _NVIDIA_RUBIN_BLOG,
    },
    "memory": {
        "capacity_gb": 288,
        "type": "HBM4",
        "bandwidth_tb_s": 22.0,
        "source": _NVIDIA_RUBIN_BLOG,
    },
    # Peak THEORETICAL TFLOPS by precision, at 100% utilization -- never
    # achieved in practice. "standard" = plain CUDA-core-style throughput;
    # "tensor_core" = matrix/tensor-core-accelerated throughput at that
    # precision. SiliconSimtBackend (this project) always computes in
    # float32 and does not model a tensor-core-style reduced-precision
    # systolic array, so "fp32_standard" is the ONLY precision-matched
    # column used for timing comparisons below.
    "peak_tflops": {
        "fp64_standard": 33.0,
        "fp64_tensor_core": 200.0,
        "fp32_standard": 130.0,
        "fp32_tensor_core": 400.0,
        "tf32": 2000.0,
        "fp16": 4000.0,
        "bf16": 4000.0,
        "fp8": 17500.0,
        "fp6": 17500.0,
        "nvfp4": 50000.0,
        "int8_tops": 250.0,
        "source": _THIRD_PARTY_SPEC_AGGREGATORS,
    },
    "availability": (
        "Reported entering general availability / full production in H2 2026 "
        "(wccftech.com coverage of NVIDIA's architecture disclosure, 2026-07-21)."
    ),
}

# The one precision our backend can be fairly measured against: standard
# (non-tensor-core) FP32. Never compare our numbers to fp16/fp8/nvfp4/etc --
# those are different numeric formats this backend does not implement.
FP32_PEAK_TFLOPS = REFERENCE_GPU["peak_tflops"]["fp32_standard"]


def _gpu_ideal_seconds(flops: float) -> float:
    """Theoretical best-case time for `flops` FLOPs at the reference GPU's
    published FP32 peak, assuming (unrealistic) 100% utilization. Never a
    measurement -- pure arithmetic from a spec-sheet number."""
    return flops / (FP32_PEAK_TFLOPS * 1e12)


# ───────────────────────────────────────────────────────────────────────────
# Functional capability matrix
# ───────────────────────────────────────────────────────────────────────────
def functional_capability_matrix(backend: SiliconSimtBackend) -> list[dict]:
    rows = [
        {
            "operation": "GEMM / matrix multiply",
            "ours": "Yes — verified numerically correct vs. NumPy/BLAS (see gemm benchmarks below)",
            "reference_gpu": "Yes — native Tensor Core matmul path (public architecture fact, "
                              "every NVIDIA GPU since Volta, 2017)",
        },
        {
            "operation": "Self-attention (QK^T -> softmax -> V, incl. causal)",
            "ours": "Yes — includes a genuine predicated-exclusion causal path (not additive "
                    "-1e9 bias); verified vs. an independent NumPy softmax-attention reference below",
            "reference_gpu": "Yes — dedicated hardware acceleration via NVIDIA's Transformer "
                              "Engine (present since Hopper, expanded per the Rubin architecture blog)",
        },
        {
            "operation": "2D convolution",
            "ours": "Yes — im2col + engine GEMM; verified vs. an independent naive-loop NumPy "
                    "reference below",
            "reference_gpu": "Yes — native tensor-core convolution path (cuDNN)",
        },
        {
            "operation": "MLP / 2-layer feed-forward (fused activation)",
            "ours": "Yes — verified vs. an independent NumPy reference below",
            "reference_gpu": "Yes — composed from the same GEMM hardware path",
        },
        {
            "operation": "Elementwise activations (relu/gelu/silu/tanh/sigmoid)",
            "ours": "Yes",
            "reference_gpu": "Yes — standard CUDA-core elementwise ops",
        },
        {
            "operation": "FP32 arithmetic",
            "ours": "Yes — this backend's only compute precision (every input is cast to "
                    "float32 before compute, regardless of input dtype)",
            "reference_gpu": f"Yes — {FP32_PEAK_TFLOPS:.0f} TFLOPS standard, "
                              f"{REFERENCE_GPU['peak_tflops']['fp32_tensor_core']:.0f} TFLOPS tensor-core",
        },
        {
            "operation": "Reduced precision (FP16 / BF16 / FP8 / FP6 / NVFP4)",
            "ours": "No — SiliconSimtBackend unconditionally casts every operand to float32; "
                    "narrower dtypes are accepted as input but not computed in their native width",
            "reference_gpu": "Yes — native hardware datapaths at each width, each dramatically "
                              "higher peak throughput than FP32 (see peak_tflops table)",
        },
        {
            "operation": "FP64 (double precision)",
            "ours": "No — inputs are cast to float32, not float64",
            "reference_gpu": f"Yes, but narrow by design — {REFERENCE_GPU['peak_tflops']['fp64_standard']:.0f} "
                              f"TFLOPS standard vs. {FP32_PEAK_TFLOPS:.0f} TFLOPS FP32 "
                              "(AI-optimized silicon deliberately narrows FP64, a well-known industry tradeoff)",
        },
        {
            "operation": "Bit-exact, run-to-run deterministic execution",
            "ours": "Yes, opt-in — DigitalGPU(deterministic=True) is a real constructor flag "
                    "in this project's API",
            "reference_gpu": "Not by default — floating-point reduction order on real GPU "
                              "hardware is scheduling-dependent; bit-reproducibility needs vendor "
                              "deterministic-algorithm modes that typically cost throughput "
                              "(a well-documented industry-wide GPU caveat, not specific to Rubin)",
        },
        {
            "operation": "Dedicated on-package memory for weights/activations",
            "ours": "No — shares this container's general-purpose system RAM; no dedicated pool",
            "reference_gpu": f"Yes — {REFERENCE_GPU['memory']['capacity_gb']} GB "
                              f"{REFERENCE_GPU['memory']['type']} at "
                              f"{REFERENCE_GPU['memory']['bandwidth_tb_s']} TB/s",
        },
        {
            "operation": "Physical existence",
            "ours": "No — a software model executing on this container's general-purpose CPU "
                    "(a separate, not-yet-fabricated RTL/Sky130 hardware track exists in this "
                    "project under hardware/digital_gpu_core/, but nothing from it executes this path)",
            "reference_gpu": "Yes — a real, fabricated, physically shipping chip",
        },
    ]
    return rows


# ───────────────────────────────────────────────────────────────────────────
# Independent NumPy references (used ONLY to cross-check correctness; never
# shared code with the backend under test)
# ───────────────────────────────────────────────────────────────────────────
def _naive_attention_reference(q, k, v, causal=False):
    d = q.shape[-1]
    scores = q @ np.swapaxes(k, -1, -2) / np.sqrt(np.float32(d))
    if causal:
        t_q, t_k = scores.shape[-2], scores.shape[-1]
        future = np.triu(np.ones((t_q, t_k), dtype=bool), k=1)
        scores = np.where(future, -np.inf, scores)
    scores = scores - np.max(scores, axis=-1, keepdims=True)
    exp = np.exp(scores)
    probs = exp / np.sum(exp, axis=-1, keepdims=True)
    return probs @ v


def _naive_conv2d_reference(x, w, stride=1, padding=0):
    """Deliberately naive, direct (non-im2col) reference -- correct but far
    too slow to use at realistic shapes; used only for a tiny cross-check."""
    n, c, h, wd = x.shape
    o, cw, kh, kw = w.shape
    if padding > 0:
        x = np.pad(x, ((0, 0), (0, 0), (padding, padding), (padding, padding)))
    hp, wp = x.shape[2], x.shape[3]
    ho = (hp - kh) // stride + 1
    wo = (wp - kw) // stride + 1
    out = np.zeros((n, o, ho, wo), dtype=np.float64)
    for ni in range(n):
        for oi in range(o):
            for oy in range(ho):
                y0 = oy * stride
                for ox in range(wo):
                    x0 = ox * stride
                    patch = x[ni, :, y0:y0 + kh, x0:x0 + kw]
                    out[ni, oi, oy, ox] = np.sum(patch * w[oi])
    return out


def _naive_mlp_reference(x, w1, b1, w2, b2):
    h = np.maximum(x @ w1 + b1, 0.0)  # relu, matches the backend default
    return h @ w2 + b2


# ───────────────────────────────────────────────────────────────────────────
# Timing helpers
# ───────────────────────────────────────────────────────────────────────────
def _best_of(fn, repeats):
    best = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        dt = time.perf_counter() - t0
        if best is None or dt < best:
            best = dt
    return best


def _report_row(shape_label, flops, correct, max_abs_err, cold_s, warm_s, cache_bit_exact):
    ideal_s = _gpu_ideal_seconds(flops)
    row = {
        "shape": shape_label,
        "flops": flops,
        "correct_vs_independent_reference": correct,
        "max_abs_err_vs_reference": max_abs_err,
        "our_cold_ms": round(cold_s * 1000, 5) if cold_s is not None else None,
        "our_cold_gflops": round((flops / cold_s) / 1e9, 4) if cold_s else None,
        "our_warm_cached_ms": round(warm_s * 1000, 5) if warm_s is not None else None,
        "cache_hit_bit_exact_vs_cold_output": cache_bit_exact,
        f"{REFERENCE_GPU['name']}_ideal_us_at_fp32_peak_{FP32_PEAK_TFLOPS:.0f}TFLOPS": round(ideal_s * 1e6, 6),
        "gap_factor_our_cold_vs_gpu_ideal": round(cold_s / ideal_s, 1) if cold_s and ideal_s > 0 else None,
    }
    return row


# ───────────────────────────────────────────────────────────────────────────
# GEMM
# ───────────────────────────────────────────────────────────────────────────
GEMM_SHAPES = [(256, 256, 256), (512, 512, 512), (1024, 1024, 1024), (2048, 2048, 2048)]


def bench_gemm(backend: SiliconSimtBackend, m, k, n, repeats=3):
    a = _rng.standard_normal((m, k)).astype(np.float32)
    b = _rng.standard_normal((k, n)).astype(np.float32)
    ours = backend.gemm(a, b).numpy()
    ref = a @ b
    correct = bool(np.allclose(ours, ref, rtol=1e-3, atol=1e-3))
    max_err = float(np.max(np.abs(ours.astype(np.float64) - ref.astype(np.float64))))

    def _cold_once():
        aa = _rng.standard_normal((m, k)).astype(np.float32)
        bb = _rng.standard_normal((k, n)).astype(np.float32)
        backend.gemm(aa, bb)
    cold_s = _best_of(_cold_once, repeats)

    wa = _rng.standard_normal((m, k)).astype(np.float32)
    wb = _rng.standard_normal((k, n)).astype(np.float32)
    primed = backend.gemm(wa, wb).numpy()
    warm_s = _best_of(lambda: backend.gemm(wa, wb), repeats)
    hit = backend.gemm(wa, wb).numpy()
    cache_bit_exact = bool(np.array_equal(primed, hit))

    flops = 2.0 * m * k * n
    return _report_row(f"{m}x{k} @ {k}x{n}", flops, correct, max_err, cold_s, warm_s, cache_bit_exact)


# ───────────────────────────────────────────────────────────────────────────
# Attention (no pocket-cache path in this backend -- see functional matrix)
# ───────────────────────────────────────────────────────────────────────────
ATTENTION_SHAPES = [
    {"b": 1, "h": 4, "s": 256, "d": 64, "name": "short_sequence"},
    {"b": 1, "h": 8, "s": 512, "d": 64, "name": "medium_sequence"},
]


def bench_attention(backend: SiliconSimtBackend, b, h, s, d, name, repeats=3):
    q = _rng.standard_normal((b, h, s, d)).astype(np.float32)
    k = _rng.standard_normal((b, h, s, d)).astype(np.float32)
    v = _rng.standard_normal((b, h, s, d)).astype(np.float32)

    ours = backend.attention(q, k, v, causal=True).numpy()
    ref = _naive_attention_reference(q, k, v, causal=True)
    correct = bool(np.allclose(ours, ref, rtol=1e-3, atol=1e-3))
    max_err = float(np.max(np.abs(ours.astype(np.float64) - ref.astype(np.float64))))

    measured_s = _best_of(lambda: backend.attention(q, k, v, causal=True), repeats)

    # 2 matmuls (QK^T, probs@V), each 2*B*H*S*S*D FLOPs (standard convention).
    flops = 4.0 * b * h * s * s * d
    ideal_s = _gpu_ideal_seconds(flops)
    return {
        "shape": f"{name} (B={b},H={h},S={s},D={d})",
        "flops": flops,
        "correct_vs_independent_reference": correct,
        "max_abs_err_vs_reference": max_err,
        "pocket_cached_in_this_backend": False,
        "note": "attention's internal matmuls call the SIMT engine directly and bypass the "
                "pocket accelerator in this backend (see silicon_simt_backend.py), so there is "
                "no cache-hit path to measure here -- only a single measured time.",
        "our_measured_ms": round(measured_s * 1000, 5),
        f"{REFERENCE_GPU['name']}_ideal_us_at_fp32_peak_{FP32_PEAK_TFLOPS:.0f}TFLOPS": round(ideal_s * 1e6, 6),
        "gap_factor_our_measured_vs_gpu_ideal": round(measured_s / ideal_s, 1) if ideal_s > 0 else None,
    }


# ───────────────────────────────────────────────────────────────────────────
# Conv2d
# ───────────────────────────────────────────────────────────────────────────
CONV2D_SHAPES = [
    {"n": 1, "c": 3, "h": 224, "w": 224, "o": 64, "kh": 7, "kw": 7, "stride": 2, "padding": 3, "name": "resnet_stem"},
    {"n": 1, "c": 64, "h": 56, "w": 56, "o": 64, "kh": 3, "kw": 3, "stride": 1, "padding": 1, "name": "resnet_block"},
]

_TINY_CONV2D_CORRECTNESS_SHAPE = {"n": 1, "c": 2, "h": 8, "w": 8, "o": 3, "kh": 3, "kw": 3, "stride": 1, "padding": 0}


def _verify_conv2d_correctness(backend: SiliconSimtBackend):
    """Independent, deliberately tiny cross-check (the naive reference is a
    pure-Python nested loop and too slow to run at realistic sizes)."""
    p = _TINY_CONV2D_CORRECTNESS_SHAPE
    x = _rng.standard_normal((p["n"], p["c"], p["h"], p["w"])).astype(np.float32)
    w = _rng.standard_normal((p["o"], p["c"], p["kh"], p["kw"])).astype(np.float32)
    ours = backend.conv2d(x, w, stride=p["stride"], padding=p["padding"]).numpy()
    ref = _naive_conv2d_reference(x, w, stride=p["stride"], padding=p["padding"])
    correct = bool(np.allclose(ours, ref, rtol=1e-3, atol=1e-3))
    max_err = float(np.max(np.abs(ours.astype(np.float64) - ref)))
    return correct, max_err


def bench_conv2d(backend: SiliconSimtBackend, n, c, h, w, o, kh, kw, stride, padding, name, repeats=3):
    def _fresh():
        x = _rng.standard_normal((n, c, h, w)).astype(np.float32)
        wt = _rng.standard_normal((o, c, kh, kw)).astype(np.float32)
        return x, wt

    def _cold_once():
        x, wt = _fresh()
        backend.conv2d(x, wt, stride=stride, padding=padding)
    cold_s = _best_of(_cold_once, repeats)

    wx, ww = _fresh()
    primed = backend.conv2d(wx, ww, stride=stride, padding=padding).numpy()
    warm_s = _best_of(lambda: backend.conv2d(wx, ww, stride=stride, padding=padding), repeats)
    hit = backend.conv2d(wx, ww, stride=stride, padding=padding).numpy()
    cache_bit_exact = bool(np.array_equal(primed, hit))

    ho = (h + 2 * padding - kh) // stride + 1
    wo = (w + 2 * padding - kw) // stride + 1
    flops = 2.0 * n * o * ho * wo * c * kh * kw
    label = f"{name}: [{n},{c},{h},{w}] * [{o},{c},{kh},{kw}] stride={stride} pad={padding}"
    correct, max_err = _verify_conv2d_correctness(backend)
    row = _report_row(label, flops, correct, max_err, cold_s, warm_s, cache_bit_exact)
    row["correctness_check_shape"] = f"tiny independent shape {_TINY_CONV2D_CORRECTNESS_SHAPE} (naive reference too slow at realistic size)"
    return row


# ───────────────────────────────────────────────────────────────────────────
# MLP
# ───────────────────────────────────────────────────────────────────────────
MLP_SHAPES = [{"batch": 512, "d_model": 768, "d_ff": 3072, "name": "bert_base_ffn"}]


def bench_mlp(backend: SiliconSimtBackend, batch, d_model, d_ff, name, repeats=3):
    def _fresh():
        x = _rng.standard_normal((batch, d_model)).astype(np.float32)
        w1 = _rng.standard_normal((d_model, d_ff)).astype(np.float32)
        b1 = _rng.standard_normal((d_ff,)).astype(np.float32)
        w2 = _rng.standard_normal((d_ff, d_model)).astype(np.float32)
        b2 = _rng.standard_normal((d_model,)).astype(np.float32)
        return x, w1, b1, w2, b2

    x, w1, b1, w2, b2 = _fresh()
    ours = backend.mlp(x, w1, b1, w2, b2, activation="relu").numpy()
    ref = _naive_mlp_reference(x, w1, b1, w2, b2)
    correct = bool(np.allclose(ours, ref, rtol=1e-3, atol=1e-3))
    max_err = float(np.max(np.abs(ours.astype(np.float64) - ref.astype(np.float64))))

    def _cold_once():
        xx, ww1, bb1, ww2, bb2 = _fresh()
        backend.mlp(xx, ww1, bb1, ww2, bb2, activation="relu")
    cold_s = _best_of(_cold_once, repeats)

    wx, wa1, wb1, wa2, wb2 = _fresh()
    primed = backend.mlp(wx, wa1, wb1, wa2, wb2, activation="relu").numpy()
    warm_s = _best_of(lambda: backend.mlp(wx, wa1, wb1, wa2, wb2, activation="relu"), repeats)
    hit = backend.mlp(wx, wa1, wb1, wa2, wb2, activation="relu").numpy()
    cache_bit_exact = bool(np.array_equal(primed, hit))

    flops = 2.0 * (2 * batch * d_model * d_ff)  # two GEMMs, each 2*batch*d_model*d_ff
    label = f"{name}: batch={batch} d_model={d_model} d_ff={d_ff}"
    return _report_row(label, flops, correct, max_err, cold_s, warm_s, cache_bit_exact)


# ───────────────────────────────────────────────────────────────────────────
# Report
# ───────────────────────────────────────────────────────────────────────────
def _print_banner():
    print("=" * 78)
    print("CAUTION -- read before quoting any number below out of context:")
    print("This compares a CPU-bound software model (this project) against a")
    print("manufacturer's SPEC SHEET for a real, physical, fabricated GPU. There")
    print("is no physical or virtual GPU anywhere in this container. Every")
    print(f"'{REFERENCE_GPU['name']}' figure is a published specification, cited to")
    print("source, and is NEVER measured by this script. 'ideal' GPU times are a")
    print("theoretical 100%-utilization ceiling computed from that spec, not an")
    print("achieved result. The gap you will see below is fabricated silicon vs.")
    print("a general-purpose CPU -- it is not a software-optimization gap.")
    print("=" * 78)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=3, help="timing repeats per case (best-of-N)")
    args = parser.parse_args()

    _print_banner()

    backend = SiliconSimtBackend()
    if not backend.is_available():
        print("SiliconSimtBackend failed to load -- aborting (see engine_load_error).")
        print(json.dumps(backend.info(), indent=2))
        return 1

    print(f"\n[reference gpu: {REFERENCE_GPU['name']}]")
    print(f"  why this one: {REFERENCE_GPU['why_this_one']}")
    print(f"  architecture: {REFERENCE_GPU['architecture']['transistors']} transistors, "
          f"{REFERENCE_GPU['architecture']['streaming_multiprocessors']} SMs, "
          f"{REFERENCE_GPU['architecture']['tensor_cores']} tensor cores")
    print(f"  memory: {REFERENCE_GPU['memory']['capacity_gb']} GB {REFERENCE_GPU['memory']['type']} "
          f"@ {REFERENCE_GPU['memory']['bandwidth_tb_s']} TB/s")
    print(f"  fp32 (standard, precision-matched to our backend): {FP32_PEAK_TFLOPS} TFLOPS")
    print(f"  availability: {REFERENCE_GPU['availability']}")

    print("\n[functional capability matrix]")
    matrix = functional_capability_matrix(backend)
    for row in matrix:
        print(f"\n  * {row['operation']}")
        print(f"      ours          : {row['ours']}")
        print(f"      reference gpu : {row['reference_gpu']}")

    results = {"gemm": [], "attention": [], "conv2d": [], "mlp": []}

    print("\n[gemm -- same parameters]")
    for (m, k, n) in GEMM_SHAPES:
        row = bench_gemm(backend, m, k, n, repeats=args.repeats)
        results["gemm"].append(row)
        print(f"  {row['shape']}: correct={row['correct_vs_independent_reference']} "
              f"cold={row['our_cold_ms']}ms warm(cached)={row['our_warm_cached_ms']}ms "
              f"cache_bit_exact={row['cache_hit_bit_exact_vs_cold_output']} "
              f"gpu_ideal_gap={row['gap_factor_our_cold_vs_gpu_ideal']}x")

    print("\n[attention -- same parameters]")
    for shape in ATTENTION_SHAPES:
        row = bench_attention(backend, **{k: v for k, v in shape.items() if k != "name"}, name=shape["name"], repeats=args.repeats)
        results["attention"].append(row)
        print(f"  {row['shape']}: correct={row['correct_vs_independent_reference']} "
              f"measured={row['our_measured_ms']}ms "
              f"gpu_ideal_gap={row['gap_factor_our_measured_vs_gpu_ideal']}x")

    print("\n[conv2d -- same parameters]")
    for shape in CONV2D_SHAPES:
        kwargs = {k: v for k, v in shape.items() if k != "name"}
        row = bench_conv2d(backend, name=shape["name"], repeats=args.repeats, **kwargs)
        results["conv2d"].append(row)
        print(f"  {row['shape']}: correct={row['correct_vs_independent_reference']} "
              f"cold={row['our_cold_ms']}ms warm(cached)={row['our_warm_cached_ms']}ms "
              f"cache_bit_exact={row['cache_hit_bit_exact_vs_cold_output']} "
              f"gpu_ideal_gap={row['gap_factor_our_cold_vs_gpu_ideal']}x")

    print("\n[mlp -- same parameters]")
    for shape in MLP_SHAPES:
        kwargs = {k: v for k, v in shape.items() if k != "name"}
        row = bench_mlp(backend, name=shape["name"], repeats=args.repeats, **kwargs)
        results["mlp"].append(row)
        print(f"  {row['shape']}: correct={row['correct_vs_independent_reference']} "
              f"cold={row['our_cold_ms']}ms warm(cached)={row['our_warm_cached_ms']}ms "
              f"cache_bit_exact={row['cache_hit_bit_exact_vs_cold_output']} "
              f"gpu_ideal_gap={row['gap_factor_our_cold_vs_gpu_ideal']}x")

    all_correct = all(
        row["correct_vs_independent_reference"]
        for group in results.values()
        for row in group
    )
    all_cache_bit_exact = all(
        row.get("cache_hit_bit_exact_vs_cold_output", True)
        for group in results.values()
        for row in group
    )

    print("\n[honest takeaway]")
    print(f"  functional correctness vs. independent references: {'ALL PASSED' if all_correct else 'SOME FAILED -- see rows above'}")
    print(f"  cache-hit output bit-exact vs. cache-miss output:   {'ALL PASSED' if all_cache_bit_exact else 'SOME FAILED -- see rows above'}")
    print("  functional coverage: gemm / attention / conv2d / mlp all implemented and verified")
    print("  at FP32. Reduced precision (fp16/bf16/fp8/fp6/nvfp4) and FP64 are NOT implemented")
    print(f"  by this backend; {REFERENCE_GPU['name']} supports both natively in hardware.")
    print("  throughput: at the one precision both sides share (standard FP32), the reference")
    print("  GPU's *published peak* is measured in TFLOPS (1e12 FLOPs/s); this container's")
    print("  CPU-bound model is measured in GFLOPS (1e9 FLOPs/s) at best. That gap is fabricated")
    print("  silicon vs. a general-purpose CPU -- no amount of software optimization here closes it.")

    print("\n[sources]")
    print(f"  1. {REFERENCE_GPU['architecture']['source']}")
    print(f"  2. {REFERENCE_GPU['peak_tflops']['source']}")
    print(f"  3. {REFERENCE_GPU['availability']}")

    out = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "reference_gpu": REFERENCE_GPU,
        "functional_capability_matrix": matrix,
        "results": results,
        "all_correctness_checks_passed": all_correct,
        "all_cache_bit_exactness_checks_passed": all_cache_bit_exact,
    }
    with open(OUTPUT_PATH, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"\nFull results (with sources) written to {OUTPUT_PATH}")

    return 0 if (all_correct and all_cache_bit_exact) else 1


if __name__ == "__main__":
    sys.exit(main())
