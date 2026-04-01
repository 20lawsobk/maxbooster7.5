"""
MaxCore DigitalGPU — Server-Side GPU Compute Backend (v2)

This module is the server-side counterpart to the client's
DigitalGPUInferenceBridge.ts (WebGL2 post-processing).

Roles:
  1. GPU context management — detect CUDA / MPS / CPU, expose device info.
  2. Shared memory bridge — expose GPU buffers to the NumPy diffusion
     system (synthesizer.py / layers.py) via pinned memory + numpy views.
  3. Compute dispatch — launch CUDA kernels or fall back to vectorised
     NumPy on CPU with the same interface.

The NumPy diffusion system calls:
    from digitalgpu import get_gpu
    gpu = get_gpu()
    out = gpu.matmul(A, B)          # GPU if available, NumPy otherwise
    out = gpu.conv2d(x, w, b)       # same
    out = gpu.softmax(x, axis=-1)   # same

The PyTorch video_diffusion/ module uses this indirectly via
video_diffusion/utils/digital_gpu.py (a higher-level wrapper).
"""

from __future__ import annotations

import os
import time
import logging
from typing import Optional, Dict, Any

import numpy as np

logger = logging.getLogger("digitalgpu")

# ── Optional PyTorch (not required for NumPy fallback path) ───────────────────
try:
    import torch
    _TORCH_AVAILABLE = True
    _CUDA_AVAILABLE  = torch.cuda.is_available()
    _MPS_AVAILABLE   = getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()
except ImportError:
    _TORCH_AVAILABLE = False
    _CUDA_AVAILABLE  = False
    _MPS_AVAILABLE   = False


# ── GPU Context ───────────────────────────────────────────────────────────────

