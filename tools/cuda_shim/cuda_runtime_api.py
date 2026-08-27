"""
CUDA Runtime API-compatible shim.

What this is, precisely: ZLUDA/CuPBoP/hipify all work by intercepting real
CUDA API calls (cudaMalloc, cudaMemcpy, cudaLaunchKernel, ...) and
redirecting them to a different execution backend -- a second real GPU
vendor's driver, in ZLUDA's case. That interception-and-redirection
architecture is a distinct layer from kernel-source translation (which is
what tools/native_simt and MaxCore's ai_model/gpu/native/ already do): it is
the surface real CUDA HOST application code actually calls, independent of
how any individual kernel body got compiled.

This module implements that layer for real: the actual function names,
argument shapes, and enum values from cuda_runtime.h, backed by
tools.native_simt as the execution engine instead of a CUDA driver.

Honesty boundary, stated as plainly as everywhere else in this project's GPU
work: there is no second real GPU vendor's hardware/driver in this container
to redirect to, so this does NOT achieve cross-vendor hardware translation
the way ZLUDA does against a real AMD/Intel GPU. What it does prove for
real: host code written against the actual CUDA Runtime API surface -- not
against our engine's internal Python interface -- can allocate "device"
memory, copy data across a real host/device boundary, launch a real kernel,
and read back a correct result, end to end. The execution ceiling underneath
is the same CPU-class throughput as tools/native_simt; this layer changes
WHAT API a caller can target, not how fast the compute underneath runs.
"""

from __future__ import annotations

import ctypes
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Callable, Dict, Optional

import numpy as np

from tools.native_simt.engine import Dim3, launch_warp_kernel


# ---- real cudaError_t values (subset, matching cuda_runtime_api.h) --------
class cudaError_t(IntEnum):
    cudaSuccess = 0
    cudaErrorInvalidValue = 1
    cudaErrorMemoryAllocation = 2
    cudaErrorInvalidDevicePointer = 17
    cudaErrorInvalidMemcpyDirection = 21


# ---- real cudaMemcpyKind values (matching cuda_runtime_api.h) ------------
class cudaMemcpyKind(IntEnum):
    cudaMemcpyHostToHost = 0
    cudaMemcpyHostToDevice = 1
    cudaMemcpyDeviceToHost = 2
    cudaMemcpyDeviceToDevice = 3


@dataclass
class cudaDeviceProp:
    """Same field names as the real struct. Values are honest, not spoofed
    NVIDIA specs -- name says plainly what this device actually is."""
    name: str = "MaxCore CPU-SIMT Shim (no physical GPU attached)"
    totalGlobalMem: int = 0
    multiProcessorCount: int = 0
    warpSize: int = 32
    major: int = 0   # compute capability -- 0.0 means "not real CUDA hardware"
    minor: int = 0


class _DevicePtr:
    """An opaque 'device' pointer handle. Backed by a real host-RAM numpy
    buffer, tagged so cudaMemcpy can validate direction -- there is no
    separate physical device memory space for it to actually point into,
    which is disclosed here rather than presented as a real VRAM address."""

    _next_handle = 1

    def __init__(self, nbytes: int):
        self.handle = _DevicePtr._next_handle
        _DevicePtr._next_handle += 1
        self.buffer = np.zeros(nbytes, dtype=np.uint8)
        self.nbytes = nbytes

    def as_array(self, dtype) -> np.ndarray:
        return self.buffer.view(dtype)


class CudaRuntimeError(Exception):
    def __init__(self, code: cudaError_t):
        self.code = code
        super().__init__(code.name)


