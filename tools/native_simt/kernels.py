"""
Hand-translated kernel bodies.

Each function here is a line-by-line port of the real CUDA in this repo's
external/maxcore/.../gpu/native/cuda/*.cu files onto the engine in
engine.py. The translation is literal: the same index math, the same loop
structure, the same synchronization points -- just CUDA syntax swapped for
the equivalent engine call.
"""
from tools.native_simt.engine import Dim3, WARP_SIZE


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

    total = 0.0
    i = idx
    while i < n:
        total += x[i] * y[i]
        i += stride

    # warp_reduce_sum, via the engine's real per-warp shuffle emulation
    offset = WARP_SIZE // 2
    while offset > 0:
        total += ctx.warp_shfl_down_sync(lane_id, warp_id, total, offset)
        offset >>= 1

    if (tid.x & (WARP_SIZE - 1)) == 0:
        with out_lock:  # atomicAdd(out, sum)
            out[0] += total
