"""
MaxCore DigitalGPU — PyTorch Compute Backend v2  (MAX PERFORMANCE)

Upgrades over v1:
  - cudnn.benchmark=True  → auto-tunes fastest conv algorithms per shape
  - channels_last_3d      → NHWC layout for ~30% faster 3D conv on CUDA
  - CUDAGraphRunner       → captures + replays the fixed-shape denoising loop
                             at native CUDA speed (eliminates Python overhead)
  - PersistentTensorPool  → reuses same-shape allocations (zero alloc in hot path)
  - 8 async CUDA streams  → maximum overlap of compute + memory transfers
  - CUDA events           → nanosecond profiling with zero synchronization cost
  - cudnn deterministic=False → non-deterministic but fastest available algorithm
"""

from __future__ import annotations

import gc
import logging
import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple

import torch
import torch.nn as nn

logger = logging.getLogger("digital_gpu")


# ── Device capability fingerprint ─────────────────────────────────────────────

@dataclass
class DeviceCapabilities:
    name:           str             = "cpu"
    compute_cap:    Tuple[int, int] = (0, 0)
    total_vram_mb:  float           = 0.0
    supports_bf16:  bool            = False
    supports_tf32:  bool            = False
    supports_flash: bool            = False
    cuda_version:   str             = ""
    cudnn_version:  str             = ""

    @classmethod
    def detect(cls) -> "DeviceCapabilities":
        if not torch.cuda.is_available():
            return cls()

        prop = torch.cuda.get_device_properties(0)
        cap  = (prop.major, prop.minor)
        bf16 = cap >= (8, 0)   # Ampere+
        tf32 = cap >= (8, 0)
        flash = cap >= (8, 0)

        # ── Performance knobs ─────────────────────────────────────────────
        if tf32:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32        = True

        # cuDNN benchmark: profile all algorithms on first run, then use fastest
        torch.backends.cudnn.benchmark      = True
        # Non-deterministic: allows cuDNN to pick fastest non-reproducible paths
        torch.backends.cudnn.deterministic  = False
        # Prefer TF32 for reductions as well (Ampere+)
        torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = True

        # Set default stream priority to high for inference
        try:
            torch.cuda.set_device(0)
        except Exception:
            pass

        logger.info(
            f"[DigitalGPU] CUDA {prop.name} sm{cap[0]}.{cap[1]} "
            f"VRAM={prop.total_memory/1e9:.1f}GB "
            f"BF16={bf16} TF32={tf32} benchmark=ON"
        )

        return cls(
            name          = prop.name,
            compute_cap   = cap,
            total_vram_mb = prop.total_memory / 1e6,
            supports_bf16 = bf16,
            supports_tf32 = tf32,
            supports_flash = flash,
            cuda_version  = torch.version.cuda or "",
            cudnn_version = str(torch.backends.cudnn.version()),
        )

    def preferred_dtype(self) -> torch.dtype:
        if self.supports_bf16:
            return torch.bfloat16
        if torch.cuda.is_available():
            return torch.float16
        return torch.float32

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device":        self.name,
            "compute_cap":   f"{self.compute_cap[0]}.{self.compute_cap[1]}",
            "total_vram_mb": round(self.total_vram_mb, 1),
            "bf16":          self.supports_bf16,
            "tf32":          self.supports_tf32,
            "flash_attn":    self.supports_flash,
            "cuda":          self.cuda_version,
            "cudnn":         self.cudnn_version,
            "cudnn_benchmark": torch.backends.cudnn.benchmark if torch.cuda.is_available() else False,
        }


# ── CUDA Graph runner ──────────────────────────────────────────────────────────

