"""
Shared HyperGPU sizing helper.

`HYPER_GPU_LANES`/`HYPER_GPU_TENSOR_CORES` are derived from host CPU capacity
by the Node supervisor that spawns this process (server/computeSizing.ts —
the single shared compute-sizing source also used by the main app's own Node
cluster and by this same supervisor's own worker-count decision) and
forwarded down via env inheritance. Every HyperGPU/HyperGPUBackend
construction site in this process should read its lanes/tensor_cores through
this helper instead of a local hardcoded literal or its own `os.environ.get`
call, so there is exactly one place to change the env var names or default
fallback.

Defaults (512 lanes / 8 tensor cores) preserve prior behavior for any caller
that runs this process directly without going through that supervisor.
"""
from __future__ import annotations

import os


def hyper_gpu_sizing() -> tuple[int, int]:
    """Return (lanes, tensor_cores) for constructing a HyperGPU/HyperGPUBackend."""
    lanes = int(os.environ.get("HYPER_GPU_LANES", "512"))
    tensor_cores = int(os.environ.get("HYPER_GPU_TENSOR_CORES", "8"))
    return lanes, tensor_cores
