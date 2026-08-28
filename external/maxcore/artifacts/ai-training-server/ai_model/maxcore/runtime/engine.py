"""Runtime — execute a CompiledGraph on a backend.

Dispatches a compiled graph's nodes to the backend across a real multi-stream
scheduler (``scheduler.py``): independent branches can genuinely overlap on
separate worker threads instead of the old strictly-serial one-node-at-a-time
loop, cross-stream dependencies block on the producing node exactly once
(never busy-poll), and every intermediate tensor is tracked through a real
budgeted allocator (``memory/pool.py``) that frees it the instant its last
consumer has run. Deterministic mode still seeds NumPy up front so any
stochastic op is reproducible under any ``num_streams`` setting.

``num_streams=1`` (the default -- see ``_default_num_streams`` below) is
strictly serial; any larger value never changes the *numeric* result, only
wall-clock overlap, because every currently-supported op is a pure function
of its resolved inputs.

Measured, honest caveat on wall-clock overlap: CPython's GIL means threads
only get real parallelism during the fraction of a node's execution that
releases it. This project's own backends spend much of their time in short
NumPy/Python-level bookkeeping (tiling, padding, predicate masks) between
brief native calls, so for the tensor sizes typical of this project's graphs,
extra streams frequently cost more in thread-scheduling/GIL-handoff overhead
than they recover in overlap -- measured on this container's 4 cores, a
handful of independent small-to-medium GEMMs got *slower* under
``num_streams>1``, not faster (see
``tests/benchmark_gpu_native.py::bench_stream_overlap``, which sweeps sizes
and reports this honestly rather than asserting a speedup). This is why the
default is serial rather than ``os.cpu_count()``. Multi-stream execution is
still correct and still genuinely useful when a caller knows their node
work benefits -- long-running native calls, or (in a future backend) real
I/O -- so it remains an explicit opt-in via ``num_streams=`` or
``MAXCORE_NUM_STREAMS``, never a silent default trade-off.
"""
from __future__ import annotations

import os
import threading

import numpy as np

from ..backend.registry import get_backend
from ..compiler.pipeline import CompiledGraph
from ..ir.nodes import OpType
from ..memory.pool import VramPool
from ..observability import METRICS
from ..tensor import Tensor
from .scheduler import StreamScheduler


def _default_num_streams() -> int:
    """Default to serial (1). Concurrency is correct and available on demand
    (``MAXCORE_NUM_STREAMS`` or ``Runtime(num_streams=...)``), but is not a
    safe *default* trade-off: measured on this project's own backends,
    GIL-bound NumPy/Python execution frequently gets slower, not faster,
    under extra streams (see the module docstring and
    ``tests/benchmark_gpu_native.py``). A caller who has verified their own
    node workload benefits should opt in explicitly."""
    env = os.environ.get("MAXCORE_NUM_STREAMS")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    return 1


def _nbytes(value: object) -> int:
    if isinstance(value, Tensor):
        return int(value.data.nbytes)
    nb = getattr(value, "nbytes", None)
    if nb is not None:
        return int(nb)
    return 0


def _to_numpy(value: object):
    return value.data if isinstance(value, Tensor) else np.asarray(value)


def _estimate_flops(node, ins: list, out: object) -> int:
    """Best-effort FLOP estimate for telemetry (GFLOP/s reporting). Returns 0
    for anything it can't confidently size -- an estimate must never crash a
    real graph run, so any shape surprise fails open to "unknown", not to an
    exception."""
    try:
        op = node.op_type
        if op == OpType.GEMM:
            a, b = _to_numpy(ins[0]), _to_numpy(ins[1])
            m = a.shape[-2] if a.ndim >= 2 else 1
            k = a.shape[-1]
            n = b.shape[-1] if b.ndim >= 2 else 1
            batch = 1
            for d in a.shape[:-2]:
                batch *= d
            return int(2 * batch * m * k * n)
        if op == OpType.CONV2D:
            x, w = _to_numpy(ins[0]), _to_numpy(ins[1])
            n_, c, _h, _w = x.shape
            o, _cw, kh, kw = w.shape
            out_arr = _to_numpy(out)
            ho, wo = out_arr.shape[-2], out_arr.shape[-1]
            return int(2 * n_ * o * c * kh * kw * ho * wo)
        if op == OpType.ATTENTION:
            q, k = _to_numpy(ins[0]), _to_numpy(ins[1])
            t_q, d = q.shape[-2], q.shape[-1]
            t_k = k.shape[-2]
            batch = 1
            for dd in q.shape[:-2]:
                batch *= dd
            return int(4 * batch * t_q * t_k * d)  # Q@K^T + probs@V
        if op == OpType.MLP:
            x, w1, w2 = _to_numpy(ins[0]), _to_numpy(ins[1]), _to_numpy(ins[3])
            m = 1
            for d in x.shape[:-1]:
                m *= d
            k1, n1 = w1.shape
            k2, n2 = w2.shape
            return int(2 * m * k1 * n1 + 2 * m * k2 * n2)
    except Exception:
        return 0
    return 0