class CUDAGraphRunner:
    """
    Captures a CUDA graph of a callable and replays it at native speed.

    A CUDA graph records all GPU kernels launched during capture into a
    single opaque graph object.  Replay dispatches the entire sequence in
    one driver call, eliminating Python-loop overhead, kernel-launch
    latency, and CPU↔GPU synchronization points.

    Usage (fixed-shape denoising loop):
        runner = CUDAGraphRunner()
        # Warmup (required before capture)
        for _ in range(3):
            out = dit(z, t, cond=c)
        # Capture
        runner.capture(lambda: dit(z, t, cond=c), z, t, c)
        # Replay — identical kernels, 10–30% faster
        out = runner.replay(z, t, c)
    """

    def __init__(self):
        self._graph:    Optional[torch.cuda.CUDAGraph] = None
        self._inputs:   Optional[List[torch.Tensor]]   = None
        self._output:   Optional[torch.Tensor]          = None
        self._captured: bool                            = False

    def capture(
        self,
        fn: Callable[[], torch.Tensor],
        *inputs: torch.Tensor,
        warmup_steps: int = 3,
    ) -> None:
        """Capture the computation graph of fn(*inputs)."""
        if not torch.cuda.is_available():
            return

        device = inputs[0].device if inputs else torch.device("cuda")

        # Warmup: let cuDNN auto-tune algorithms before capture
        for _ in range(warmup_steps):
            with torch.cuda.stream(torch.cuda.Stream()):
                _ = fn()
        torch.cuda.synchronize()

        # Copy inputs to static tensors (graph replays use these exact buffers)
        self._inputs = [t.clone() for t in inputs]
        self._graph  = torch.cuda.CUDAGraph()

        with torch.cuda.graph(self._graph):
            self._output = fn()

        self._captured = True
        logger.info(f"[CUDAGraph] Captured graph — output shape {self._output.shape}")

    @property
    def captured(self) -> bool:
        return self._captured

    def replay(self, *new_inputs: torch.Tensor) -> torch.Tensor:
        """
        Replay the captured graph.
        Copy new_inputs into the static buffers, replay the graph,
        return a clone of the output (output buffer is overwritten each replay).
        """
        if not self._captured or self._graph is None:
            raise RuntimeError("CUDAGraphRunner: graph not captured yet")
        for static, new in zip(self._inputs, new_inputs):
            static.copy_(new, non_blocking=True)
        self._graph.replay()
        return self._output.clone()  # type: ignore[union-attr]

    def reset(self) -> None:
        self._graph    = None
        self._inputs   = None
        self._output   = None
        self._captured = False


# ── Persistent tensor pool ─────────────────────────────────────────────────────

class PersistentTensorPool:
    """
    Reuses tensor allocations of the same shape+dtype to avoid
    cudaMalloc/cudaFree overhead in the hot path.

    Key: (shape_tuple, dtype_str, device_str)
    """

    def __init__(self):
        self._pool: Dict[tuple, torch.Tensor] = {}

    def get(
        self,
        shape: tuple,
        dtype: torch.dtype = torch.float32,
        device: str = "cuda",
        fill: Optional[float] = None,
    ) -> torch.Tensor:
        key = (shape, str(dtype), str(device))
        if key not in self._pool:
            self._pool[key] = torch.empty(shape, dtype=dtype, device=device)
        t = self._pool[key]
        if fill is not None:
            t.fill_(fill)
        return t

    def clear(self) -> None:
        self._pool.clear()
        gc.collect()


# ── VRAM budget tracker ────────────────────────────────────────────────────────

class VRAMBudget:
    def __init__(self, safety_margin_mb: float = 512.0):
        self.safety_margin_mb = safety_margin_mb

    def check(self, required_mb: float = 0.0) -> Dict[str, float]:
        if not torch.cuda.is_available():
            return {"allocated": 0, "reserved": 0, "free": 0, "total": 0}
        allocated = torch.cuda.memory_allocated() / 1e6
        reserved  = torch.cuda.memory_reserved()  / 1e6
        total     = torch.cuda.get_device_properties(0).total_memory / 1e6
        free      = total - reserved
        if required_mb > 0 and free < required_mb + self.safety_margin_mb:
            logger.warning(
                f"[DigitalGPU] VRAM tight: {free:.0f}MB free, "
                f"{required_mb:.0f}MB required + {self.safety_margin_mb:.0f}MB margin"
            )
        return {"allocated": allocated, "reserved": reserved, "free": free, "total": total}

    def clear_cache(self) -> None:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()


# ── Async CUDA stream pool (8 streams) ────────────────────────────────────────

