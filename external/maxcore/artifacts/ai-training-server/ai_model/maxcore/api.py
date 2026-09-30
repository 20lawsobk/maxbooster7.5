"""DigitalGPU — the public API façade.

This is the single entry point model/training code calls. It exposes eager
primitives (gemm/attention/conv2d/mlp/reduce/softmax), graph construction +
compilation + execution, sessions, and a metrics snapshot — all backed by a
pluggable backend (default: the in-house Digital GPU engine).
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np

from .backend.base import Backend
from .backend.registry import available, available_runtime, get_backend
from .compiler.pipeline import CompiledGraph, Compiler
from .ir.builder import GraphBuilder
from .ir.nodes import MaxCoreGraph
from .observability import METRICS
from .runtime.engine import Runtime
from .session import Session
from .tensor import Tensor

# Default backend when the caller doesn't pin one explicitly. `silicon_simt`
# (the from-scratch, RTL-derived SIMT engine) is the live default execution
# engine. Set MAXCORE_BACKEND=digital_gpu (or pass backend="digital_gpu"
# explicitly) to fall back to the legacy NumPy/SIMD engine.
_DEFAULT_BACKEND = "silicon_simt"

# Replica-pool dispatch for eager gemm: N PocketDimension replicas sharing one
# orchestrator, so identical GEMMs dedup once across every replica and
# concurrent calls fan out instead of contending. Enabled by default; set
# MAXCORE_REPLICA_POOL=0 to force direct backend dispatch.
_ENV_REPLICA_POOL = "MAXCORE_REPLICA_POOL"


class DigitalGPU:
    def __init__(self, backend: str | Backend | None = None, deterministic: bool = False,
                 compiler: Compiler | None = None, num_streams: int | None = None,
                 vram_capacity_bytes: int | None = None,
                 replica_pool: bool | None = None, **backend_kwargs):
        if backend is None:
            backend = os.environ.get("MAXCORE_BACKEND", _DEFAULT_BACKEND)
        if isinstance(backend, Backend):
            self.backend: Backend = backend
            resolved_backend_kwargs: dict = {}
        else:
            self.backend = get_backend(backend, **backend_kwargs)
            resolved_backend_kwargs = dict(backend_kwargs)
        self.compiler = compiler or Compiler()
        self.runtime = Runtime(self.backend, num_streams=num_streams,
                                vram_capacity_bytes=vram_capacity_bytes,
                                backend_kwargs=resolved_backend_kwargs)
        self.deterministic = deterministic
        if replica_pool is None:
            replica_pool = os.environ.get(_ENV_REPLICA_POOL, "1") not in ("0", "false", "False")
        self._replica_pool_enabled = bool(replica_pool)
        self._replica_pool = None  # lazy: built on first pooled gemm

    # ── tensors / graph construction ─────────────────────────────────────────
    def tensor(self, data: Any, dtype: str = "float32", device: str = "digital_gpu") -> Tensor:
        return self.backend.create_tensor(data, dtype=dtype)

    def graph_builder(self) -> GraphBuilder:
        return GraphBuilder()

    # ── eager primitives ─────────────────────────────────────────────────────
    def _pool(self):
        """Process-lazy ReplicaPool for this GPU's backend.

        The pool's replicas inject ``self.backend`` directly as their compute
        target, so a cache miss runs the caller's own backend kernel — never a
        fresh default DigitalGPU, and never back through this facade (no
        recursion). Import is lazy to keep ``api`` import-cycle free.
        """
        if self._replica_pool is None:
            from .pdim.replica_scaler import ReplicaPool
            self._replica_pool = ReplicaPool(gpu=self.backend)
        return self._replica_pool

    def gemm(self, a, b, bias=None, activation=None):
        # Fast path: plain float32-ndarray GEMM dispatches through the replica
        # pool (shared cross-replica dedup + lock-free fan-out). Anything else
        # — bias/activation, non-float32 or non-ndarray operands — takes the
        # exact historical direct-backend path.
        if (self._replica_pool_enabled and bias is None and activation is None
                and isinstance(a, np.ndarray) and isinstance(b, np.ndarray)
                and a.dtype == np.float32 and b.dtype == np.float32):
            result = self._pool().matmul(a, b)
            return self.backend.create_tensor(result, dtype="float32")
        return self.backend.gemm(a, b, bias=bias, activation=activation)

    def attention(self, q, k, v, mask=None, causal=False):
        return self.backend.attention(q, k, v, mask=mask, causal=causal)

    def conv2d(self, x, w, bias=None, stride=1, padding=0):
        return self.backend.conv2d(x, w, bias=bias, stride=stride, padding=padding)

    def mlp(self, x, w1, b1, w2, b2, activation="relu"):
        return self.backend.mlp(x, w1, b1, w2, b2, activation=activation)

    def reduce(self, x, op, axis, keepdims=False):
        return self.backend.reduce(x, op, axis, keepdims=keepdims)

    def softmax(self, x, axis=-1):
        return self.backend.softmax(x, axis=axis)

    # ── graph compile / execute ──────────────────────────────────────────────
    def compile(self, graph: MaxCoreGraph) -> CompiledGraph:
        return self.compiler.compile(graph)

    def run_graph(self, graph, inputs: dict, run_config: dict | None = None) -> dict:
        rc = run_config or {}
        compiled = graph if isinstance(graph, CompiledGraph) else self.compiler.compile(graph)
        return self.runtime.run(
            compiled, inputs,
            deterministic=rc.get("deterministic", self.deterministic),
            seed=rc.get("seed", 0),
        )

    def create_session(self, session_id: str, policy: dict | None = None) -> Session:
        return Session(session_id, self, policy)

    def metrics(self) -> dict:
        return METRICS.snapshot()

    def backends(self) -> dict:
        return {"registered": available(), "runnable": available_runtime(),
                "active": self.backend.name}

    def smi(self) -> dict:
        """A `nvidia-smi`-style device snapshot: real memory-pool state,
        stream/backend config, and per-op telemetry from this process. There
        is no vendor GPU in this environment to query instead -- every field
        here is a live figure from this runtime, not a modeled/estimated one.
        """
        snap = METRICS.snapshot()
        return {
            "backend": self.backend.info(),
            "num_streams": self.runtime.num_streams,
            "memory": self.runtime.pool.snapshot(),
            "counters": snap["counters"],
            "gauges": snap["gauges"],
            "op_timers": snap["timers"],
        }

    def close(self) -> None:
        """Release worker processes owned by this instance's runtime, if any
        (a no-op for ``num_streams<=1``). See ``Runtime.close``."""
        self.runtime.close()
