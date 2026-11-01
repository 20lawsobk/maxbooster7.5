"""
Hand-translated kernel bodies.

Each function here is a line-by-line port of the real CUDA in this repo's
external/maxcore/.../gpu/native/cuda/*.cu files onto the engine in
engine.py. The translation is literal: the same index math, the same loop
structure, the same synchronization points -- just CUDA syntax swapped for
the equivalent engine call.

The one deliberate deviation, noted inline below: a per-thread grid-stride
loop's body (`sum += x[i]*y[i]`) has no cross-thread dependency, so it is
computed with a vectorized NumPy slice instead of a Python `for` loop.
This changes performance only -- the values touched, and in what order
they're combined into `total`, are identical to the scalar loop; it does
not change which synchronization points are real (syncthreads/shuffle
still run through the engine's actual barriers, untouched).
"""
import numpy as np

from tools.native_simt.engine import Dim3, WARP_SIZE, warp_shfl_down_vec


def dummy_kernel(ctx, tid: Dim3, lane_id, warp_id, x, n):
    """
    Port of the pasted dummy_kernel (x[idx] = x[idx] * 2.0):
        int idx = blockIdx.x * blockDim.x + threadIdx.x;
        if (idx < n) x[idx] = x[idx] * 2.0f;
    """
    idx = ctx.blockIdx.x * ctx.blockDim.x + tid.x
    if idx < n:
        x[idx] = x[idx] * 2.0


def reduction_redesigned_sm102_kernel(ctx, tid: Dim3, lane_id, warp_id, x, y, out, out_lock, n):
    """
    Line-by-line port of reduction_redesigned_sm102_kernel from
    external/maxcore/.../gpu/native/cuda/reduction_sm102.cu:

        float sum = 0.0f;
        int idx    = blockIdx.x * blockDim.x + threadIdx.x;
        int stride = blockDim.x * gridDim.x;
        for (int i = idx; i < n; i += stride)
            sum += x[i] * y[i];
        sum = warp_reduce_sum(sum);
        if ((threadIdx.x & (WARP_SIZE - 1)) == 0)
            atomicAdd(out, sum);

    warp_reduce_sum() itself (also from the same .cu file):
        for (int offset = WARP_SIZE / 2; offset > 0; offset >>= 1)
            val += __shfl_down_sync(0xffffffff, val, offset);
    """
    idx = ctx.blockIdx.x * ctx.blockDim.x + tid.x
    stride = ctx.blockDim.x * ctx.gridDim.x

    # Same elements, same combination order into `total` as the scalar
    # `for (i = idx; i < n; i += stride) sum += x[i]*y[i]` loop -- just
    # executed as one vectorized multiply-and-sum instead of a Python loop.
    total = float((x[idx:n:stride] * y[idx:n:stride]).sum())

    # warp_reduce_sum, via the engine's real per-warp shuffle emulation
    offset = WARP_SIZE // 2
    while offset > 0:
        total += ctx.warp_shfl_down_sync(lane_id, warp_id, total, offset)
        offset >>= 1

    if (tid.x & (WARP_SIZE - 1)) == 0:
        with out_lock:  # atomicAdd(out, sum)
            out[0] += total


def reduction_redesigned_sm102_kernel_warp(ctx, lane_tids: np.ndarray, x, y, out, out_lock, n):
    """
    Same kernel as above, same semantics, running on the warp-vectorized
    engine (launch_warp_kernel): one call handles a full 32-lane warp at
    once instead of one call per lane.
    """
    idx = ctx.blockIdx.x * ctx.blockDim.x + lane_tids
    stride = ctx.blockDim.x * ctx.gridDim.x

    total = np.zeros(len(lane_tids), dtype=np.float64)
    i = idx.copy()
    active = i < n
    while np.any(active):
        contrib = np.zeros(len(lane_tids), dtype=np.float64)
        contrib[active] = x[i[active]] * y[i[active]]
        total = total + contrib
        i = i + stride
        active = i < n

    offset = WARP_SIZE // 2
    while offset > 0:
        total = total + warp_shfl_down_vec(total, offset)
        offset >>= 1

    # lane_tids[0] is this warp's lane 0 by construction -> total[0] is the
    # fully-reduced value, matching `if (threadIdx.x & 31 == 0) atomicAdd(...)`
    with out_lock:
        out[0] += float(total[0])