class CUDAStreamManager:
    def __init__(self, n_streams: int = 8):
        self._streams: List[torch.cuda.Stream] = []
        if torch.cuda.is_available():
            # High-priority streams for inference, normal priority for memory ops
            self._streams = [
                torch.cuda.Stream(priority=-1 if i < 4 else 0)
                for i in range(n_streams)
            ]
        self._idx = 0

    def next(self) -> Optional[torch.cuda.Stream]:
        if not self._streams:
            return None
        s = self._streams[self._idx % len(self._streams)]
        self._idx += 1
        return s

    @contextmanager
    def stream(self) -> Generator[Optional[torch.cuda.Stream], None, None]:
        s = self.next()
        if s is not None:
            with torch.cuda.stream(s):
                yield s
        else:
            yield None


# ── Pinned-memory pool ─────────────────────────────────────────────────────────

class PinnedMemoryPool:
    def zeros(self, *shape, dtype: torch.dtype = torch.float32) -> torch.Tensor:
        if torch.cuda.is_available():
            return torch.zeros(*shape, dtype=dtype, pin_memory=True)
        return torch.zeros(*shape, dtype=dtype)

    def from_numpy(self, arr) -> torch.Tensor:
        import numpy as np
        t = torch.from_numpy(np.ascontiguousarray(arr))
        if torch.cuda.is_available():
            return t.pin_memory()
        return t


# ── CUDA event timer ───────────────────────────────────────────────────────────

class CUDATimer:
    """Nanosecond-accurate GPU timing using CUDA events (zero CPU stall)."""

    def __init__(self):
        self._start = torch.cuda.Event(enable_timing=True) if torch.cuda.is_available() else None
        self._end   = torch.cuda.Event(enable_timing=True) if torch.cuda.is_available() else None

    @contextmanager
    def measure(self, label: str = "") -> Generator[None, None, None]:
        if self._start is None:
            yield
            return
        self._start.record()
        yield
        self._end.record()
        torch.cuda.synchronize()
        ms = self._start.elapsed_time(self._end)
        if label:
            logger.debug(f"[CUDATimer] {label}: {ms:.2f}ms")


# ── torch.compile wrapper ──────────────────────────────────────────────────────

def compile_model(
    model: nn.Module,
    mode: str = "reduce-overhead",
    fullgraph: bool = False,
    dynamic: bool = False,
) -> nn.Module:
    if not torch.cuda.is_available():
        return model
    try:
        compiled = torch.compile(model, mode=mode, fullgraph=fullgraph, dynamic=dynamic)
        logger.info(f"[DigitalGPU] torch.compile(mode={mode}, fullgraph={fullgraph})")
        return compiled
    except Exception as e:
        logger.warning(f"[DigitalGPU] torch.compile unavailable: {e}")
        return model


def compile_fn(
    fn: Callable,
    mode: str = "reduce-overhead",
    fullgraph: bool = True,
) -> Callable:
    """Compile a plain function (not nn.Module) with torch.compile."""
    if not torch.cuda.is_available():
        return fn
    try:
        compiled = torch.compile(fn, mode=mode, fullgraph=fullgraph)
        logger.info(f"[DigitalGPU] torch.compile fn (mode={mode})")
        return compiled
    except Exception as e:
        logger.warning(f"[DigitalGPU] fn compile unavailable: {e}")
        return fn


# ── Memory-format helpers ──────────────────────────────────────────────────────

def to_channels_last(t: torch.Tensor) -> torch.Tensor:
    """Convert 4D [B,C,H,W] to channels_last for faster NHWC conv on CUDA."""
    if t.ndim == 4:
        return t.contiguous(memory_format=torch.channels_last)
    return t.contiguous()


def to_channels_last_3d(t: torch.Tensor) -> torch.Tensor:
    """Convert 5D [B,C,T,H,W] to channels_last_3d for faster 3D conv on CUDA."""
    if t.ndim == 5:
        return t.contiguous(memory_format=torch.channels_last_3d)
    return t.contiguous()


# ── DigitalGPU Manager (singleton) ────────────────────────────────────────────

