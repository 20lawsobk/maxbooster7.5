"""
MaxCore DigitalGPU — Main API

The DigitalGPU is the stable runtime façade for all MaxCore compute ops.
It is backend-agnostic: the same API works across:

  LocalCPUBackend    → NumPy + OpenBLAS (current, Phase 1)
  LocalGPUBackend    → Triton / PyTorch CUDA (Phase 2)
  ClusterBackend     → DeepSpeed / Megatron (Phase 2)
  WebGLBackend       → Browser-side inference via WebGL2 (future)
  MaxCoreHWBackend   → First silicon (Phase 4)

MaxCore ISA ops exposed here:
  TMM    → gemm()
  TCONV  → conv2d()
  TATTN  → attention()
  REDUCE → reduce()
  ACT    → act()

Graph APIs:
  begin_graph() / end_graph() / run_graph()

Profiling:
  profiler    → Profiler instance (always live)
  report()    → print kernel stats
"""

import numpy as np
from typing import Optional, Dict, Any

from .profiler import Profiler, get_profiler
from .graph import Graph, GraphRecorder
from .backends.cpu_backend import LocalCPUBackend


class DigitalGPU:
    """
    The MaxCore runtime façade.

    All ops route through the active backend and are tracked by the profiler.
    When a graph is being recorded, ops are also captured as graph nodes.

    Usage:
        gpu = DigitalGPU()

        # Direct execution
        C = gpu.gemm(A, B, bias=b)
        out, weights = gpu.attention(Q, K, V, scale=0.125)

        # Graph capture + replay
        g = gpu.begin_graph("unet_fwd")
        ... forward pass ...
        gpu.end_graph()
        gpu.run_graph(g)
    """

    def __init__(self, backend=None, profiler: Optional[Profiler] = None):
        self.backend  = backend or LocalCPUBackend()
        self.profiler = profiler or get_profiler()
        self._recorder = GraphRecorder()
        self._backend_name = self.backend.name

    def set_backend(self, backend):
        """Hot-swap the backend at runtime. All future ops use the new backend."""
        self.backend       = backend
        self._backend_name = backend.name

    @property
    def is_recording(self) -> bool:
        return self._recorder.is_recording

    def begin_graph(self, name: str = "graph") -> Graph:
        """Start recording a new execution graph. Returns the Graph object."""
        g = Graph(name=name)
        self._recorder.begin(g)
        return g

    def end_graph(self) -> Graph:
        """Stop recording. Returns the completed Graph."""
        return self._recorder.end()

    def run_graph(self, graph: Graph):
        """Replay a previously recorded graph."""
        return graph.run()

    def report(self) -> str:
        """Print a formatted profiling report to stdout and return the string."""
        r = self.profiler.report()
        print(r)
        return r

    def reset_profiler(self):
        self.profiler.reset()

    def gemm(self, A: np.ndarray, B: np.ndarray,
             bias: np.ndarray = None,
             dtype: np.dtype = np.float32) -> np.ndarray:
        """
        TMM — Tensor Matrix Multiply.
        C = A @ B [+ bias]
        """
        A_shape = A.shape
        B_shape = B.shape
        M = int(np.prod(A_shape[:-1]))
        K = A_shape[-1]
        N = B_shape[-1] if len(B_shape) > 1 else B_shape[0]

        flops    = LocalCPUBackend.flops_gemm(M, N, K)
        bin_, bout = LocalCPUBackend.bytes_gemm(M, N, K, itemsize=A.itemsize)

        def _op(A, B, bias, dtype):
            return self.backend.gemm(A, B, bias=bias, dtype=dtype)

        with self.profiler.record("gemm", flops=flops,
                                  bytes_in=bin_, bytes_out=bout,
                                  shape_in=A_shape, shape_out=(M, N),
                                  backend=self._backend_name):
            if self._recorder.is_recording:
                return self._recorder.record_node(
                    "gemm", _op, (A, B, bias, dtype), {}, flops=flops)
            return self.backend.gemm(A, B, bias=bias, dtype=dtype)

    def attention(self, Q: np.ndarray, K: np.ndarray, V: np.ndarray,
                  scale: float,
                  mask: np.ndarray = None,
                  dtype: np.dtype = np.float32):
        """
        TATTN — Fused attention: softmax(QK^T / scale) @ V.
        Q, K, V: [N, h, d]
        Returns: (output [N, h, d], weights [h, N, N])
        """
        N, h, d = Q.shape
        flops = LocalCPUBackend.flops_attention(N, h, d)
        bin_  = (Q.nbytes + K.nbytes + V.nbytes)
        bout  = Q.nbytes  # output same shape as Q

        def _op(Q, K, V, scale, mask, dtype):
            return self.backend.attention(Q, K, V, scale=scale,
                                          mask=mask, dtype=dtype)

        with self.profiler.record("attention", flops=flops,
                                  bytes_in=bin_, bytes_out=bout,
                                  shape_in=Q.shape, shape_out=Q.shape,
                                  backend=self._backend_name):
            if self._recorder.is_recording:
                return self._recorder.record_node(
                    "attention", _op, (Q, K, V, scale, mask, dtype), {},
                    flops=flops)
            return self.backend.attention(Q, K, V, scale=scale,
                                          mask=mask, dtype=dtype)

    def conv2d(self, cols: np.ndarray, W: np.ndarray,
               bias: np.ndarray = None,
               dtype: np.dtype = np.float32) -> np.ndarray:
        """
        TCONV — Convolution via im2col + GEMM.
        cols: [H_out*W_out, kH*kW*C_in]
        W:    [C_out, kH*kW*C_in]
        """
        M = cols.shape[0]
        K = cols.shape[1]
        N = W.shape[0]

        flops    = LocalCPUBackend.flops_gemm(M, N, K)
        bin_, bout = LocalCPUBackend.bytes_gemm(M, N, K, itemsize=cols.itemsize)

        def _op(cols, W, bias, dtype):
            return self.backend.conv2d_im2col(cols, W, bias=bias, dtype=dtype)

        with self.profiler.record("conv2d", flops=flops,
                                  bytes_in=bin_, bytes_out=bout,
                                  shape_in=cols.shape, shape_out=(M, N),
                                  backend=self._backend_name):
            if self._recorder.is_recording:
                return self._recorder.record_node(
                    "conv2d", _op, (cols, W, bias, dtype), {}, flops=flops)
            return self.backend.conv2d_im2col(cols, W, bias=bias, dtype=dtype)

    def reduce(self, x: np.ndarray, op: str = 'sum',
               axis: int = -1, keepdims: bool = False,
               dtype: np.dtype = np.float32) -> np.ndarray:
        """REDUCE — Deterministic reduction (sum / max / mean / min)."""
        flops = x.size  # one op per element (approximate)
        with self.profiler.record("reduce", flops=flops,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes // max(1, x.shape[axis]),
                                  shape_in=x.shape, shape_out=(),
                                  backend=self._backend_name):
            return self.backend.reduce(x, op=op, axis=axis,
                                       keepdims=keepdims, dtype=dtype)

    def softmax(self, x: np.ndarray, axis: int = -1,
                dtype: np.dtype = np.float32) -> np.ndarray:
        """Numerically stable softmax (fused exp + sum + div)."""
        flops = 5 * x.size  # sub + exp + sum + div
        with self.profiler.record("softmax", flops=flops,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes,
                                  shape_in=x.shape, shape_out=x.shape,
                                  backend=self._backend_name):
            return self.backend.softmax(x, axis=axis, dtype=dtype)

    def act(self, x: np.ndarray, kind: str = 'silu',
            dtype: np.dtype = np.float32) -> np.ndarray:
        """ACT — Fused activation: silu | gelu | relu."""
        flops = 4 * x.size  # approximate for SiLU
        with self.profiler.record(f"act_{kind}", flops=flops,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes,
                                  shape_in=x.shape, shape_out=x.shape,
                                  backend=self._backend_name):
            return self.backend.act(x, kind=kind, dtype=dtype)

    def layer_norm(self, x: np.ndarray, gamma: np.ndarray,
                   beta: np.ndarray, axis: int = -1,
                   eps: float = 1e-5,
                   dtype: np.dtype = np.float32) -> np.ndarray:
        """Layer normalization."""
        flops = 5 * x.size
        with self.profiler.record("layer_norm", flops=flops,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes,
                                  shape_in=x.shape, shape_out=x.shape,
                                  backend=self._backend_name):
            return self.backend.layer_norm(x, gamma, beta,
                                           axis=axis, eps=eps, dtype=dtype)

    def upsample2x(self, x: np.ndarray) -> np.ndarray:
        """Nearest-neighbor 2× spatial upsample."""
        H, W, C = x.shape
        with self.profiler.record("upsample2x", flops=H * W * C,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes * 4,
                                  shape_in=x.shape, shape_out=(H*2, W*2, C),
                                  backend=self._backend_name):
            return self.backend.upsample2x(x)

    def pool2x(self, x: np.ndarray) -> np.ndarray:
        """Max pooling 2×2."""
        H, W, C = x.shape
        with self.profiler.record("pool2x", flops=4 * (H//2) * (W//2) * C,
                                  bytes_in=x.nbytes, bytes_out=x.nbytes // 4,
                                  shape_in=x.shape, shape_out=(H//2, W//2, C),
                                  backend=self._backend_name):
            return self.backend.pool2x(x)

    def element_add(self, A: np.ndarray, B: np.ndarray,
                    dtype: np.dtype = np.float32) -> np.ndarray:
        flops = A.size
        with self.profiler.record("add", flops=flops,
                                  bytes_in=A.nbytes + B.nbytes,
                                  bytes_out=A.nbytes,
                                  shape_in=A.shape, shape_out=A.shape,
                                  backend=self._backend_name):
            return self.backend.element_add(A, B, dtype=dtype)

    def upgrade_to_gpu(self) -> str:
        """
        Phase 2: Upgrade to the best available local GPU backend.
        Detects Numba JIT and switches automatically.
        Returns the name of the backend selected.
        """
        from .backends.gpu_backend import LocalGPUBackend
        new_backend = LocalGPUBackend()
        self.set_backend(new_backend)
        return new_backend.name

    def optimize_graph(self, graph: Graph,
                       passes=('fusion', 'dead_code', 'tile_search'),
                       verbose: bool = False) -> Graph:
        """
        Phase 3: Run the GraphOptimizer on a recorded graph.
        Returns an optimized copy of the graph.
        """
        from .optimizer import GraphOptimizer
        opt = GraphOptimizer(self.backend, self.profiler, verbose=verbose)
        return opt.optimize(graph, passes=passes)

    def auto_tune(self, n_trials: int = 5,
                  verbose: bool = True) -> Dict[str, Any]:
        """
        Phase 3: Run the AutoTuner agent.
        Profiles hot kernels, grid-searches configs, persists best config.
        Returns dict of TuneResult objects.
        """
        from .agent_tuner import AutoTuner
        tuner = AutoTuner(self, n_top_kernels=5, verbose=verbose)
        return tuner.tune_and_apply(n_trials=n_trials)

    def hardware_sim(self, array_n: int = 16,
                     freq_ghz: float = 1.0) -> 'MaxCoreTile':
        """
        Phase 4: Create a MaxCore tile simulator.
        Returns a MaxCoreTile instance for cycle-accurate GEMM simulation.
        """
        from .hardware.maxcore_tile import MaxCoreTile, PEConfig
        return MaxCoreTile(PEConfig(array_n=array_n, freq_ghz=freq_ghz))

    def generate_rtl(self, array_n: int = 16, freq_ghz: float = 1.0,
                     output_dir: str = './maxcore_rtl/') -> str:
        """
        Phase 4: Generate SystemVerilog RTL for a MaxCore tile.
        Writes .sv files to output_dir. Returns the output directory path.
        """
        from .hardware.maxcore_tile import PEConfig
        from .hardware.rtl_gen import RTLGenerator
        config = PEConfig(array_n=array_n, freq_ghz=freq_ghz)
        gen = RTLGenerator(config)
        gen.generate_all()
        return gen.write(output_dir=output_dir)


_global_gpu: Optional[DigitalGPU] = None


def get_gpu() -> DigitalGPU:
    """Return the global DigitalGPU singleton (creates it on first call)."""
    global _global_gpu
    if _global_gpu is None:
        _global_gpu = DigitalGPU()
    return _global_gpu
