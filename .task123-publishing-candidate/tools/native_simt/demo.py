"""
Runs the hand-translated kernels through the from-scratch engine and
verifies them against a real NumPy reference computed independently.
"""
import threading
import time

import numpy as np

from tools.native_simt.engine import Dim3, launch_kernel, launch_warp_kernel
from tools.native_simt.kernels import (
    dummy_kernel,
    reduction_redesigned_sm102_kernel,
    reduction_redesigned_sm102_kernel_warp,
)


def run_dummy_kernel_demo():
    n = 16
    x = np.arange(n, dtype=np.float64)
    reference = x * 2.0

    launch_kernel(
        dummy_kernel,
        grid_dim=Dim3(1),
        block_dim=Dim3(n),
        args=(x, n),
    )

    ok = np.array_equal(x, reference)
    print(f"[dummy_kernel]  engine result matches x*2 reference: {ok}")
    print(f"                x = {x}")
    assert ok, "dummy_kernel result diverged from reference"


def run_reduction_kernel_demo():
    n = 50_000
    rng = np.random.default_rng(42)
    x = rng.random(n).astype(np.float64)
    y = rng.random(n).astype(np.float64)

    block_dim = 256
    grid_dim = min(64, (n + block_dim - 1) // block_dim)  # grid-stride, small grid on purpose

    out = [0.0]
    out_lock = threading.Lock()

    t0 = time.perf_counter()
    launch_kernel(
        reduction_redesigned_sm102_kernel,
        grid_dim=Dim3(grid_dim),
        block_dim=Dim3(block_dim),
        args=(x, y, out, out_lock, n),
    )
    t1 = time.perf_counter()

    reference = float(np.dot(x, y))
    engine_result = out[0]
    rel_err = abs(engine_result - reference) / abs(reference)

    print(f"[reduction_redesigned_sm102_kernel]  n={n}, grid={grid_dim}x{block_dim} "
          f"({grid_dim * block_dim} real OS threads spawned across {grid_dim} blocks)")
    print(f"  engine result   = {engine_result!r}")
    print(f"  numpy reference = {reference!r}")
    print(f"  relative error  = {rel_err:.3e}")
    print(f"  wall time       = {t1 - t0:.4f}s")
    assert rel_err < 1e-9, "reduction kernel result diverged from reference beyond float rounding"
    return t1 - t0


def run_reduction_kernel_warp_demo():
    n = 50_000
    rng = np.random.default_rng(42)
    x = rng.random(n).astype(np.float64)
    y = rng.random(n).astype(np.float64)

    block_dim = 256
    grid_dim = min(64, (n + block_dim - 1) // block_dim)

    out = [0.0]
    out_lock = threading.Lock()

    t0 = time.perf_counter()
    launch_warp_kernel(
        reduction_redesigned_sm102_kernel_warp,
        grid_dim=Dim3(grid_dim),
        block_dim=Dim3(block_dim),
        args=(x, y, out, out_lock, n),
    )
    t1 = time.perf_counter()

    reference = float(np.dot(x, y))
    engine_result = out[0]
    rel_err = abs(engine_result - reference) / abs(reference)

    n_warp_threads = grid_dim * (block_dim // 32)
    print(f"[reduction_redesigned_sm102_kernel_warp]  n={n}, grid={grid_dim}x{block_dim} "
          f"({n_warp_threads} real OS threads -- one per warp -- across {grid_dim} blocks)")
    print(f"  engine result   = {engine_result!r}")
    print(f"  numpy reference = {reference!r}")
    print(f"  relative error  = {rel_err:.3e}")
    print(f"  wall time       = {t1 - t0:.4f}s")
    assert rel_err < 1e-9, "warp-vectorized reduction kernel diverged from reference"
    return t1 - t0


if __name__ == "__main__":
    run_dummy_kernel_demo()
    print()
    per_lane_time = run_reduction_kernel_demo()
    print()
    per_warp_time = run_reduction_kernel_warp_demo()
    print(f"\nSpeedup from per-lane-thread engine to per-warp-thread engine: "
          f"{per_lane_time / per_warp_time:.1f}x, same kernel, same result, "
          f"same synchronization guarantees -- fewer OS threads standing in "
          f"for each warp's true SIMD lockstep.")
