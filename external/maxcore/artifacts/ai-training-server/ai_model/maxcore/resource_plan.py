"""Resource planning — the one place MaxCore's software-GPU stack turns
"how big is this host" into "how should I divide it" decisions.

Three questions used to be answered ad hoc, separately, in different files;
they all live here now because they all depend on the same two facts (host
CPU count, host memory) and the same "don't oversubscribe, don't starve"
philosophy ``hardware.py`` already established for BLAS threads:

  * How many logical CPUs and how much memory does this process actually have
    to work with (cgroup-aware, not just the raw host's numbers, and not the
    live "available" figure, which swings with unrelated caches)?
  * Given that host size and a requested stream/process-lane count, how many
    BLAS threads should each lane use (reusing ``hardware.plan_blas_threads``
    and ``hardware.reserve_cpus_for`` — never inventing a second thread-count
    formula)?
  * Given that host size, how big should the GEMM dedup cache
    (``pdim/pocket_accelerator.py``) and the SIMT engine's GEMM/reduce tiles
    (``backend/silicon_simt_backend.py``) default to?

Every default here is deliberately conservative and *bounded*. This module
does not, and cannot, know the real production host's measured performance —
nobody has benchmarked the 16-CPU/64GiB target from this dev container. It
picks sensible, documented, boundedly-scaled defaults and leaves each of them
overridable by an operator env var, exactly like ``hardware.py`` already does
for BLAS threads (``POCKET_ACCEL_BUDGET_MB`` continues to win over the
cache-budget default computed here — see ``pocket_accelerator.py``).

Two env vars exist purely so tests can exercise a synthetic host profile
without needing actually-different hardware: ``MAXCORE_PLAN_CPUS`` and
``MAXCORE_PLAN_MEMORY_MB`` (see ``tests/test_resource_plan.py``). They are a
testing knob, not something a real deployment needs to set.

This module is a normal member of the ``ai_model.maxcore`` package (unlike
``hardware.py``, it is not required to load before numpy) — every consumer of
it is already inside code paths where numpy is loaded.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from .hardware import _BLAS_ENV_VARS, cpu_count as _host_cpu_count, plan_blas_threads, reserve_cpus_for

_ENV_CPU_OVERRIDE = "MAXCORE_PLAN_CPUS"
_ENV_MEMORY_OVERRIDE_MB = "MAXCORE_PLAN_MEMORY_MB"

# Conservative floor used only when neither cgroup nor /proc/meminfo can be
# read (e.g. a non-Linux host) -- small enough to never overcommit.
_FALLBACK_MEMORY_BYTES = 2 * 1024 ** 3

_CACHE_BUDGET_FRACTION = 0.03
_CACHE_BUDGET_FLOOR_BYTES = 128 * 1024 * 1024
_CACHE_BUDGET_CEILING_BYTES = 2 * 1024 * 1024 * 1024

# The approximate host this project's SiliconSimtEngine GEMM/reduce tile
# defaults (256 / 512 / 128 -- see silicon_simt_engine.py) were sized against.
# Tile scaling below is anchored so a process with this many (or fewer) BLAS
# threads gets those exact, long-standing numbers back -- only a process with
# meaningfully more per-process BLAS parallelism scales up.
_TILE_BASELINE_THREADS = 4
_BASE_M_TILE = 256
_BASE_K_TILE = 512
_BASE_REDUCE_TILE = 128
_MAX_TILE_SCALE = 4  # bound growth -- never explode tile/working-set size


def planned_cpu_count() -> int:
    """Logical CPUs this process should plan around (>= 1).

    Reads the real host via ``hardware.cpu_count()`` unless
    ``MAXCORE_PLAN_CPUS`` is set (tests only -- see module docstring).
    """
    override = os.environ.get(_ENV_CPU_OVERRIDE)
    if override:
        try:
            value = int(override)
        except ValueError:
            value = 0
        if value >= 1:
            return value
    return _host_cpu_count()


def _cgroup_v2_memory_ceiling_bytes() -> Optional[int]:
    """This container's cgroup v2 memory ceiling, or ``None`` if absent/unlimited."""
    try:
        with open("/sys/fs/cgroup/memory.max", "r") as f:
            raw = f.read().strip()
    except OSError:
        return None
    if not raw or raw == "max":
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def _proc_meminfo_total_bytes() -> Optional[int]:
    """Host ``MemTotal`` from ``/proc/meminfo``, or ``None`` if unreadable."""
    try:
        with open("/proc/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    return int(parts[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def planned_memory_bytes() -> int:
    """Usable memory ceiling this process should plan around, in bytes.

    The *tighter* of the container's cgroup v2 ceiling and the host's total
    RAM (never the live "available" figure, which swings with unrelated
    caches/other processes and would make cache-budget sizing flap between
    calls). Override with ``MAXCORE_PLAN_MEMORY_MB`` (tests only -- see
    module docstring).
    """
    override = os.environ.get(_ENV_MEMORY_OVERRIDE_MB)
    if override:
        try:
            mb = float(override)
        except ValueError:
            mb = 0.0
        if mb >= 1:
            return int(mb * 1024 * 1024)
    candidates = [v for v in (_cgroup_v2_memory_ceiling_bytes(), _proc_meminfo_total_bytes()) if v]
    if not candidates:
        return _FALLBACK_MEMORY_BYTES
    return min(candidates)


def effective_blas_threads() -> int:
    """This process's *own*, already-configured BLAS thread count.

    Reads the env vars ``hardware.configure_blas_threads`` sets, i.e.
    whichever plan actually applied to *this* process — the single-stream
    host-wide default, or a lane worker's own ``cpus // num_streams`` share —
    rather than recomputing a host-wide number that could be wrong for a lane
    worker sharing the host with sibling workers. Falls back to what the
    standard single-stream plan *would* set (reserve included) if nothing has
    configured them yet (e.g. an import path that runs before the bootstrap
    block does, or a standalone script/test) — never the raw, unreserved host
    CPU count, which ``configure_blas_threads`` never actually assigns.
    """
    for var in _BLAS_ENV_VARS:
        raw = os.environ.get(var)
        if not raw:
            continue
        try:
            value = int(raw)
        except ValueError:
            continue
        if value >= 1:
            return value
    cpus = planned_cpu_count()
    return plan_blas_threads(cpus, num_workers=1, reserve=reserve_cpus_for(cpus))


def cache_budget_bytes(memory_bytes: int) -> int:
    """Memory-scaled default budget for ``PocketAccelerator``'s GEMM cache.

    A small, fixed fraction of usable memory, bounded to a sane floor/ceiling
    so a tiny dev box still gets a workable cache and a huge host doesn't hand
    the cache unbounded memory. This is only the *default* used when the
    operator hasn't set ``POCKET_ACCEL_BUDGET_MB`` — that env var always wins
    (see ``pocket_accelerator.py``).
    """
    raw = int(memory_bytes * _CACHE_BUDGET_FRACTION)
    return max(_CACHE_BUDGET_FLOOR_BYTES, min(raw, _CACHE_BUDGET_CEILING_BYTES))


@dataclass(frozen=True)
class ResourcePlan:
    cpus: int
    memory_bytes: int
    reserve_cpus: int
    num_streams: int
    blas_threads_per_stream: int
    cache_budget_bytes: int


def compute_resource_plan(num_streams: int = 1) -> ResourcePlan:
    """The one call site that ties CPU, memory, and stream count together.

    ``num_streams`` is never decided here — callers (or their own env vars,
    e.g. ``MAXCORE_NUM_STREAMS``) choose it; this only answers "given that
    many streams, on this host, what's a sensible per-stream BLAS thread
    count, and what's a sensible cache budget."
    """
    cpus = planned_cpu_count()
    memory_bytes = planned_memory_bytes()
    reserve = reserve_cpus_for(cpus)
    streams = max(1, int(num_streams))
    blas_threads = plan_blas_threads(cpus, streams, reserve)
    return ResourcePlan(
        cpus=cpus,
        memory_bytes=memory_bytes,
        reserve_cpus=reserve,
        num_streams=streams,
        blas_threads_per_stream=blas_threads,
        cache_budget_bytes=cache_budget_bytes(memory_bytes),
    )


def _scaled_tile(base: int, blas_threads: int) -> int:
    scale = max(1, min(_MAX_TILE_SCALE, int(blas_threads) // _TILE_BASELINE_THREADS))
    return base * scale


@dataclass(frozen=True)
class GemmTileHint:
    m_tile: int
    k_tile: int
    reduce_tile: int


def gemm_tile_hint(blas_threads: int) -> GemmTileHint:
    """Bounded, resource-aware default tile sizes for ``SiliconSimtEngine``.

    Bigger tiles mean fewer, larger per-tile matmul calls — less Python-level
    lockstep-loop dispatch overhead per unit of work — which only pays off
    when each tile's own matmul can actually use more BLAS parallelism than
    the ~4-thread host these tile defaults were originally measured on (see
    ``silicon_simt_engine.py``'s docstring). ``blas_threads`` should be *this
    process's own* effective BLAS thread count (``effective_blas_threads()``),
    not a raw host CPU count, so a lane worker sharing the host with sibling
    workers gets a tile size sized to its own actual share, not the whole
    host's.

    On a process with ``blas_threads <= 4`` this returns exactly the
    long-standing defaults (256 / 512 / 128) — behavior there is unchanged.
    Growth is bounded (never more than 4x) so a much larger host can't blow up
    per-tile working-set size. This is a bounded planning default, not a
    value measured on real production hardware — the GEMM/attention/conv2d
    correctness suite passes at every scale because tiling only changes
    floating-point accumulation order, never the tiled/untiled algorithm.
    """
    threads = max(1, int(blas_threads))
    return GemmTileHint(
        m_tile=_scaled_tile(_BASE_M_TILE, threads),
        k_tile=_scaled_tile(_BASE_K_TILE, threads),
        reduce_tile=_scaled_tile(_BASE_REDUCE_TILE, threads),
    )
