"""
Drives a REAL kernel (the same reduction_redesigned_sm102_kernel_warp
verified earlier this session, itself a line-by-line port of the live
external/maxcore/.../reduction_sm102.cu) through nothing but the actual
CUDA Runtime API surface: cudaMalloc -> cudaMemcpy(H2D) -> cudaLaunchKernel
-> cudaDeviceSynchronize -> cudaMemcpy(D2H) -> cudaFree.

The point being proven: application code written against the real CUDA
Runtime API -- not against tools.native_simt's internal Python calling
convention -- gets a correct result through this backend. That is the
API-compatibility-shim architecture ZLUDA/CuPBoP use, verified for real.
"""
import sys
import os
import threading

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from tools.native_simt.engine import Dim3
from tools.native_simt.kernels import reduction_redesigned_sm102_kernel_warp
from tools.cuda_shim.cuda_runtime_api import CudaRuntimeShim, cudaMemcpyKind


def main():
    cuda = CudaRuntimeShim()

    print(f"cudaGetDeviceCount() = {cuda.cudaGetDeviceCount()}")
    props = cuda.cudaGetDeviceProperties(0)
    print(f"cudaGetDeviceProperties(0) -> name='{props.name}', "
          f"multiProcessorCount={props.multiProcessorCount}, warpSize={props.warpSize}, "
          f"compute capability={props.major}.{props.minor} (0.0 = honestly not real CUDA silicon)\n")

    n = 50_000
    rng = np.random.default_rng(42)
    h_x = rng.random(n, dtype=np.float64)
    h_y = rng.random(n, dtype=np.float64)
    expected = float(np.dot(h_x, h_y))  # independent reference

    nbytes = n * 8
    d_x = cuda.cudaMalloc(nbytes)
    d_y = cuda.cudaMalloc(nbytes)
    d_out = cuda.cudaMalloc(8)
    print(f"cudaMalloc: d_x=0x{d_x:x} d_y=0x{d_y:x} d_out=0x{d_out:x}  ({nbytes} bytes each input)")

    cuda.cudaMemcpy(d_x, h_x.tobytes(), nbytes, cudaMemcpyKind.cudaMemcpyHostToDevice)
    cuda.cudaMemcpy(d_y, h_y.tobytes(), nbytes, cudaMemcpyKind.cudaMemcpyHostToDevice)
    cuda.cudaMemcpy(d_out, np.zeros(1, dtype=np.float64).tobytes(), 8, cudaMemcpyKind.cudaMemcpyHostToDevice)
    print("cudaMemcpy HostToDevice x2 (inputs) + 1 (zeroed accumulator) complete")

    # Views onto the SAME device buffers the kernel will read/write --
    # this is the one place the harness reaches past the pointer opacity a
    # real CUDA app would keep, because our kernel_fn calling convention
    # (from tools.native_simt) takes arrays directly rather than raw
    # pointers + a separate compiled-module handle.
    x_view = cuda.device_array(d_x, np.float64)
    y_view = cuda.device_array(d_y, np.float64)
    out_view = cuda.device_array(d_out, np.float64)
    out_lock = threading.Lock()

    block_dim = Dim3(128)
    grid_dim = Dim3(16)
    print(f"cudaLaunchKernel(reduction_kernel, grid={grid_dim}, block={block_dim}) ...")
    cuda.cudaLaunchKernel(
        reduction_redesigned_sm102_kernel_warp,
        grid_dim, block_dim,
        args=(x_view, y_view, out_view, out_lock, n),
    )
    cuda.cudaDeviceSynchronize()
    print("cudaDeviceSynchronize() complete\n")

    h_result = np.zeros(1, dtype=np.float64)
    result_bytes = bytearray(8)
    cuda.cudaMemcpy(result_bytes, d_out, 8, cudaMemcpyKind.cudaMemcpyDeviceToHost)
    got = np.frombuffer(bytes(result_bytes), dtype=np.float64)[0]

    cuda.cudaFree(d_x)
    cuda.cudaFree(d_y)
    cuda.cudaFree(d_out)
    print("cudaFree x3 complete\n")

    rel_err = abs(got - expected) / abs(expected)
    print(f"expected (independent np.dot reference) = {expected!r}")
    print(f"got      (via full CUDA Runtime API shim) = {got!r}")
    print(f"relative error = {rel_err:.3e}")

    if rel_err < 1e-9:
        print("\nRESULT: PASSED -- real kernel executed correctly end-to-end through "
              "the actual cudaMalloc/cudaMemcpy/cudaLaunchKernel/cudaDeviceSynchronize/"
              "cudaMemcpy/cudaFree API surface.")
    else:
        print("\nRESULT: FAILED -- numeric mismatch")
        sys.exit(1)


if __name__ == "__main__":
    main()
