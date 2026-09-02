"""Tests for resource_plan.py — the CPU/memory/tile-size planning layer.

Runnable two ways:
  * pytest:  uv run pytest ai_model/maxcore/tests/test_resource_plan.py
  * direct:  uv run python ai_model/maxcore/tests/test_resource_plan.py

Synthetic host profiles (4/8/16 logical CPUs, incl. the 16-CPU/64GiB
production target) are exercised via the test-only MAXCORE_PLAN_CPUS /
MAXCORE_PLAN_MEMORY_MB env overrides rather than needing actually-different
hardware in CI/dev. Real-host paths (no override set) are only checked for
sane bounds, never an exact value, since the sandbox running these tests can
vary.
"""
from __future__ import annotations

import os
import sys

_SERVER_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

from ai_model.maxcore.hardware import _BLAS_ENV_VARS, cpu_count  # noqa: E402
from ai_model.maxcore.resource_plan import (  # noqa: E402
    _ENV_CPU_OVERRIDE,
    _ENV_MEMORY_OVERRIDE_MB,
    cache_budget_bytes,
    compute_resource_plan,
    effective_blas_threads,
    gemm_tile_hint,
    planned_cpu_count,
    planned_memory_bytes,
)

_PLAN_ENV_VARS = (_ENV_CPU_OVERRIDE, _ENV_MEMORY_OVERRIDE_MB) + _BLAS_ENV_VARS


def _clean_env():
    """Snapshot + clear every env var these tests touch; caller restores it."""
    saved = {v: os.environ.get(v) for v in _PLAN_ENV_VARS}
    for v in _PLAN_ENV_VARS:
        os.environ.pop(v, None)
    return saved


def _restore_env(saved):
    for v, val in saved.items():
        if val is None:
            os.environ.pop(v, None)
        else:
            os.environ[v] = val


def test_planned_cpu_count_defaults_to_host():
    saved = _clean_env()
    try:
        assert planned_cpu_count() == cpu_count()
    finally:
        _restore_env(saved)


def test_planned_cpu_count_override():
    saved = _clean_env()
    try:
        os.environ[_ENV_CPU_OVERRIDE] = "16"
        assert planned_cpu_count() == 16
        os.environ[_ENV_CPU_OVERRIDE] = "not-a-number"
        assert planned_cpu_count() == cpu_count()  # invalid override ignored
        os.environ[_ENV_CPU_OVERRIDE] = "0"
        assert planned_cpu_count() == cpu_count()  # non-positive override ignored
    finally:
        _restore_env(saved)


def test_planned_memory_bytes_default_is_positive():
    saved = _clean_env()
    try:
        assert planned_memory_bytes() > 0
    finally:
        _restore_env(saved)


def test_planned_memory_bytes_override():
    saved = _clean_env()
    try:
        os.environ[_ENV_MEMORY_OVERRIDE_MB] = "65536"  # 64 GiB production target
        assert planned_memory_bytes() == 65536 * 1024 * 1024
        os.environ[_ENV_MEMORY_OVERRIDE_MB] = "garbage"
        assert planned_memory_bytes() > 0  # invalid override falls back, doesn't crash
    finally:
        _restore_env(saved)


def test_effective_blas_threads_reads_own_process_env():
    saved = _clean_env()
    try:
        for v in _BLAS_ENV_VARS:
            os.environ.pop(v, None)
        os.environ["OMP_NUM_THREADS"] = "7"
        assert effective_blas_threads() == 7
    finally:
        _restore_env(saved)


def test_effective_blas_threads_falls_back_to_reserved_single_stream_plan_when_unset():
    # The fallback must match what configure_blas_threads(num_workers=1)
    # would actually set (reserve included) -- never the raw, unreserved
    # host CPU count, which configure_blas_threads never assigns.
    saved = _clean_env()
    try:
        for v in _BLAS_ENV_VARS:
            os.environ.pop(v, None)
        os.environ[_ENV_CPU_OVERRIDE] = "16"
        assert effective_blas_threads() == 14  # (16 - reserve_cpus_for(16)=2) // 1
    finally:
        _restore_env(saved)


def test_cache_budget_bytes_floor_and_ceiling():
    tiny = 64 * 1024 * 1024  # smaller than the floor itself
    assert cache_budget_bytes(tiny) == 128 * 1024 * 1024
    huge = 1024 * 1024 * 1024 * 1024  # 1 TiB: 3% would blow past the ceiling
    assert cache_budget_bytes(huge) == 2 * 1024 * 1024 * 1024


