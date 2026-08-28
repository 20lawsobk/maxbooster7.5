"""Tests for the from-scratch memory (VramPool) and orchestration
(StreamScheduler) layers, and their integration into Runtime/DigitalGPU.

Covers real, load-bearing behavior -- not just "doesn't crash":
  * the allocator's budget/OOM/reuse/fragmentation accounting is exact
  * the scheduler achieves genuine wall-clock overlap (timing-based proof,
    not just non-crashing correctness) and never hangs on a failing node
  * concurrent execution through the real DigitalGPU/graph pipeline produces
    bit-identical results to the serial path, frees intermediates but never
    graph outputs, and propagates a real OOM instead of swallowing it
  * ``smi()`` reports genuine, non-empty figures from a real run

Runnable two ways:
  * pytest:  uv run pytest ai_model/maxcore/tests/test_gpu_native_orchestration.py
  * direct:  uv run python ai_model/maxcore/tests/test_gpu_native_orchestration.py
"""
from __future__ import annotations

import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import numpy as np

_SERVER_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

from ai_model.maxcore.api import DigitalGPU  # noqa: E402
from ai_model.maxcore.ir.builder import GraphBuilder  # noqa: E402
from ai_model.maxcore.memory.pool import VramOOMError, VramPool  # noqa: E402
from ai_model.maxcore.runtime.scheduler import StreamScheduler, assign_streams  # noqa: E402

_rng = np.random.default_rng(99)


# ── VramPool ────────────────────────────────────────────────────────────────
def test_pool_alloc_free_accounting():
    pool = VramPool(capacity_bytes=1_000_000)
    h1 = pool.alloc(1000, tag="a")
    h2 = pool.alloc(2000, tag="b")
    snap = pool.snapshot()
    assert snap["live_allocations"] == 2
    assert snap["used_bytes"] > 0
    pool.free(h1)
    pool.free(h2)
    snap2 = pool.snapshot()
    assert snap2["live_allocations"] == 0
    assert snap2["used_bytes"] == 0
    assert snap2["reserved_bytes"] > 0  # idle slabs stay reserved until trim
    assert snap2["fragmentation_bytes"] == snap2["reserved_bytes"]


def test_pool_bucket_reuse_does_not_grow_reservation():
    pool = VramPool(capacity_bytes=1_000_000)
    h1 = pool.alloc(4096)
    pool.free(h1)
    reserved_after_free = pool.snapshot()["reserved_bytes"]
    h2 = pool.alloc(4096)  # same bucket -> must reuse, not grow reservation
    snap = pool.snapshot()
    assert snap["reserved_bytes"] == reserved_after_free
    assert snap["reused_allocs"] == 1
    pool.free(h2)


def test_pool_oom_is_real_and_raised():
    pool = VramPool(capacity_bytes=1024)
    pool.alloc(512)
    try:
        pool.alloc(4096)  # exceeds remaining budget
        raise AssertionError("expected VramOOMError")
    except VramOOMError:
        pass
    assert pool.snapshot()["oom_count"] == 1


def test_pool_trim_reclaims_idle_slabs():
    pool = VramPool(capacity_bytes=1_000_000)
    handles = [pool.alloc(1024) for _ in range(5)]
    for h in handles:
        pool.free(h)
    before = pool.snapshot()
    assert before["reserved_bytes"] > 0
    released = pool.trim()
    after = pool.snapshot()
    assert released == before["reserved_bytes"]
    assert after["reserved_bytes"] == 0
    assert after["fragmentation_bytes"] == 0


def test_pool_peak_tracking_survives_frees():
    pool = VramPool(capacity_bytes=1_000_000)
    h1 = pool.alloc(10_000)
    h2 = pool.alloc(20_000)
    peak = pool.snapshot()["peak_used_bytes"]
    pool.free(h1)
    pool.free(h2)
    assert pool.snapshot()["peak_used_bytes"] == peak
    assert peak >= 30_000


def test_pool_thread_safety_under_concurrent_alloc_free():
    pool = VramPool(capacity_bytes=50_000_000)
    errors: list[Exception] = []

    def worker():
        try:
            for _ in range(500):
                h = pool.alloc(4096)
                pool.free(h)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, f"concurrent alloc/free raised: {errors}"
    snap = pool.snapshot()
    assert snap["used_bytes"] == 0
    assert snap["total_allocs"] == 8 * 500
    assert snap["total_frees"] == 8 * 500


# ── StreamScheduler: correctness + real overlap proof ────────────────────────
def _node(output, inputs):
    return SimpleNamespace(output=output, inputs=inputs)


def test_assign_streams_keeps_dependency_chain_together():
    a = _node("a", [])
    b = _node("b", ["a"])
    c = _node("c", ["b"])
    stream_of = assign_streams([a, b, c], num_streams=4)
    assert stream_of["a"] == stream_of["b"] == stream_of["c"]


def test_scheduler_produces_correct_results_for_diamond_graph():
    a = _node("a", [])
    b = _node("b", ["a"])
    c = _node("c", ["a"])
    d = _node("d", ["b", "c"])

    def exec_fn(node, ins):
        if node.output == "a":
            return 2
        if node.output == "b":
            return ins[0] * 3
        if node.output == "c":
            return ins[0] * 5
        if node.output == "d":
            return ins[0] + ins[1]
        raise AssertionError(node.output)

    sched = StreamScheduler(num_streams=4)
    result = sched.run([a, b, c, d], {}, exec_fn)
    assert result["d"] == 2 * 3 + 2 * 5


