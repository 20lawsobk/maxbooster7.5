"""
MaxCore DigitalGPU — Python Package

Phase 1: LocalCPUBackend (NumPy + OpenBLAS)
Phase 2: LocalGPUBackend (Numba JIT parallel, auto-detecting)
Phase 3: GraphOptimizer + AutoTuner (agent-driven)
Phase 4: MaxCoreTile simulator + RTLGenerator (hardware exploration)

Quick start:
    from digitalgpu import get_gpu
    gpu = get_gpu()                       # Phase 1: CPU backend
    gpu.set_backend(get_best_backend())   # Phase 2: Numba GPU backend
    out = gpu.gemm(A, B)

Graph capture:
    g = gpu.begin_graph("my_graph")
    result = gpu.gemm(A, B)
    gpu.end_graph()
    gpu.run_graph(g)

Optimization (Phase 3):
    from digitalgpu import GraphOptimizer, AutoTuner
    opt = GraphOptimizer(gpu.backend)
    g_opt = opt.optimize(g)
    tuner = AutoTuner(gpu)
    tuner.tune_and_apply()

Hardware (Phase 4):
    from digitalgpu.hardware import MaxCoreTile, PEConfig, RTLGenerator
    tile = MaxCoreTile(PEConfig(array_n=16, freq_ghz=1.0))
    result = tile.gemm(A, B)
    print(result.report())
    rtl = RTLGenerator(tile.config)
    rtl.write('./maxcore_rtl/')
"""

from .digitalgpu import DigitalGPU, get_gpu
from .profiler import Profiler, get_profiler, enable_trace, disable_trace
from .graph import Graph, GraphRecorder
from .backends.cpu_backend import LocalCPUBackend
from .backends.numba_backend import NumbaBackend, NUMBA_AVAILABLE
from .backends.gpu_backend import LocalGPUBackend, get_best_backend
from .optimizer import GraphOptimizer
from .agent_tuner import AutoTuner

__all__ = [
    # Phase 1
    "DigitalGPU", "get_gpu",
    "Profiler", "get_profiler", "enable_trace", "disable_trace",
    "Graph", "GraphRecorder",
    "LocalCPUBackend",
    # Phase 2
    "NumbaBackend", "NUMBA_AVAILABLE",
    "LocalGPUBackend", "get_best_backend",
    # Phase 3
    "GraphOptimizer", "AutoTuner",
    # Phase 4 (via hardware subpackage)
    # from digitalgpu.hardware import MaxCoreTile, PEConfig, RTLGenerator
]
