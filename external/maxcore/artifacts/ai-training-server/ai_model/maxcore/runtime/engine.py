"""Runtime — execute a CompiledGraph on a backend.

The default ``num_streams=1`` path executes in-process through the dependency
aware ``StreamScheduler`` and a budgeted ``VramPool``. Explicit
``num_streams>1`` uses ``LaneProcessPool``: each lane is a persistent OS
process with its own interpreter and backend, while the coordinator owns the
allocator and routes dependencies and tensor payloads across process
boundaries. This avoids cross-stream GIL contention for NumPy-bound kernels
without pretending that process startup, IPC, and memory-bandwidth contention
are free.

Both paths execute the same pure node dispatcher and preserve graph
dependencies, deterministic seeding, and intermediate-tensor liveness. The
process path is therefore a real concurrency option, but its wall-clock
benefit remains workload- and hardware-dependent; the checked-in benchmark
reports the measured result rather than claiming a speedup the hardware does
not consistently provide.
"""
from __future__ import annotations

import os
import threading

import numpy as np

from ..backend.registry import get_backend
from ..compiler.pipeline import CompiledGraph
from ..memory.pool import VramPool
from ..observability import METRICS
from ..tensor import Tensor
from .scheduler import StreamScheduler
from .ops import _estimate_flops, _nbytes, exec_op
from .process_pool import LaneProcessPool


def _default_num_streams() -> int:
    """Default to serial (1). Concurrency is correct and available on demand
    (``MAXCORE_NUM_STREAMS`` or ``Runtime(num_streams=...)``), but is not a
    safe *default* trade-off: measured on this project's own backends,
    extra process/IPC and memory-bandwidth overhead frequently costs more than
    the overlap (see the module docstring). A caller who has verified their
    own node workload benefits should opt in explicitly."""
    env = os.environ.get("MAXCORE_NUM_STREAMS")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    return 1


class Runtime:
    def __init__(self, backend=None, num_streams: int | None = None,
                 vram_capacity_bytes: int | None = None, backend_kwargs: dict | None = None):
        self.backend = backend if backend is not None else get_backend("digital_gpu")
        self.backend_kwargs = dict(backend_kwargs or {})
        self.num_streams = max(1, int(num_streams)) if num_streams else _default_num_streams()
        self.pool = VramPool(capacity_bytes=vram_capacity_bytes)
        self.scheduler: StreamScheduler | None = None
        self._process_pool: LaneProcessPool | None = None

        if self.num_streams > 1:
            # Worker processes reconstruct the backend via
            # `get_backend(name, **backend_kwargs)` -- the exact same
            # registry call any in-process caller would make. That only
            # reproduces *this* backend instance if it was itself obtained
            # that way (the registry memoizes by (name, kwargs)); a raw,
            # separately-constructed Backend instance passed straight into
            # DigitalGPU/Runtime has no recoverable (name, kwargs) recipe; a
            # worker would silently build a *different*, default-kwargs
            # instance. Fail loudly instead of ever running that mismatch.
            try:
                canonical = get_backend(self.backend.name, **self.backend_kwargs)
            except Exception as exc:
                raise RuntimeError(
                    f"Runtime: num_streams>1 requires a backend reconstructable by "
                    f"name in worker processes, but get_backend({self.backend.name!r}, "
                    f"**{self.backend_kwargs}) failed: {exc}. Construct DigitalGPU with "
                    f"backend=<name string> (and any kwargs) rather than a pre-built "
                    f"Backend instance when using num_streams>1."
                ) from exc
            if canonical is not self.backend:
                raise RuntimeError(
                    f"Runtime: num_streams>1 requires the backend to be exactly what "
                    f"get_backend({self.backend.name!r}, **{self.backend_kwargs}) "
                    f"returns, so worker processes can reconstruct an equivalent "
                    f"instance. Got a different pre-built '{self.backend.name}' "
                    f"instance instead -- construct DigitalGPU with backend=<name "
                    f"string> (not a raw instance) when opting into num_streams>1."
                )
            self._process_pool = LaneProcessPool(
                num_streams=self.num_streams,
                backend_name=self.backend.name,
                backend_kwargs=self.backend_kwargs,
            )
        else:
            self.scheduler = StreamScheduler(num_streams=1)

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

        if self._process_pool is not None:
            with METRICS.timer("runtime.run"):
                result_env = self._process_pool.run(
                    order, env, outputs_set, consumer_count, self.pool,
                    deterministic=deterministic, seed=seed,
                )
        else:
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
        return exec_op(self.backend, node, ins)

    def close(self) -> None:
        """Release this runtime's worker processes, if any (``num_streams<=1``
        runs entirely in-process and owns nothing to release). Safe to call
        more than once. Not required before the object is garbage-collected
        -- ``__del__`` calls this as a safety net -- but calling it
        explicitly when you know a ``Runtime`` is done with releases its
        processes immediately rather than whenever the collector gets to
        it."""
        if self._process_pool is not None:
            self._process_pool.shutdown()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass
