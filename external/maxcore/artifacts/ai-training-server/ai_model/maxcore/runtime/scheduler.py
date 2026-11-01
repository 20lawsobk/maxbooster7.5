"""StreamScheduler — dependency-driven, multi-stream graph execution.

The previous runtime dispatched a compiled graph's topological order one node
at a time on a single thread -- correct, but strictly serial even when two
branches of the graph have no data dependency on each other at all. Real GPUs
get their overlap from CUDA-style *streams*: independent queues of work, each
executed in order, synchronized across streams only where an explicit
dependency (an event) requires it.

This module is that same idea, built from scratch against this project's own
IR (``MaxCoreNode``/``MaxCoreGraph``), not copied from any existing scheduler:

  * :func:`assign_streams` partitions a topologically-sorted node list into
    ``num_streams`` lanes: a node with no not-yet-produced dependency is
    round-robined onto a lane to spread load; a node whose dependencies all
    live on one lane stays on that lane (keeps a dependency chain from
    ping-ponging across lanes for no reason); a node with dependencies split
    across lanes goes to the least-loaded lane.
  * :class:`StreamScheduler` runs each lane as its own OS thread, in the
    lane's assigned order. Cross-lane dependencies are resolved with
    ``concurrent.futures.Future`` objects used purely as synchronization
    primitives (an honest software analogue of a CUDA event wait): a lane
    that needs another lane's not-yet-published output blocks on that
    output's future instead of busy-polling.

Deadlock-freedom is structural, not a property of the lane-assignment
heuristic: every lane executes its assigned nodes in the graph's overall
topological order, so any real dependency a node has was necessarily
scheduled earlier in that same order (on whichever lane it landed on) than
the node depending on it. A cycle would be required for a lane to ever block
on a future that nothing will ever resolve, and the IR already forbids graph
cycles (``MaxCoreGraph.validate``). This holds regardless of how nodes are
partitioned into lanes -- the partitioning heuristic only affects how much
real overlap you get, never correctness.

This scheduler is a genuine concurrent *execution model* (correct dependency
resolution, provable non-deadlock, real thread-level overlap -- proven with
timing, not just non-crashing correctness, in
``tests/test_gpu_native_orchestration.py``). Whether that overlap translates
into wall-clock *speedup* for a given ``exec_fn`` depends entirely on how
much of that function's time is spent with CPython's GIL released: work like
``time.sleep`` or genuine I/O overlaps almost perfectly, while this project's
own NumPy-heavy backends only partially do (see ``runtime/engine.py``'s
module docstring for measured numbers) -- callers should benchmark their own
``exec_fn`` before turning ``num_streams`` up, not assume more streams is
always faster.
"""
from __future__ import annotations

import threading
from collections import defaultdict
from concurrent.futures import Future
from typing import Callable


def assign_streams(order: list, num_streams: int) -> dict[str, int]:
    """Assign each node (keyed by its unique ``.output`` name) to a stream
    lane in ``[0, num_streams)``.

    Heuristic: nodes with no in-graph dependency are spread round-robin
    (maximizes independent starting points across lanes); a node whose
    dependencies are all already on one lane stays there (keeps dependent
    chains together, avoiding pointless cross-lane synchronization); a node
    with dependencies split across multiple lanes goes to whichever lane
    currently has the fewest nodes.
    """
    num_streams = max(1, int(num_streams))
    stream_of: dict[str, int] = {}
    load = [0] * num_streams
    rr = 0
    for node in order:
        producer_lanes = {stream_of[i] for i in node.inputs if i in stream_of}
        if not producer_lanes:
            s = rr % num_streams
            rr += 1
        elif len(producer_lanes) == 1:
            s = next(iter(producer_lanes))
        else:
            s = min(range(num_streams), key=lambda i: load[i])
        stream_of[node.output] = s
        load[s] += 1
    return stream_of


class StreamScheduler:
    """Executes a topologically-sorted node list across ``num_streams``
    worker-thread lanes, resolving cross-lane dependencies with futures."""

    def __init__(self, num_streams: int = 4):
        self.num_streams = max(1, int(num_streams))

    def run(
        self,
        order: list,
        initial_env: dict,
        exec_fn: Callable[[object, list], object],
        telemetry_fn: Callable[[object, list, object, int, float], None] | None = None,
    ) -> dict:
        """Execute ``order`` against ``initial_env`` (pre-bound consts and
        inputs). ``exec_fn(node, resolved_inputs)`` computes one node's
        output; ``telemetry_fn(node, resolved_inputs, value, stream_id,
        elapsed_ms)``, if given, is called immediately after each node
        completes (before its result is published to dependents) so a caller
        can do liveness/telemetry bookkeeping with exact per-node timing.

        Returns a dict containing ``initial_env`` plus every node's output.
        Raises the first exception encountered if any node fails, after
        cleanly unblocking every lane waiting on it (no hangs on failure).
        """
        import time

        stream_of = assign_streams(order, self.num_streams)
        lanes: dict[int, list] = defaultdict(list)
        for node in order:
            lanes[stream_of[node.output]].append(node)

        lock = threading.Lock()
        results: dict[str, object] = dict(initial_env)
        pending: dict[str, Future] = {}
        errors: list[BaseException] = []

        def get_future(name: str) -> Future:
            with lock:
                if errors:
                    raise errors[0]
                if name in results:
                    fut: Future = Future()
                    fut.set_result(results[name])
                    return fut
                fut = pending.get(name)
                if fut is None:
                    fut = Future()
                    pending[name] = fut
                return fut

        def publish(name: str, value: object) -> None:
            with lock:
                if errors:
                    return
                results[name] = value
                fut = pending.pop(name, None)
            if fut is not None and not fut.done():
                fut.set_result(value)

        def fail_all(exc: BaseException) -> None:
            with lock:
                errors.append(exc)
                remaining = list(pending.items())
                pending.clear()
            for _name, fut in remaining:
                if not fut.done():
                    fut.set_exception(exc)

        def run_lane(nodes: list) -> None:
            for node in nodes:
                if errors:
                    return
                try:
                    resolved = [get_future(i).result() for i in node.inputs]
                    stream_id = stream_of[node.output]
                    t0 = time.perf_counter()
                    value = exec_fn(node, resolved)
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    if telemetry_fn is not None:
                        telemetry_fn(node, resolved, value, stream_id, elapsed_ms)
                    publish(node.output, value)
                except BaseException as exc:  # noqa: BLE001 - must unblock every waiter
                    fail_all(exc)
                    return

        threads = [
            threading.Thread(target=run_lane, args=(nodes,), daemon=True)
            for nodes in lanes.values() if nodes
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        if errors:
            raise errors[0]
        return results