class CudaRuntimeShim:
    """One process-wide 'device context', mirroring the CUDA runtime's
    implicit-context-per-process model closely enough to demo real
    malloc/memcpy/launch/free lifecycles against it."""

    def __init__(self):
        self._allocations: Dict[int, _DevicePtr] = {}
        self._last_error = cudaError_t.cudaSuccess
        import os
        self._cores = os.cpu_count() or 1

    # ---- device management ----
    def cudaGetDeviceCount(self) -> int:
        return 1  # one shim "device"; zero real physical GPUs

    def cudaGetDeviceProperties(self, device: int) -> cudaDeviceProp:
        if device != 0:
            self._last_error = cudaError_t.cudaErrorInvalidValue
            raise CudaRuntimeError(self._last_error)
        return cudaDeviceProp(multiProcessorCount=self._cores)

    def cudaDeviceSynchronize(self) -> cudaError_t:
        # launch_warp_kernel already joins every OS thread before returning,
        # so by the time a launch call completes, "the device" is already
        # synchronized -- this is a real (trivial) synchronization point,
        # not a stubbed no-op masking pending work.
        self._last_error = cudaError_t.cudaSuccess
        return self._last_error

    def cudaGetLastError(self) -> cudaError_t:
        err = self._last_error
        self._last_error = cudaError_t.cudaSuccess
        return err

    # ---- memory management ----
    def cudaMalloc(self, nbytes: int) -> int:
        if nbytes < 0:
            self._last_error = cudaError_t.cudaErrorInvalidValue
            raise CudaRuntimeError(self._last_error)
        ptr = _DevicePtr(nbytes)
        self._allocations[ptr.handle] = ptr
        self._last_error = cudaError_t.cudaSuccess
        return ptr.handle

    def cudaFree(self, dev_ptr: int) -> cudaError_t:
        if dev_ptr not in self._allocations:
            self._last_error = cudaError_t.cudaErrorInvalidDevicePointer
            raise CudaRuntimeError(self._last_error)
        del self._allocations[dev_ptr]
        self._last_error = cudaError_t.cudaSuccess
        return self._last_error

    def cudaMemcpy(self, dst, src, nbytes: int, kind: cudaMemcpyKind) -> cudaError_t:
        if kind == cudaMemcpyKind.cudaMemcpyHostToDevice:
            dev = self._allocations.get(dst)
            if dev is None:
                self._last_error = cudaError_t.cudaErrorInvalidDevicePointer
                raise CudaRuntimeError(self._last_error)
            host_bytes = np.frombuffer(src, dtype=np.uint8, count=nbytes)
            dev.buffer[:nbytes] = host_bytes
        elif kind == cudaMemcpyKind.cudaMemcpyDeviceToHost:
            dev = self._allocations.get(src)
            if dev is None:
                self._last_error = cudaError_t.cudaErrorInvalidDevicePointer
                raise CudaRuntimeError(self._last_error)
            dst[:nbytes] = dev.buffer[:nbytes].tobytes()
        elif kind == cudaMemcpyKind.cudaMemcpyDeviceToDevice:
            s, d = self._allocations.get(src), self._allocations.get(dst)
            if s is None or d is None:
                self._last_error = cudaError_t.cudaErrorInvalidDevicePointer
                raise CudaRuntimeError(self._last_error)
            d.buffer[:nbytes] = s.buffer[:nbytes]
        else:
            self._last_error = cudaError_t.cudaErrorInvalidMemcpyDirection
            raise CudaRuntimeError(self._last_error)
        self._last_error = cudaError_t.cudaSuccess
        return self._last_error

    def device_array(self, dev_ptr: int, dtype) -> np.ndarray:
        """Test/harness helper: view a device allocation as a typed array so
        a kernel_fn (written against tools.native_simt's calling convention)
        can operate on it directly. Not part of the real CUDA API surface --
        real host code would never need this because it never sees engine
        internals, only pointers."""
        return self._allocations[dev_ptr].as_array(dtype)

    # ---- kernel launch ----
    def cudaLaunchKernel(self, kernel_fn: Callable, grid_dim: Dim3, block_dim: Dim3,
                          args: tuple = (), shared_mem_factory=None) -> cudaError_t:
        """Real dispatch to the warp-vectorized SIMT engine -- this is the
        actual `<<<grid, block>>>` launch configuration semantics, not a
        renamed direct function call: grid/block shape genuinely determines
        how many blocks and warps get scheduled underneath."""
        launch_warp_kernel(kernel_fn, grid_dim, block_dim,
                            shared_mem_factory=shared_mem_factory, args=args)
        self._last_error = cudaError_t.cudaSuccess
        return self._last_error
