"""Request-local HyperGPU lives with lossless PDIM-backed state.

Logical lives have no fixed count ceiling. Active execution is finite host
work and must be admitted by the caller's adaptive inference gate. Canonical
PDIM stores lifecycle records and real serialized VRAM/KV; it does not turn
resident VRAM into infinite physical memory. State has no SQLite fallback.
"""
from __future__ import annotations

import asyncio
import threading
import time
import uuid
import logging
from contextlib import asynccontextmanager, contextmanager, nullcontext
from contextvars import ContextVar
from typing import AsyncIterator, Iterator

from ai_model.gpu.hyper_backend import HyperGPUBackend, PrecisionMode
from ai_model.gpu.sizing import hyper_gpu_sizing


_CURRENT_GPU = ContextVar("pocket_gpu_instance", default=None)
_logger = logging.getLogger(__name__)


def current_gpu_instance():
    """The current execution's life, propagated with copy_context/to_thread."""
    return _CURRENT_GPU.get()


class RequestScopedGPU:
    """Resolve kernels per execution without mutating shared model modules.

    Outside a pool scope, use the model's original HyperGPU. Inside a scope,
    every layer resolves to the life-owned, kernel-compatible HyperGPU.
    """

    def __init__(self, default_gpu):
        self.default_gpu = default_gpu

    def __getattr__(self, name):
        life = current_gpu_instance()
        if life is not None and life.state != _WORKING:
            raise RuntimeError("Pocket GPU execution outlived its working scope")
        gpu = life.backend.gpu if life is not None else self.default_gpu
        return getattr(gpu, name)


# ── Lifecycle states ──────────────────────────────────────────────────────────

_BORN    = "born"
_WORKING = "working"
_DEAD    = "dead"


class PocketGPUInstance:
    """One GPU life — born when spawned, dead when released.

    Each instance owns an isolated ``HyperGPUBackend`` (and its host VRAM).
    Retirement persists real buffers before flushing resident VRAM.
    """

    __slots__ = ("id", "digest", "backend", "state", "born_at", "died_at", "kv_payload", "kv_pending", "store")

    def __init__(self, digest: str = "") -> None:
        self.id      = str(uuid.uuid4())
        self.digest  = digest
        self.state   = _BORN
        self.born_at = time.perf_counter()
        self.died_at: float | None = None
        self.kv_payload = None
        self.kv_pending = None
        self.store = None
        # Each active instance owns real host-resident execution state.
        # Lanes/tensor_cores come from the same host-capacity-derived sizing
        # every other HyperGPU construction site in this process uses (see
        # ai_model/gpu/sizing.py) instead of an independent hardcoded value.
        _lanes, _tensor_cores = hyper_gpu_sizing()
        self.backend = HyperGPUBackend(
            lanes=_lanes,
            tensor_cores=_tensor_cores,
            precision=PrecisionMode.MIXED,
        )

    # ── Transitions ──────────────────────────────────────────────────────────

    def begin_work(self) -> None:
        """born → working."""
        if self.state != _BORN:
            raise RuntimeError(f"Cannot begin GPU life in state {self.state}")
        self.state = _WORKING

    def capture_kv(self, hidden, kv, prefix_len):
        """Keep the latest real KV state for lossless retirement/recovery."""
        # Encoding every token would be quadratic in sequence length. The
        # worker owns these tensors until retirement, when we snapshot once.
        self.kv_pending = (hidden, kv, prefix_len)
        self.kv_payload = None

    def die(self) -> float:
        """Flush VRAM, mark dead.  Returns lifetime in milliseconds.
        Never raises — death must always succeed so the pool stays consistent."""
        if self.state == _DEAD:
            return self.alive_ms
        try:
            self.backend.flush_vram()
        except Exception:
            _logger.exception("Failed to flush GPU life %s", self.id)
        self.died_at = time.perf_counter()
        self.state   = _DEAD
        return (self.died_at - self.born_at) * 1_000.0

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def alive_ms(self) -> float:
        """Milliseconds since birth (or total lifetime if dead)."""
        end = self.died_at if self.died_at is not None else time.perf_counter()
        return (end - self.born_at) * 1_000.0

    def __repr__(self) -> str:
        return (
            f"<PocketGPUInstance id={self.id[:8]}… "
            f"state={self.state} alive={self.alive_ms:.0f}ms>"
        )


# ── Pool ──────────────────────────────────────────────────────────────────────

