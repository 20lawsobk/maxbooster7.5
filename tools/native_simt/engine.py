"""
Home-grown SIMT execution engine.

This is NOT a wrapper around CuPBoP, gpuocelot, or any other existing
CUDA-on-CPU project, and it does not parse .cu source text. It is an
original, from-scratch interpreter for CUDA's execution *model*
(threadIdx/blockIdx/blockDim/gridDim, __shared__ memory, __syncthreads,
warp shuffles) built specifically to run kernels that have been hand
translated, line-by-line, from real .cu files in this repo.

Design, in plain terms:
  - Each CUDA "block" becomes a Python thread group. Threads within a
    block are real OS threads (module `threading`), not a serial Python
    for-loop pretending to be parallel — so __syncthreads() is a real
    threading.Barrier, not a no-op.
  - Warp-level primitives (__shfl_down_sync) are modelled with a small
    per-warp scratch buffer + a per-warp barrier, sized to the real warp
    width (32), so the data-dependency pattern of a warp shuffle is
    reproduced rather than skipped.
  - There is no GPU, no CUDA runtime, no device memory: everything is a
    NumPy array in host RAM. This engine proves *logical correctness* of
    a hand-translated kernel body executing under CUDA's actual
    concurrency model on CPU. It makes no claim to GPU-class throughput —
    that is a hardware property this design does not and cannot touch.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Callable, Optional

WARP_SIZE = 32


@dataclass(frozen=True)
class Dim3:
    x: int = 1
    y: int = 1
    z: int = 1


class _WarpState:
    """Per-warp scratch shared by all 32 lanes for shuffle emulation."""

    def __init__(self, width: int):
        self.width = width
        self.slot = [0.0] * width
        self.barrier = threading.Barrier(width)


class BlockContext:
    """What one thread sees: its own indices plus block/warp-shared state."""

    def __init__(self, block_idx: Dim3, block_dim: Dim3, grid_dim: Dim3,
                 shared_mem: dict, sync_barrier: Optional[threading.Barrier],
                 warp_states: list):
        self.blockIdx = block_idx
        self.blockDim = block_dim
        self.gridDim = grid_dim
        self.shared = shared_mem            # emulates __shared__ arrays
        self._sync_barrier = sync_barrier
        self._warp_states = warp_states     # one _WarpState per warp in block

    def syncthreads(self):
        """Real block-wide barrier -> emulates __syncthreads()."""
        if self._sync_barrier is not None:
            self._sync_barrier.wait()

    def warp_shfl_down_sync(self, lane_id: int, warp_id: int, val: float, offset: int) -> float:
        """
        Emulates __shfl_down_sync(mask, val, offset) for a full-mask warp:
        lane L receives the value that lane (L + offset) currently holds.
        Implemented with a real per-warp barrier so every lane's write is
        visible before any lane reads its neighbour's value -- the same
        data-dependency contract the real instruction enforces in hardware.
        """
        warp = self._warp_states[warp_id]
        warp.slot[lane_id] = val
        warp.barrier.wait()
        src_lane = lane_id + offset
        result = warp.slot[src_lane] if src_lane < warp.width else 0.0
        warp.barrier.wait()  # don't let the next offset's writes race this read
        return result


def launch_kernel(kernel_fn: Callable, grid_dim: Dim3, block_dim: Dim3,
                   shared_mem_factory=None, args: tuple = ()):
    """
    Executes kernel_fn(ctx, thread_idx, lane_id, warp_id, *args) once per
    (block, thread) -- real thread concurrency within each block, blocks
    executed one at a time (a real GPU also time-slices blocks across a
    finite number of SMs; this just picks the simplest valid schedule).
    """
    n_threads = block_dim.x * block_dim.y * block_dim.z
    n_warps = (n_threads + WARP_SIZE - 1) // WARP_SIZE

    def run_block(bx, by, bz):
        shared = shared_mem_factory() if shared_mem_factory else {}
        sync_barrier = threading.Barrier(n_threads) if n_threads > 1 else None
        warp_states = [_WarpState(WARP_SIZE) for _ in range(n_warps)]
        ctx = BlockContext(Dim3(bx, by, bz), block_dim, grid_dim, shared, sync_barrier, warp_states)

        threads = []
        flat_tid = 0
        for tz in range(block_dim.z):
            for ty in range(block_dim.y):
                for tx in range(block_dim.x):
                    lane_id = flat_tid % WARP_SIZE
                    warp_id = flat_tid // WARP_SIZE
                    t = threading.Thread(
                        target=kernel_fn,
                        args=(ctx, Dim3(tx, ty, tz), lane_id, warp_id, *args),
                    )
                    threads.append(t)
                    flat_tid += 1

        for t in threads:
            t.start()
        for t in threads:
            t.join()

    for bz in range(grid_dim.z):
        for by in range(grid_dim.y):
            for bx in range(grid_dim.x):
                run_block(bx, by, bz)
