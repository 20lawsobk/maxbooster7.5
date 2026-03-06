"""
MaxCore DigitalGPU — Python Package

Exposes the DigitalGPU singleton and key types.
Import pattern inside the diffusion stack:

    from server.services.digitalgpu import get_gpu
    gpu = get_gpu()
    out = gpu.gemm(A, B, bias=b)

Or from within the diffusion/ subdirectory:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
    from digitalgpu import get_gpu
"""

from .digitalgpu import DigitalGPU, get_gpu
from .profiler import Profiler, get_profiler, enable_trace, disable_trace
from .graph import Graph, GraphRecorder
from .backends.cpu_backend import LocalCPUBackend

__all__ = [
    "DigitalGPU",
    "get_gpu",
    "Profiler",
    "get_profiler",
    "enable_trace",
    "disable_trace",
    "Graph",
    "GraphRecorder",
    "LocalCPUBackend",
]