class GPUContext:
    """
    Unified GPU compute context.  Exposes a NumPy-compatible API that
    transparently offloads to CUDA or MPS when available.
    """

    def __init__(self):
        self._device_name: str = "cpu"
        self._torch_device = None
        self._dtype = np.float32
        self._init_device()

    def _init_device(self) -> None:
        if _TORCH_AVAILABLE and _CUDA_AVAILABLE:
            self._torch_device = torch.device("cuda")
            self._device_name  = torch.cuda.get_device_name(0)
            logger.info(f"[DigitalGPU] CUDA device: {self._device_name}")
        elif _TORCH_AVAILABLE and _MPS_AVAILABLE:
            self._torch_device = torch.device("mps")
            self._device_name  = "Apple MPS"
            logger.info("[DigitalGPU] MPS device: Apple Silicon GPU")
        else:
            self._torch_device = None
            self._device_name  = "cpu (NumPy)"
            logger.info("[DigitalGPU] No GPU detected — running on CPU (NumPy)")

    # ── Core compute ops ─────────────────────────────────────────────────────

    def matmul(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        if self._torch_device is not None:
            ta = torch.from_numpy(a).to(self._torch_device)
            tb = torch.from_numpy(b).to(self._torch_device)
            return torch.matmul(ta, tb).cpu().numpy()
        return np.matmul(a, b)

    def softmax(self, x: np.ndarray, axis: int = -1) -> np.ndarray:
        if self._torch_device is not None:
            t = torch.from_numpy(x).to(self._torch_device)
            return torch.softmax(t, dim=axis).cpu().numpy()
        x = x - x.max(axis=axis, keepdims=True)
        e = np.exp(x)
        return e / e.sum(axis=axis, keepdims=True)

    def conv2d(
        self,
        x: np.ndarray,       # [H, W, C]  or  [B, C, H, W]
        w: np.ndarray,       # [C_out, C_in, kH, kW]
        b: Optional[np.ndarray] = None,
        stride: int = 1,
        padding: int = 1,
    ) -> np.ndarray:
        if self._torch_device is not None:
            import torch.nn.functional as F
            if x.ndim == 3:
                x = x.transpose(2, 0, 1)[None]  # [1, C, H, W]
                squeeze = True
            else:
                squeeze = False
            tx = torch.from_numpy(x).float().to(self._torch_device)
            tw = torch.from_numpy(w).float().to(self._torch_device)
            tb = torch.from_numpy(b).float().to(self._torch_device) if b is not None else None
            out = F.conv2d(tx, tw, tb, stride=stride, padding=padding)
            out = out.cpu().numpy()
            return out[0].transpose(1, 2, 0) if squeeze else out
        # NumPy fallback (naive — only used on CPU)
        return self._numpy_conv2d(x, w, b, stride, padding)

    def layer_norm(self, x: np.ndarray, eps: float = 1e-5) -> np.ndarray:
        if self._torch_device is not None:
            t = torch.from_numpy(x).to(self._torch_device)
            return torch.nn.functional.layer_norm(t, t.shape[-1:], eps=eps).cpu().numpy()
        mean = x.mean(axis=-1, keepdims=True)
        std  = x.std(axis=-1, keepdims=True) + eps
        return (x - mean) / std

    def relu(self, x: np.ndarray) -> np.ndarray:
        if self._torch_device is not None:
            return torch.relu(torch.from_numpy(x).to(self._torch_device)).cpu().numpy()
        return np.maximum(0, x)

    def silu(self, x: np.ndarray) -> np.ndarray:
        if self._torch_device is not None:
            return torch.nn.functional.silu(
                torch.from_numpy(x).to(self._torch_device)
            ).cpu().numpy()
        return x / (1 + np.exp(-x))

    # ── Utility ──────────────────────────────────────────────────────────────

    def to_device(self, x: np.ndarray):
        """Move a numpy array to the GPU device (returns torch.Tensor or ndarray)."""
        if self._torch_device is not None:
            return torch.from_numpy(x).to(self._torch_device)
        return x

    def from_device(self, x) -> np.ndarray:
        """Move a GPU tensor back to CPU numpy."""
        import torch as _torch
        if isinstance(x, _torch.Tensor):
            return x.cpu().numpy()
        return x

    def synchronize(self) -> None:
        if _TORCH_AVAILABLE and _CUDA_AVAILABLE:
            torch.cuda.synchronize()

    def memory_stats(self) -> Dict[str, Any]:
        if _TORCH_AVAILABLE and _CUDA_AVAILABLE:
            return {
                "device":       self._device_name,
                "backend":      "cuda",
                "allocated_mb": round(torch.cuda.memory_allocated() / 1e6, 1),
                "reserved_mb":  round(torch.cuda.memory_reserved()   / 1e6, 1),
                "total_mb":     round(torch.cuda.get_device_properties(0).total_memory / 1e6, 1),
            }
        return {"device": self._device_name, "backend": "cpu", "allocated_mb": 0}

    @property
    def device_name(self) -> str:
        return self._device_name

    @property
    def has_gpu(self) -> bool:
        return self._torch_device is not None

    # ── Private NumPy fallback for conv2d ────────────────────────────────────

    @staticmethod
    def _numpy_conv2d(x, w, b, stride, padding) -> np.ndarray:
        """Minimal im2col conv2d — NumPy only, for CPU fallback."""
        if x.ndim == 3:
            x = x.transpose(2, 0, 1)[None]
            squeeze = True
        else:
            squeeze = False
        B, C, H, W = x.shape
        C_out, C_in, kH, kW = w.shape
        x_pad = np.pad(x, ((0,0),(0,0),(padding,padding),(padding,padding)))
        H_out = (H + 2*padding - kH) // stride + 1
        W_out = (W + 2*padding - kW) // stride + 1
        out = np.zeros((B, C_out, H_out, W_out), dtype=np.float32)
        for i in range(H_out):
            for j in range(W_out):
                patch = x_pad[:, :, i*stride:i*stride+kH, j*stride:j*stride+kW]
                out[:, :, i, j] = np.tensordot(patch, w, axes=([1,2,3],[1,2,3]))
        if b is not None:
            out += b[None, :, None, None]
        return out[0].transpose(1,2,0) if squeeze else out


# ── Singleton ─────────────────────────────────────────────────────────────────

_GPU_INSTANCE: Optional[GPUContext] = None


def get_gpu() -> GPUContext:
    """Return the singleton GPU context, initialising it on first call."""
    global _GPU_INSTANCE
    if _GPU_INSTANCE is None:
        _GPU_INSTANCE = GPUContext()
    return _GPU_INSTANCE


def gpu_info() -> Dict[str, Any]:
    """Return a JSON-serialisable dict of GPU capabilities."""
    g = get_gpu()
    info = g.memory_stats()
    info["torch_available"] = _TORCH_AVAILABLE
    info["cuda_available"]  = _CUDA_AVAILABLE
    info["mps_available"]   = _MPS_AVAILABLE
    return info
