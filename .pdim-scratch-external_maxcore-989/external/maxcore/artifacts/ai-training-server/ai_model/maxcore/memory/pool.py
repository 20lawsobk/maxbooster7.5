"""VramPool — a real, budgeted virtual-memory allocator for the digital GPU.

Honesty about what this is and isn't: this process has no physical VRAM to
manage, and Python cannot safely hand-roll raw page allocation over host RAM
(numpy/BLAS already own the actual bytes backing every ``Tensor``). What a
real GPU driver's allocator contributes on top of physical memory is a
*policy* layer: a fixed capacity budget, size-classed slabs so repeated
same-size requests reuse a slot instead of always minting a new one, a real
failure (OOM) when the budget is exceeded instead of a silent downgrade, and
peak/fragmentation telemetry an operator can actually look at. That policy
layer is what this module implements for real:

  * ``alloc``/``free`` are genuine bookkeeping operations against a hard
    ``capacity_bytes`` ceiling -- exceeding it raises :class:`VramOOMError`,
    never silently succeeds.
  * Allocations are bucketed by rounded-up power-of-two size (a classic slab
    allocator strategy) so a freed slot is reused by the next same-bucket
    request instead of growing the reservation again.
  * A freed slab stays *reserved* (counted against the budget) until either
    it is reused or :meth:`VramPool.trim` explicitly releases idle slabs --
    this is what makes ``fragmentation_bytes`` in :meth:`snapshot` a real,
    non-cosmetic number: memory the budget is still charged for but that
    isn't backing any live tensor right now.
  * Everything is thread-safe: the orchestration layer's stream scheduler
    calls ``alloc``/``free`` concurrently from multiple worker threads as
    independent graph nodes finish in parallel.

The runtime (``runtime/engine.py``) is the only caller that should drive the
alloc/free lifecycle directly -- it ties each pool handle to a graph
intermediate's real liveness window (allocate when a node's output is
produced, free the instant its last consumer has read it).

This thread-safety is what covers the thread-based ``StreamScheduler`` path
(``num_streams > 1`` before ``runtime/process_pool.py`` existed, and still
the mechanism for any caller that drives the scheduler directly rather than
through ``Runtime``). The process-pool path (``LaneProcessPool``, now what
``Runtime`` actually uses for ``num_streams > 1``) does **not** hand this
pool to worker processes -- a lock and in-memory dict can't be shared across
an OS process boundary the way they can across threads. Instead exactly one
``VramPool`` instance stays owned by the coordinator process; lane workers
only report their own tensor byte counts back over the coordinator's
existing result channel, and the coordinator does the real ``alloc``/``free``
bookkeeping against that telemetry. A worker process never calls a method on
this class.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from itertools import count

_DEFAULT_CAPACITY_BYTES = 8 * 1024 ** 3  # 8 GiB virtual VRAM budget


class VramOOMError(RuntimeError):
    """Raised when an allocation would exceed the pool's configured budget.

    A real, load-bearing failure -- callers must not catch this and silently
    fall back to "pretend it worked"; it means the graph genuinely asked for
    more virtual VRAM than the configured budget allows.
    """


@dataclass(frozen=True)
class Allocation:
    handle: int
    nbytes: int
    tag: str = ""


class VramPool:
    """A budgeted, size-classed virtual VRAM allocator.

    Parameters
    ----------
    capacity_bytes:
        Hard ceiling for concurrently-reserved bytes (live allocations plus
        idle-but-reserved slabs). Defaults to 8 GiB; pass a small value in
        tests to exercise the real OOM path.
    """

    def __init__(self, capacity_bytes: int | None = None):
        capacity = int(capacity_bytes) if capacity_bytes else _DEFAULT_CAPACITY_BYTES
        if capacity <= 0:
            raise ValueError("capacity_bytes must be > 0")
        self.capacity_bytes = capacity
        self._lock = threading.Lock()
        self._live: dict[int, Allocation] = {}
        self._idle_slabs: dict[int, list[int]] = {}
        self._id_gen = count(1)
        self.used_bytes = 0
        self.reserved_bytes = 0
        self.peak_used_bytes = 0
        self.peak_reserved_bytes = 0
        self.total_allocs = 0
        self.total_frees = 0
        self.reused_allocs = 0
        self.oom_count = 0

    @staticmethod
    def _bucket(nbytes: int) -> int:
        """Round up to a power-of-two size class (classic slab bucketing) so
        allocations of similar size share a reuse pool. A minimum bucket of
        256 bytes avoids a slab-per-scalar explosion for tiny tensors."""
        if nbytes <= 256:
            return 256
        b = 1
        while b < nbytes:
            b <<= 1
        return b

    def alloc(self, nbytes: int, tag: str = "") -> int:
        """Reserve `nbytes` (rounded up to a size class) and return an opaque
        handle. Raises :class:`VramOOMError` if the budget is exceeded and no
        idle same-class slab can be reused."""
        nbytes = int(nbytes)
        if nbytes < 0:
            raise ValueError("alloc: nbytes must be >= 0")
        bucket = self._bucket(nbytes)
        with self._lock:
            idle = self._idle_slabs.get(bucket)
            reused = bool(idle)
            if idle:
                handle = idle.pop()
            else:
                if self.reserved_bytes + bucket > self.capacity_bytes:
                    self.oom_count += 1
                    raise VramOOMError(
                        f"VramPool OOM: requested {bucket} bytes (rounded up from "
                        f"{nbytes}, tag={tag!r}); {self.reserved_bytes} of "
                        f"{self.capacity_bytes} byte budget already reserved "
                        f"({self.used_bytes} live)"
                    )
                handle = next(self._id_gen)
                self.reserved_bytes += bucket
            self._live[handle] = Allocation(handle, bucket, tag)
            self.used_bytes += bucket
            self.total_allocs += 1
            if reused:
                self.reused_allocs += 1
            if self.used_bytes > self.peak_used_bytes:
                self.peak_used_bytes = self.used_bytes
            if self.reserved_bytes > self.peak_reserved_bytes:
                self.peak_reserved_bytes = self.reserved_bytes
            return handle

    def free(self, handle: int) -> None:
        """Release a handle back to its size-class's idle slab list. The
        bytes stay *reserved* (charged against the budget) until reused or
        reclaimed via :meth:`trim` -- an unknown/double-freed handle is a
        harmless no-op, matching the runtime's liveness bookkeeping which
        only ever frees a handle it itself allocated exactly once."""
        with self._lock:
            alloc = self._live.pop(handle, None)
            if alloc is None:
                return
            self.used_bytes -= alloc.nbytes
            self._idle_slabs.setdefault(alloc.nbytes, []).append(handle)
            self.total_frees += 1

    def trim(self) -> int:
        """Release every idle (freed-but-still-reserved) slab back to the
        general budget. Returns the number of bytes released. Mirrors a real
        allocator's explicit compaction/trim pass -- without calling this,
        freed slabs stay reserved for fast reuse (this is a deliberate
        space/latency tradeoff, not a leak)."""
        with self._lock:
            released = self.reserved_bytes - self.used_bytes
            self._idle_slabs.clear()
            self.reserved_bytes = self.used_bytes
            return released

    def snapshot(self) -> dict:
        """A `nvidia-smi`-style point-in-time view of this pool's state."""
        with self._lock:
            fragmentation_bytes = self.reserved_bytes - self.used_bytes
            frag_ratio = (fragmentation_bytes / self.reserved_bytes) if self.reserved_bytes else 0.0
            return {
                "capacity_bytes": self.capacity_bytes,
                "used_bytes": self.used_bytes,
                "reserved_bytes": self.reserved_bytes,
                "free_bytes": max(0, self.capacity_bytes - self.reserved_bytes),
                "fragmentation_bytes": fragmentation_bytes,
                "fragmentation_ratio": round(frag_ratio, 4),
                "peak_used_bytes": self.peak_used_bytes,
                "peak_reserved_bytes": self.peak_reserved_bytes,
                "live_allocations": len(self._live),
                "total_allocs": self.total_allocs,
                "total_frees": self.total_frees,
                "reused_allocs": self.reused_allocs,
                "oom_count": self.oom_count,
            }

    def reset(self) -> None:
        """Drop all state -- live allocations, idle slabs, and counters."""
        with self._lock:
            self._live.clear()
            self._idle_slabs.clear()
            self._id_gen = count(1)
            self.used_bytes = 0
            self.reserved_bytes = 0
            self.peak_used_bytes = 0
            self.peak_reserved_bytes = 0
            self.total_allocs = 0
            self.total_frees = 0
            self.reused_allocs = 0
            self.oom_count = 0