class Runtime:
    def __init__(self, backend=None, num_streams: int | None = None,
                 vram_capacity_bytes: int | None = None):
        self.backend = backend if backend is not None else get_backend("digital_gpu")
        self.num_streams = max(1, int(num_streams)) if num_streams else _default_num_streams()
        self.scheduler = StreamScheduler(num_streams=self.num_streams)
        self.pool = VramPool(capacity_bytes=vram_capacity_bytes)

    def run(self, compiled: CompiledGraph, inputs: dict, deterministic: bool = False,
            seed: int = 0) -> dict:
        if deterministic:
            np.random.seed(seed)
        graph = compiled.graph
        order = compiled.order

        env: dict = {}
        for name, value in graph.consts.items():
            env[name] = self.backend.create_tensor(value)
        for name in graph.inputs:
            if name not in inputs:
                raise ValueError(f"missing required input '{name}'")
            val = inputs[name]
            env[name] = val if isinstance(val, Tensor) else self.backend.create_tensor(np.asarray(val))

        outputs_set = set(graph.outputs)
        external = set(graph.consts.keys()) | set(graph.inputs)

        # How many node-inputs reference each produced name -- used to free
        # an intermediate's pool handle the instant every consumer is done,
        # regardless of the order lanes happen to finish in.
        consumer_count: dict[str, int] = {}
        for node in order:
            for i in node.inputs:
                if i not in external:
                    consumer_count[i] = consumer_count.get(i, 0) + 1

        handles: dict[str, int] = {}
        bookkeeping_lock = threading.Lock()
        remaining = dict(consumer_count)

        def register_output(node, value, resolved_inputs: list) -> None:
            name = node.output
            if name in outputs_set:
                return  # caller-owned lifetime past this call -- never auto-freed
            if consumer_count.get(name, 0) <= 0:
                return  # dead value (no consumers, not a graph output) -- nothing to track
            if any(value is ri for ri in resolved_inputs):
                return  # COPY/BARRIER aliasing -- not a new buffer, don't double-count
            nbytes = _nbytes(value)
            with bookkeeping_lock:
                handles[name] = self.pool.alloc(nbytes, tag=node.op_type.value)

        def release_consumed(node) -> None:
            for i in node.inputs:
                if i in external or i in outputs_set:
                    continue
                with bookkeeping_lock:
                    if i not in remaining:
                        continue
                    remaining[i] -= 1
                    done = remaining[i] <= 0
                    h = handles.pop(i, None) if done else None
                if done and h is not None:
                    self.pool.free(h)

        def exec_fn(node, resolved_inputs: list):
            value = self._exec(node, resolved_inputs)
            register_output(node, value, resolved_inputs)
            return value

        def telemetry_fn(node, resolved_inputs, value, stream_id, elapsed_ms):
            release_consumed(node)
            op_name = node.op_type.value
            METRICS.incr(f"runtime.stream.{stream_id}.ops")
            METRICS.observe(f"runtime.op.{op_name}", elapsed_ms)
            nbytes_moved = sum(_nbytes(v) for v in resolved_inputs) + _nbytes(value)
            METRICS.incr("runtime.bytes_moved", nbytes_moved)
            METRICS.incr(f"runtime.bytes_moved.{op_name}", nbytes_moved)
            flops = _estimate_flops(node, resolved_inputs, value)
            if flops:
                METRICS.incr(f"runtime.flops.{op_name}", flops)
                METRICS.incr("runtime.flops", flops)

        with METRICS.timer("runtime.run"):
            result_env = self.scheduler.run(order, env, exec_fn, telemetry_fn=telemetry_fn)
        METRICS.incr("runtime.graphs")
        METRICS.gauge("runtime.num_streams", self.num_streams)
        return {o: result_env[o] for o in graph.outputs}

    def _exec(self, node, ins: list):
        b = self.backend
        op = node.op_type
        a = node.attrs
        if op == OpType.GEMM:
            bias = ins[2] if a.get("has_bias") and len(ins) > 2 else None
            return b.gemm(ins[0], ins[1], bias=bias, activation=a.get("activation"))
        if op == OpType.ADD:
            return b.add(ins[0], ins[1])
        if op == OpType.RELU:
            return b.relu(ins[0])
        if op == OpType.SOFTMAX:
            return b.softmax(ins[0], axis=a.get("axis", -1))
        if op == OpType.ATTENTION:
            mask = ins[3] if a.get("has_mask") and len(ins) > 3 else None
            return b.attention(ins[0], ins[1], ins[2], mask=mask, causal=a.get("causal", False))
        if op == OpType.CONV2D:
            bias = ins[2] if a.get("has_bias") and len(ins) > 2 else None
            return b.conv2d(ins[0], ins[1], bias=bias,
                            stride=a.get("stride", 1), padding=a.get("padding", 0))
        if op == OpType.MLP:
            return b.mlp(ins[0], ins[1], ins[2], ins[3], ins[4],
                         activation=a.get("activation", "relu"))
        if op == OpType.REDUCE:
            return b.reduce(ins[0], a["op"], a["axis"], a.get("keepdims", False))
        if op == OpType.COPY:
            return ins[0]
        if op == OpType.BARRIER:
            return ins[0] if ins else None
        raise ValueError(f"runtime: unknown op '{op}'")
