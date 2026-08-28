"""benchmark_gpu_native.py — honest, CPU-only performance report and
regression gate for the digital GPU's kernel and orchestration layers.

What this measures, and what it deliberately does NOT claim:
  * Kernel level: a naive pure-Python reference GEMM vs. this project's
    tiled lockstep-SIMT GEMM, on small shapes only (the reference is
    O(M*K*N) pure Python and would take minutes-to-hours at production
    shapes -- this is *why* the tiled engine is the default execution path,
    demonstrated rather than merely asserted). Separately, the optimized
    GEMM vs. raw NumPy/BLAS on production-sized shapes, as an honest
    "how close to the local BLAS ceiling are we" figure.
  * Orchestration level: a graph with genuinely independent branches run
    serially (num_streams=1) vs. multi-stream, at a sweep of per-branch
    sizes, honestly reporting wherever multi-stream is faster AND wherever
    it is slower. CPython's GIL means threaded overlap only pays off once a
    node's own execution releases the GIL for long enough to amortize
    thread-scheduling overhead; this project's own backends only partially
    do, so the result is a real crossover, not a monotonic speedup -- see
    ``runtime/engine.py``'s module docstring for the measured story. This
    benchmark exists to keep that crossover point honestly visible as the
    code evolves, not to assert a positive number.
  * There is no physical or virtual GPU in this container. Every figure
    here is a real measurement on this machine, compared only against this
    project's own reference implementation, its own prior baseline, or the
    local NumPy/BLAS install -- never against any vendor GPU product.

Regression gate: results are compared against a stored baseline
(``.benchmark_baseline.json`` next to this file). Any ``*_ms`` metric more
than REGRESSION_TOLERANCE slower than the stored baseline exits non-zero
(CI-catchable) and prints exactly what regressed. Pass --update-baseline to
(re)write the baseline from the current run (first run always does this).

Runnable directly: uv run python ai_model/maxcore/tests/benchmark_gpu_native.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np

_SERVER_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

from ai_model.maxcore.api import DigitalGPU  # noqa: E402
from ai_model.maxcore.backend.silicon_simt_backend import SiliconSimtBackend  # noqa: E402
from ai_model.maxcore.ir.builder import GraphBuilder  # noqa: E402
from ai_model.maxcore.kernels.reference import reference_gemm  # noqa: E402

BASELINE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".benchmark_baseline.json")
REGRESSION_TOLERANCE = 0.35  # allow up to 35% slower than baseline before flagging

_rng = np.random.default_rng(7)


def _time_it(fn, repeats=3):
    best = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        dt = time.perf_counter() - t0
        if best is None or dt < best:
            best = dt
    return best


def bench_reference_vs_optimized_gemm():
    """Small-shape GEMM: naive pure-Python triple loop vs. the tiled
    lockstep-SIMT engine."""
    m, k, n = 24, 32, 20
    a = _rng.standard_normal((m, k)).astype(np.float32)
    b = _rng.standard_normal((k, n)).astype(np.float32)
    sim = SiliconSimtBackend()

    ref_out = reference_gemm(a, b)
    opt_out = sim.gemm(a, b).numpy()
    assert np.allclose(ref_out, opt_out, atol=1e-2), "reference and optimized GEMM disagree"

    ref_s = _time_it(lambda: reference_gemm(a, b), repeats=3)
    opt_s = _time_it(lambda: sim.gemm(a, b), repeats=5)
    flops = 2 * m * k * n
    return {
        "shape": f"{m}x{k} @ {k}x{n}",
        "reference_ms": round(ref_s * 1000, 4),
        "optimized_ms": round(opt_s * 1000, 4),
        "speedup_x": round(ref_s / opt_s, 2) if opt_s > 0 else None,
        "optimized_gflops": round((flops / opt_s) / 1e9, 4) if opt_s > 0 else None,
    }


def bench_optimized_vs_numpy_ceiling():
    """Production-sized GEMM: optimized kernel vs. raw NumPy/BLAS on the same
    host -- distance to the local BLAS ceiling, not a competing-product claim."""
    m, k, n = 1025, 2048, 1300
    a = _rng.standard_normal((m, k)).astype(np.float32)
    b = _rng.standard_normal((k, n)).astype(np.float32)
    sim = SiliconSimtBackend()

    numpy_s = _time_it(lambda: a @ b, repeats=5)
    opt_s = _time_it(lambda: sim.gemm(a, b), repeats=5)
    flops = 2 * m * k * n
    return {
        "shape": f"{m}x{k} @ {k}x{n}",
        "numpy_blas_ms": round(numpy_s * 1000, 4),
        "optimized_ms": round(opt_s * 1000, 4),
        "ratio_to_blas": round(opt_s / numpy_s, 3) if numpy_s > 0 else None,
        "optimized_gflops": round((flops / opt_s) / 1e9, 4) if opt_s > 0 else None,
        "numpy_gflops": round((flops / numpy_s) / 1e9, 4) if numpy_s > 0 else None,
    }


def _wide_independent_graph(width, m, k, n):
    """`width` fully independent gemm+relu branches (each `m x k @ k x n`)
    summed into one output -- maximizes genuinely-parallel work for the
    orchestration benchmark."""
    b = GraphBuilder()
    branch_outs = []
    inputs = {}
    for i in range(width):
        x = b.add_input(f"x{i}")
        w = b.add_input(f"w{i}")
        branch_outs.append(b.relu(b.gemm(x, w)))
        inputs[f"x{i}"] = _rng.standard_normal((m, k)).astype(np.float32)
        inputs[f"w{i}"] = _rng.standard_normal((k, n)).astype(np.float32)
    acc = branch_outs[0]
    for o in branch_outs[1:]:
        acc = b.add(acc, o)
    graph = b.build(acc)
    return graph, inputs


def _bench_stream_overlap_at(width, m, k, n):
    graph, inputs = _wide_independent_graph(width, m, k, n)

    dg_serial = DigitalGPU(num_streams=1)
    dg_parallel = DigitalGPU(num_streams=width)
    compiled_serial = dg_serial.compile(graph)
    compiled_parallel = dg_parallel.compile(graph)

    serial_s = _time_it(lambda: dg_serial.run_graph(compiled_serial, dict(inputs)), repeats=3)
    parallel_s = _time_it(lambda: dg_parallel.run_graph(compiled_parallel, dict(inputs)), repeats=3)
    return {
        "branches": width,
        "shape": f"{m}x{k} @ {k}x{n}",
        "serial_ms": round(serial_s * 1000, 4),
        "parallel_ms": round(parallel_s * 1000, 4),
        "overlap_speedup_x": round(serial_s / parallel_s, 2) if parallel_s > 0 else None,
    }


def bench_stream_overlap_small():
    """Small per-branch GEMMs -- the common case for this project's graphs.
    Honestly expected to show speedup below 1x: thread-scheduling/GIL-handoff
    overhead is not amortized by this little real work per stream. This is
    *why* ``num_streams`` defaults to 1 (see ``runtime/engine.py``)."""
    return _bench_stream_overlap_at(width=8, m=96, k=256, n=96)


def bench_stream_overlap_large():
    """Large per-branch GEMMs -- enough real, partially GIL-releasing work
    per stream that overlap has a chance to pay for its own overhead. Not
    guaranteed to exceed 1x on every machine or run; report whatever this
    run actually measures, not what would look best."""
    return _bench_stream_overlap_at(width=4, m=1024, k=1024, n=1024)


def _load_baseline():
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH) as f:
            return json.load(f)
    return None


def _save_baseline(results):
    with open(BASELINE_PATH, "w") as f:
        json.dump(results, f, indent=2, sort_keys=True)


def _check_regressions(results, baseline):
    """Compare *_ms timing fields against the stored baseline. Returns a
    list of human-readable regression messages (empty if none)."""
    problems = []
    for bench_name, metrics in results.items():
        base_metrics = (baseline or {}).get(bench_name, {})
        for key, value in metrics.items():
            if not key.endswith("_ms") or not isinstance(value, (int, float)):
                continue
            base_value = base_metrics.get(key)
            if not isinstance(base_value, (int, float)) or base_value <= 0:
                continue
            allowed = base_value * (1 + REGRESSION_TOLERANCE)
            if value > allowed:
                pct = (value / base_value - 1) * 100
                problems.append(
                    f"{bench_name}.{key}: {value:.4f}ms vs baseline {base_value:.4f}ms "
                    f"(+{pct:.1f}%, tolerance {REGRESSION_TOLERANCE * 100:.0f}%)"
                )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update-baseline", action="store_true",
                        help="Write current results as the new stored baseline.")
    args = parser.parse_args()

    print("=" * 78)
    print("Digital GPU benchmark -- CPU-only, this-machine-vs-itself.")
    print("No physical or vendor GPU exists in this environment; nothing here")
    print("is compared against one. All figures are real wall-clock measurements.")
    print("=" * 78)

    results = {
        "reference_vs_optimized_gemm": bench_reference_vs_optimized_gemm(),
        "optimized_vs_numpy_ceiling": bench_optimized_vs_numpy_ceiling(),
        "stream_overlap_small": bench_stream_overlap_small(),
        "stream_overlap_large": bench_stream_overlap_large(),
    }

    for name, metrics in results.items():
        print(f"\n[{name}]")
        for k, v in metrics.items():
            print(f"  {k}: {v}")

    def _verdict(speedup):
        if speedup is None:
            return "n/a"
        return "overlap paid off" if speedup > 1 else "overhead/GIL-bound on this hardware"

    small_x = results["stream_overlap_small"]["overlap_speedup_x"]
    large_x = results["stream_overlap_large"]["overlap_speedup_x"]
    print("\n[honest takeaway]")
    print(f"  small independent GEMMs: {small_x}x -- {_verdict(small_x)}")
    print(f"  large independent GEMMs: {large_x}x -- {_verdict(large_x)}")
    print("  multi-stream execution is correct either way; wall-clock benefit is")
    print("  workload- and hardware-dependent, which is why num_streams defaults")
    print("  to 1 -- opt in explicitly once you've measured your own workload.")

    baseline = _load_baseline()
    if args.update_baseline or baseline is None:
        _save_baseline(results)
        print(f"\nBaseline written to {BASELINE_PATH}")
        return 0

    problems = _check_regressions(results, baseline)
    if problems:
        print("\nREGRESSIONS DETECTED:")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("\nNo regressions vs stored baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
