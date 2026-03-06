"""
MaxCore DigitalGPU — Graph Engine (Phase 1: Sequential Recording + Replay)

Graphs are first-class execution units in MaxCore. A graph is a recorded
sequence of kernel calls that can be:
  - replayed deterministically
  - partially updated (swap weights without re-recording)
  - inspected by agents for auto-tuning

Phase 1: sequential recording, ordered replay.
Phase 2: dependency analysis, parallel dispatch, fusion passes.
Phase 3: partial update (swap individual node inputs without full re-record).
"""

import time
import threading
from typing import Callable, Any, Dict, List, Optional, Tuple


class GraphNode:
    """
    A single operation node in the execution graph.

    op_fn    : the Python callable that performs the work
    args     : positional arguments (may include np.ndarray inputs)
    kwargs   : keyword arguments
    name     : human-readable label for profiling / visualization
    flops    : estimated FLOP count for this node
    """
    __slots__ = ('name', 'op_fn', 'args', 'kwargs', 'flops',
                 'result', 'duration_ns')

    def __init__(self, name: str, op_fn: Callable,
                 args: tuple, kwargs: dict, flops: int = 0):
        self.name        = name
        self.op_fn       = op_fn
        self.args        = args
        self.kwargs      = kwargs
        self.flops       = flops
        self.result      = None
        self.duration_ns = 0

    def execute(self) -> Any:
        t0           = time.perf_counter_ns()
        self.result  = self.op_fn(*self.args, **self.kwargs)
        self.duration_ns = time.perf_counter_ns() - t0
        return self.result


class Graph:
    """
    A recorded, replayable execution graph.

    Lifecycle:
        g = Graph("unet_forward")
        gpu.begin_graph(g)
        ... run forward pass ...
        gpu.end_graph()
        gpu.run_graph(g)      # replay
    """

    def __init__(self, name: str = "graph"):
        self.name     = name
        self.nodes:   List[GraphNode] = []
        self.outputs: List[Any] = []
        self._total_flops = 0
        self._total_ns    = 0
        self._run_count   = 0

    def add_node(self, node: GraphNode):
        self.nodes.append(node)
        self._total_flops += node.flops

    def run(self) -> List[Any]:
        """Execute all nodes sequentially, return list of results."""
        t0 = time.perf_counter_ns()
        self.outputs = []
        for node in self.nodes:
            self.outputs.append(node.execute())
        self._total_ns  = time.perf_counter_ns() - t0
        self._run_count += 1
        return self.outputs

    def summary(self) -> str:
        lines = [
            f"\nGraph '{self.name}' — {len(self.nodes)} nodes  "
            f"|  {self._total_flops/1e9:.4f} GFLOPs  "
            f"|  {self._total_ns/1e6:.2f} ms  "
            f"|  runs: {self._run_count}",
        ]
        for i, n in enumerate(self.nodes):
            lines.append(
                f"  [{i:03d}] {n.name:<24} "
                f"flops={n.flops:>10,}  "
                f"dur={n.duration_ns/1e6:>7.3f}ms"
            )
        return "\n".join(lines)

    @property
    def total_flops(self) -> int:
        return self._total_flops

    @property
    def total_ms(self) -> float:
        return self._total_ns / 1e6

    @property
    def run_count(self) -> int:
        return self._run_count


class GraphRecorder:
    """
    Context manager that intercepts DigitalGPU calls and records them as nodes.

    When active, calls to gpu.gemm / gpu.attention / etc. are captured
    into the target Graph instead of being executed immediately.
    Note: in Phase 1 we execute AND record so outputs are correct.
    Phase 2 will defer execution and build a pure data-flow graph.
    """

    def __init__(self):
        self._active_graph: Optional[Graph] = None
        self._lock = threading.Lock()

    @property
    def is_recording(self) -> bool:
        return self._active_graph is not None

    @property
    def active_graph(self) -> Optional[Graph]:
        return self._active_graph

    def begin(self, graph: Graph):
        with self._lock:
            if self._active_graph is not None:
                raise RuntimeError(
                    f"Cannot begin graph '{graph.name}': "
                    f"already recording '{self._active_graph.name}'"
                )
            self._active_graph = graph

    def end(self) -> Graph:
        with self._lock:
            g = self._active_graph
            if g is None:
                raise RuntimeError("end_graph() called without begin_graph()")
            self._active_graph = None
            return g

    def record_node(self, name: str, op_fn: Callable,
                    args: tuple, kwargs: dict, flops: int = 0) -> Any:
        """
        Execute op_fn immediately (so downstream ops get correct inputs)
        and also record it as a graph node for future replay.
        """
        node = GraphNode(name=name, op_fn=op_fn,
                         args=args, kwargs=kwargs, flops=flops)
        result = node.execute()
        with self._lock:
            if self._active_graph is not None:
                self._active_graph.add_node(node)
        return result