class PocketGPUPool:
    """Uncapped logical GPU lifecycle pool; caller admits active host work.

    Spawn a GPU life with either the async or sync context manager:

        # From an async handler (before entering the thread-pool):
        async with pool.spawn(digest) as gpu:
            result = await run_in_executor(None, lambda: compute(gpu.backend))

        # Already inside a worker thread:
        with pool.spawn_sync(digest) as gpu:
            result = compute(gpu.backend)

    Lifecycle telemetry is exposed via ``stats()`` and surfaced in the
    ``/gpu/status`` endpoint so the dashboard can observe every birth and
    death in real time.
    """

    def __init__(self, store=None) -> None:
        if store is None:
            from ai_model.gpu.pocket_state import PDIMStateStore
            store = PDIMStateStore()
        self._store = store
        self._lock          = threading.Lock()
        self._total_born    = 0
        self._total_dead    = 0
        self._alive         = 0
        self._total_life_ms = 0.0
        self._storage_errors = 0
        self._live_instances: dict[str, PocketGPUInstance] = {}
        self._retired_kernel_ops = 0
        self._retired_compute_ms = 0.0

    def _persist(self, inst: PocketGPUInstance) -> None:
        # Only measured execution counters, never a fabricated GPU workload.
        record = {
            "id": inst.id, "digest": inst.digest, "state": inst.state,
            "alive_ms": inst.alive_ms,
            "kernel_ops": inst.backend.gpu.core._total_ops,
            "vram_used_bytes": inst.backend.gpu.vram.used_bytes,
            "is_hardware_execution": False,
        }
        try:
            if not self._store.set(f"gpu:life:{inst.id}", record):
                raise RuntimeError("PDIM/durable disk rejected GPU lifecycle write")
        except Exception:
            with self._lock:
                self._storage_errors += 1
            raise

    # ── Internal book-keeping ─────────────────────────────────────────────────

    def _register_birth(self, inst: PocketGPUInstance) -> None:
        self._persist(inst)
        inst.begin_work()
        self._persist(inst)
        with self._lock:
            self._total_born += 1
            self._alive      += 1
            self._live_instances[inst.id] = inst

    def _register_death(self, inst: PocketGPUInstance) -> None:
        with self._lock:
            if inst.id not in self._live_instances:
                return
        try:
            self.save_state(inst)
        finally:
            life_ms = inst.die()
            with self._lock:
                # Transfer ownership of the measured counters atomically.
                # A status sample sees this life either active OR retired,
                # never both; retain no dead backend/tensor references.
                if self._live_instances.pop(inst.id, None) is not None:
                    self._retired_kernel_ops += inst.backend.gpu.core._total_ops
                    self._retired_compute_ms += inst.backend.gpu._total_compute_ms
                    self._alive         -= 1
                    self._total_dead    += 1
                    self._total_life_ms += life_ms
        self._persist(inst)

    def save_state(self, inst):
        """Publish actual VRAM and latest KV before freeing active buffers."""
        import base64
        from ai_model.gpu.pocket_state import encode_array
        if inst.kv_pending is not None:
            from ai_model.gpu.hyper_creative_transformer import _encode_prefix_payload
            inst.kv_payload = _encode_prefix_payload(*inst.kv_pending)
            inst.kv_pending = None
        vram = inst.backend.gpu.vram
        with vram._lock:
            payload = {
                "version": 1, "next_id": vram._next_id,
                "vram": {str(h): encode_array(a) for h, a in vram._store.items()},
                "kv": base64.b64encode(inst.kv_payload).decode() if inst.kv_payload is not None else None,
            }
        key = f"gpu:state:{inst.id}"
        if not self._store.set(key, payload):
            raise RuntimeError("PDIM rejected GPU state")
        return key

    def restore_state(self, inst, key):
        """Restore a saved life into a fresh, admitted instance; return KV."""
        import base64
        from ai_model.gpu.pocket_state import decode_array
        if inst.state != _WORKING:
            raise RuntimeError("GPU state can only be restored into a working life")
        payload = self._store.get(key)
        if payload is None:
            raise RuntimeError("GPU state not found in PDIM")
        if payload.get("version") != 1:
            raise ValueError("Unsupported GPU state version")
        arrays = {int(h): decode_array(a) for h, a in payload["vram"].items()}
        next_id = payload["next_id"]
        if type(next_id) is not int or next_id < 0 or any(h < 0 or h >= next_id for h in arrays):
            raise ValueError("Invalid GPU state handles")
        kv_raw = base64.b64decode(payload["kv"], validate=True) if payload["kv"] is not None else None
        kv = None
        if kv_raw is not None:
            from ai_model.gpu.hyper_creative_transformer import _decode_prefix_payload
            kv = _decode_prefix_payload(kv_raw)
        vram = inst.backend.gpu.vram
        size = sum(a.nbytes for a in arrays.values())
        with vram._lock:
            if vram._store:
                raise RuntimeError("Cannot restore into nonempty GPU VRAM")
            if vram.capacity_bytes > 0 and size > vram.capacity_bytes:
                raise RuntimeError("Recovered GPU state exceeds active VRAM capacity")
            vram._store = arrays
            vram._next_id = next_id
            vram._meta = {h: {"shape": a.shape, "dtype": a.dtype, "size": a.size} for h, a in arrays.items()}
            vram._peak_bytes = max(vram._peak_bytes, size)
        inst.kv_payload = kv_raw
        inst.kv_pending = None
        return kv

    def _create(self, digest):
        inst = PocketGPUInstance(digest)
        inst.store = self._store
        try:
            self._register_birth(inst)
        except BaseException:
            inst.die()
            raise
        return inst

    # ── Async context manager ─────────────────────────────────────────────────

    async def run_in_worker(self, fn, digest="", gate=None, timeout=None):
        """Run fn(life) with a worker-owned scope and drain on cancellation.

        Prefer this over wrapping run_in_executor in async spawn: a worker is
        not killed by cancellation of its awaiting task. Pass the existing
        adaptive gate to admit host work before allocating a life.
        """
        from contextvars import copy_context
        def work():
            with gate.slot(timeout=timeout) if gate is not None else nullcontext():
                with self.spawn_sync(digest) as life:
                    return fn(life)
        future = asyncio.get_running_loop().run_in_executor(None, copy_context().run, work)
        cancelled = False
        while True:
            try:
                result = await asyncio.shield(future)
                break
            except asyncio.CancelledError:
                cancelled = True
                continue
            except BaseException:
                if cancelled:
                    _logger.exception("Cancelled GPU worker failed while draining")
                    raise asyncio.CancelledError
                raise
        if cancelled:
            raise asyncio.CancelledError
        return result

    @asynccontextmanager
    async def spawn(self, digest: str = "") -> AsyncIterator[PocketGPUInstance]:
        """Spawn a GPU life from the async layer (event-loop safe).

        Instance creation and death both run in the thread-pool so the
        event loop is never stalled by VRAM allocation or flush.

        All child work must finish before leaving the scope. For blocking
        inference use run_in_worker(), which owns its scope inside the worker
        and drains cancellation before reporting completion.
        """
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(None, self._create, digest)
        try:
            inst = await asyncio.shield(future)
        except asyncio.CancelledError:
            # Allocation cannot be cancelled once running. Arrange retirement
            # when it finishes, even though no caller ever received the life.
            def retire(done):
                try:
                    inst = done.result()
                    self._register_death(inst)
                except BaseException:
                    _logger.exception("Cancelled GPU allocation cleanup failed")
            future.add_done_callback(
                lambda done: loop.run_in_executor(None, retire, done))
            raise
        token = _CURRENT_GPU.set(inst)
        try:
            yield inst
        finally:
            _CURRENT_GPU.reset(token)
            await asyncio.shield(loop.run_in_executor(None, self._register_death, inst))

    # ── Sync context manager ──────────────────────────────────────────────────

    @contextmanager
    def spawn_sync(self, digest: str = "") -> Iterator[PocketGPUInstance]:
        """Spawn a GPU life from inside a worker thread (no asyncio needed)."""
        inst = self._create(digest)
        token = _CURRENT_GPU.set(inst)
        try:
            yield inst
        finally:
            _CURRENT_GPU.reset(token)
            self._register_death(inst)

    # ── Telemetry ─────────────────────────────────────────────────────────────

    def stats(self) -> dict:
        """Process-local active + retired backend counters, without overlap.

        Kernel ops are the actual core counters (cache hits need not run a
        kernel). Compute ms is the backend's accumulated dispatch elapsed time,
        including cache overhead, NOT request latency or a silicon estimate.
        Active backend values may advance during a sample; retirement transfers
        each backend's final counters exactly once under this pool lock.
        """
        with self._lock:
            active_kernel_ops = sum(
                inst.backend.gpu.core._total_ops for inst in self._live_instances.values())
            active_compute_ms = sum(
                inst.backend.gpu._total_compute_ms for inst in self._live_instances.values())
            avg = (
                round(self._total_life_ms / self._total_dead, 1)
                if self._total_dead else 0.0
            )
            return {
                "pool_alive":       self._alive,
                "pool_total_born":  self._total_born,
                "pool_total_dead":  self._total_dead,
                "pool_avg_life_ms": avg,
                "pool_source":      type(self._store).__name__,
                "pool_storage_errors": self._storage_errors,
                "pool_state_scope": "vram_and_kv",
                "pool_execution": "host_hypergpu",
                "pool_active_kernel_ops": active_kernel_ops,
                "pool_retired_kernel_ops": self._retired_kernel_ops,
                "pool_total_kernel_ops": self._retired_kernel_ops + active_kernel_ops,
                "pool_active_compute_ms": active_compute_ms,
                "pool_retired_compute_ms": self._retired_compute_ms,
                "pool_total_compute_ms": self._retired_compute_ms + active_compute_ms,
                "pool_compute_counter_scope": "process_since_pool_creation",
            }