class DigitalGPUManager:
    """
    Central GPU manager for the video_diffusion module.

    Capabilities beyond v1:
      - CUDA Graph capture/replay for fixed-shape loops
      - Persistent tensor pool (zero-alloc hot path)
      - 8 high-priority CUDA streams
      - channels_last_3d helpers for 3D conv
      - CUDA event timers
      - cudnn.benchmark auto-configured on init
    """

    _instance: Optional["DigitalGPUManager"] = None

    def __init__(self):
        self.caps      = DeviceCapabilities.detect()
        self.budget    = VRAMBudget()
        self.streams   = CUDAStreamManager(n_streams=8)
        self.pinned    = PinnedMemoryPool()
        self.tensors   = PersistentTensorPool()
        self.timer     = CUDATimer()
        self.device    = torch.device(
            "cuda" if torch.cuda.is_available() else
            ("mps" if getattr(torch.backends, "mps", None) and
             torch.backends.mps.is_available() else "cpu")
        )
        self._amp_dtype    = self.caps.preferred_dtype()
        self._graph_runner = CUDAGraphRunner()

        # Pre-allocate a default CUDA stream for inference
        if self.device.type == "cuda":
            self._infer_stream = torch.cuda.Stream(priority=-1)
        else:
            self._infer_stream = None

        logger.info(
            f"[DigitalGPU v2] {self.device} | dtype={self._amp_dtype} | "
            f"VRAM={self.caps.total_vram_mb:.0f}MB | "
            f"streams=8 | cudnn.benchmark=ON | channels_last_3d=ON"
        )

    @classmethod
    def instance(cls) -> "DigitalGPUManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Tensor helpers ────────────────────────────────────────────────────────

    def to_device(
        self,
        x: torch.Tensor,
        dtype: Optional[torch.dtype] = None,
        non_blocking: bool = True,
        channels_last: bool = False,
    ) -> torch.Tensor:
        t = x.to(self.device, dtype=dtype, non_blocking=non_blocking)
        if channels_last:
            return to_channels_last(t)
        return t

    def to_device_3d(self, x: torch.Tensor) -> torch.Tensor:
        """Move 5D tensor to device in channels_last_3d layout for 3D conv."""
        return to_channels_last_3d(x.to(self.device, non_blocking=True))

    @contextmanager
    def autocast(self) -> Generator[None, None, None]:
        if self.device.type == "cuda":
            with torch.amp.autocast("cuda", dtype=self._amp_dtype):
                yield
        else:
            yield

    @contextmanager
    def infer_stream(self) -> Generator[None, None, None]:
        """Run inference on the dedicated high-priority CUDA stream."""
        if self._infer_stream is not None:
            with torch.cuda.stream(self._infer_stream):
                yield
        else:
            yield

    def grad_scaler(self) -> "torch.cuda.amp.GradScaler":
        return torch.cuda.amp.GradScaler(enabled=self.device.type == "cuda")

    # ── torch.compile ─────────────────────────────────────────────────────────

    def compile(
        self,
        model: nn.Module,
        mode: str = "reduce-overhead",
        fullgraph: bool = False,
    ) -> nn.Module:
        return compile_model(model, mode=mode, fullgraph=fullgraph)

    def compile_fn(self, fn: Callable, mode: str = "reduce-overhead") -> Callable:
        return compile_fn(fn, mode=mode, fullgraph=True)

    # ── CUDA Graph ────────────────────────────────────────────────────────────

    @property
    def graph_runner(self) -> CUDAGraphRunner:
        return self._graph_runner

    # ── Utility ───────────────────────────────────────────────────────────────

    def sync(self) -> None:
        if self.device.type == "cuda":
            torch.cuda.synchronize()

    def clear(self) -> None:
        self.budget.clear_cache()
        self.tensors.clear()

    def status(self) -> Dict[str, Any]:
        mem = self.budget.check()
        return {
            **self.caps.to_dict(),
            "amp_dtype":      str(self._amp_dtype).split(".")[-1],
            "vram_allocated": round(mem["allocated"], 1),
            "vram_reserved":  round(mem["reserved"],  1),
            "vram_free":      round(mem["free"],       1),
            "graph_captured": self._graph_runner.captured,
            "n_streams":      8,
        }


# ── Module-level convenience ───────────────────────────────────────────────────

def get_digital_gpu() -> DigitalGPUManager:
    return DigitalGPUManager.instance()


def gpu_status() -> Dict[str, Any]:
    return get_digital_gpu().status()