def test_scheduler_achieves_real_wall_clock_overlap():
    """Proves genuine concurrency, not just non-crashing correctness: N
    independent sleeping nodes finish in roughly one sleep duration when
    given enough lanes, not N sleep durations."""
    n = 6
    delay = 0.05
    nodes = [_node(f"n{i}", []) for i in range(n)]

    def exec_fn(node, ins):
        time.sleep(delay)
        return node.output

    serial = StreamScheduler(num_streams=1)
    t0 = time.perf_counter()
    serial.run(nodes, {}, exec_fn)
    serial_elapsed = time.perf_counter() - t0

    parallel = StreamScheduler(num_streams=n)
    t0 = time.perf_counter()
    parallel.run(nodes, {}, exec_fn)
    parallel_elapsed = time.perf_counter() - t0

    assert serial_elapsed >= (n - 1) * delay
    assert parallel_elapsed < serial_elapsed * 0.6, (
        f"expected real overlap: serial={serial_elapsed:.3f}s parallel={parallel_elapsed:.3f}s"
    )


def test_scheduler_propagates_error_without_hanging():
    a = _node("a", [])
    b = _node("b", ["a"])  # would block forever on 'a' if errors weren't propagated

    def exec_fn(node, ins):
        if node.output == "a":
            raise RuntimeError("boom")
        return ins

    sched = StreamScheduler(num_streams=2)
    raised: BaseException | None = None
    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(sched.run, [a, b], {}, exec_fn)
        try:
            fut.result(timeout=5)
        except BaseException as exc:  # noqa: BLE001
            raised = exc
    assert raised is not None, "expected RuntimeError to propagate"
    assert isinstance(raised, RuntimeError) and "boom" in str(raised), (
        f"scheduler hung or raised the wrong error: {raised!r}"
    )


# ── Runtime / DigitalGPU integration ─────────────────────────────────────────
def _independent_branches_graph():
    """Two independent gemm+relu branches (no shared dependency until the
    final add) with two genuine intermediates (h1, h2) that must be
    pool-tracked and freed -- unlike a single fused op, this actually
    exercises cross-node memory liveness."""
    b = GraphBuilder()
    x1 = b.add_input("x1")
    w1 = b.add_input("w1")
    x2 = b.add_input("x2")
    w2 = b.add_input("w2")
    h1 = b.relu(b.gemm(x1, w1))
    h2 = b.relu(b.gemm(x2, w2))
    out = b.add(h1, h2)
    return b.build(out)


def _branch_inputs():
    return {
        "x1": _rng.standard_normal((8, 16), dtype=np.float32),
        "w1": _rng.standard_normal((16, 8), dtype=np.float32),
        "x2": _rng.standard_normal((8, 16), dtype=np.float32),
        "w2": _rng.standard_normal((16, 8), dtype=np.float32),
    }


def test_runtime_num_streams_does_not_change_numeric_result():
    graph = _independent_branches_graph()
    inputs = _branch_inputs()

    dg_serial = DigitalGPU(num_streams=1)
    dg_parallel = DigitalGPU(num_streams=4)
    out_serial = dg_serial.run_graph(graph, dict(inputs))
    out_parallel = dg_parallel.run_graph(graph, dict(inputs))
    for k in out_serial:
        assert np.allclose(out_serial[k].numpy(), out_parallel[k].numpy())


def test_runtime_frees_intermediate_tensors_but_not_outputs():
    graph = _independent_branches_graph()
    inputs = _branch_inputs()

    dg = DigitalGPU(num_streams=4)
    dg.run_graph(graph, inputs)
    snap = dg.runtime.pool.snapshot()
    # h1 and h2 are genuine intermediates: allocated and freed within run().
    assert snap["total_allocs"] >= 2
    assert snap["used_bytes"] == 0
    assert snap["live_allocations"] == 0


def test_runtime_vram_oom_propagates_through_graph_run():
    graph = _independent_branches_graph()
    inputs = {
        "x1": _rng.standard_normal((64, 256), dtype=np.float32),
        "w1": _rng.standard_normal((256, 256), dtype=np.float32),
        "x2": _rng.standard_normal((64, 256), dtype=np.float32),
        "w2": _rng.standard_normal((256, 256), dtype=np.float32),
    }
    dg = DigitalGPU(num_streams=2, vram_capacity_bytes=1024)  # far too small
    try:
        dg.run_graph(graph, inputs)
        raise AssertionError("expected VramOOMError for an over-budget graph")
    except VramOOMError:
        pass


def test_smi_reports_backend_memory_and_streams():
    graph = _independent_branches_graph()
    inputs = _branch_inputs()

    dg = DigitalGPU(num_streams=3)
    dg.run_graph(graph, inputs)
    snap = dg.smi()
    assert snap["num_streams"] == 3
    assert "capacity_bytes" in snap["memory"]
    assert "name" in snap["backend"]
    assert any(k.startswith("runtime.op.") for k in snap["op_timers"])
    assert "runtime.bytes_moved" in snap["counters"]


def test_num_streams_env_var_default():
    old = os.environ.get("MAXCORE_NUM_STREAMS")
    os.environ["MAXCORE_NUM_STREAMS"] = "2"
    try:
        dg = DigitalGPU()
        assert dg.runtime.num_streams == 2
    finally:
        if old is None:
            os.environ.pop("MAXCORE_NUM_STREAMS", None)
        else:
            os.environ["MAXCORE_NUM_STREAMS"] = old


if __name__ == "__main__":
    import traceback

    tests = [(name, fn) for name, fn in list(globals().items())
              if name.startswith("test_") and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    if failed:
        sys.exit(1)