def test_cache_budget_bytes_mid_range_is_a_fraction_of_memory():
    memory = 8 * 1024 ** 3  # 8 GiB, this dev container's cgroup ceiling
    budget = cache_budget_bytes(memory)
    assert 128 * 1024 * 1024 <= budget <= 2 * 1024 * 1024 * 1024
    assert budget == int(memory * 0.03)


def test_compute_resource_plan_synthetic_4_cpu_dev_profile():
    saved = _clean_env()
    try:
        os.environ[_ENV_CPU_OVERRIDE] = "4"
        os.environ[_ENV_MEMORY_OVERRIDE_MB] = "8192"  # 8 GiB
        plan = compute_resource_plan(num_streams=1)
        assert plan.cpus == 4
        assert plan.reserve_cpus == 1
        assert plan.blas_threads_per_stream == 3  # (4 - 1) // 1
        assert plan.cache_budget_bytes > 0
    finally:
        _restore_env(saved)


def test_compute_resource_plan_synthetic_8_cpu_profile():
    saved = _clean_env()
    try:
        os.environ[_ENV_CPU_OVERRIDE] = "8"
        os.environ[_ENV_MEMORY_OVERRIDE_MB] = "16384"
        plan = compute_resource_plan(num_streams=1)
        assert plan.cpus == 8
        assert plan.reserve_cpus == 1
        assert plan.blas_threads_per_stream == 7  # (8 - 1) // 1
    finally:
        _restore_env(saved)


def test_compute_resource_plan_synthetic_16_cpu_production_profile():
    saved = _clean_env()
    try:
        os.environ[_ENV_CPU_OVERRIDE] = "16"
        os.environ[_ENV_MEMORY_OVERRIDE_MB] = "65536"  # 64 GiB production target
        plan_single = compute_resource_plan(num_streams=1)
        assert plan_single.cpus == 16
        assert plan_single.reserve_cpus == 2
        assert plan_single.blas_threads_per_stream == 14  # (16 - 2) // 1

        # LANES=8: a fully-populated LaneProcessPool must divide, not
        # oversubscribe, the same 16-CPU host.
        plan_lanes = compute_resource_plan(num_streams=8)
        assert plan_lanes.reserve_cpus == 2
        assert plan_lanes.blas_threads_per_stream == 1  # (16 - 2) // 8 == 1

        plan_four = compute_resource_plan(num_streams=4)
        assert plan_four.blas_threads_per_stream == 3  # (16 - 2) // 4
    finally:
        _restore_env(saved)


def test_compute_resource_plan_defaults_num_streams_to_at_least_one():
    saved = _clean_env()
    try:
        os.environ[_ENV_CPU_OVERRIDE] = "4"
        plan = compute_resource_plan(num_streams=0)
        assert plan.num_streams == 1
    finally:
        _restore_env(saved)


def test_gemm_tile_hint_reproduces_current_defaults_on_dev_host_threads():
    # This project's SiliconSimtEngine tile defaults (256/512/128) were sized
    # against this dev host's ~4 effective BLAS threads; anything at or below
    # that baseline must reproduce them exactly -- dev behavior is unchanged.
    for threads in (1, 2, 3, 4):
        hint = gemm_tile_hint(threads)
        assert (hint.m_tile, hint.k_tile, hint.reduce_tile) == (256, 512, 128)


def test_gemm_tile_hint_scales_up_boundedly():
    hint_8 = gemm_tile_hint(8)
    assert (hint_8.m_tile, hint_8.k_tile, hint_8.reduce_tile) == (512, 1024, 256)

    hint_16 = gemm_tile_hint(16)
    assert (hint_16.m_tile, hint_16.k_tile, hint_16.reduce_tile) == (1024, 2048, 512)

    # Growth is capped at 4x -- a much larger host can't blow up tile size.
    hint_100 = gemm_tile_hint(100)
    assert (hint_100.m_tile, hint_100.k_tile, hint_100.reduce_tile) == (1024, 2048, 512)
    assert hint_100.m_tile == hint_16.m_tile


def test_gemm_tile_hint_handles_degenerate_input():
    hint = gemm_tile_hint(0)
    assert (hint.m_tile, hint.k_tile, hint.reduce_tile) == (256, 512, 128)


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()
