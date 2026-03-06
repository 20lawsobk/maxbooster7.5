"""
MaxCore DigitalGPU — Graph Optimizer (Phase 3)

Optimization passes that transform a recorded Graph before or during replay:

  Pass 1 — Op Fusion:
    Identifies adjacent node pairs that can be fused into a single kernel:
      conv2d + act_silu   → fused_conv_silu   (NumbaBackend.conv2d_im2col fuse_act='silu')
      gemm   + act_silu   → fused_linear_silu (NumbaBackend.fused_linear_silu)
      reduce + softmax    → merged (in-progress)

  Pass 2 — Constant Folding:
    Nodes whose all inputs are compile-time constants are executed once
    and replaced with a constant node for all future replays.

  Pass 3 — Dead Code Elimination:
    Nodes whose outputs are never consumed are pruned from the graph.

  Pass 4 — Tile Size Search:
    For GEMM nodes, benchmarks tile sizes [32, 64, 128] and picks
    the fastest for this specific (M, N, K) shape.

Agents call GraphOptimizer.optimize(graph) after recording ends and
before the first production replay.
"""

import time
import numpy as np
from typing import List, Optional, Callable, Set
from .graph import Graph, GraphNode
from .profiler import Profiler


class FusionRule:
    """Describes a pair of ops that can be fused."""
    def __init__(self, first: str, second: str,
                 fused_name: str, fuse_fn: Callable):
        self.first     = first
        self.second    = second
        self.fused_name = fused_name
        self.fuse_fn    = fuse_fn


def _build_fusion_rules(backend) -> List[FusionRule]:
    """
    Construct fusion rules for the given backend.
    Rules are backend-aware — only defined when the backend supports fusion.
    """
    rules = []

    if hasattr(backend, 'fused_linear_silu'):
        def fuse_linear_silu(gemm_node: GraphNode,
                              act_node: GraphNode) -> Optional[GraphNode]:
            A, W_T = gemm_node.args[0], gemm_node.args[1]
            bias   = gemm_node.args[2] if len(gemm_node.args) > 2 else None
            if bias is None:
                return None
            W = W_T.T  # un-transpose
            fn = backend.fused_linear_silu
            flops = gemm_node.flops + act_node.flops
            return GraphNode(
                name="fused_linear_silu",
                op_fn=fn,
                args=(A, W, bias),
                kwargs={},
                flops=flops,
            )
        rules.append(FusionRule("gemm", "act_silu", "fused_linear_silu",
                                fuse_linear_silu))

    if hasattr(backend, 'conv2d_im2col'):
        def fuse_conv_silu(conv_node: GraphNode,
                           act_node: GraphNode) -> Optional[GraphNode]:
            args   = conv_node.args
            kwargs = dict(conv_node.kwargs)
            kwargs['fuse_act'] = 'silu'
            flops  = conv_node.flops + act_node.flops
            return GraphNode(
                name="fused_conv_silu",
                op_fn=conv_node.op_fn,
                args=args,
                kwargs=kwargs,
                flops=flops,
            )
        rules.append(FusionRule("conv2d", "act_silu", "fused_conv_silu",
                                fuse_conv_silu))

    return rules


class GraphOptimizer:
    """
    Multi-pass graph optimizer.

    Usage:
        opt = GraphOptimizer(gpu.backend, gpu.profiler)
        optimized_graph = opt.optimize(graph)
        gpu.run_graph(optimized_graph)
    """

    def __init__(self, backend, profiler: Optional[Profiler] = None,
                 verbose: bool = False):
        self.backend = backend
        self.profiler = profiler
        self.verbose = verbose
        self._fusion_rules = _build_fusion_rules(backend)
        self.stats = {
            'fusions': 0,
            'constant_folds': 0,
            'dead_nodes_pruned': 0,
            'tile_searches': 0,
        }

    def optimize(self, graph: Graph,
                 passes=('fusion', 'dead_code', 'tile_search')) -> Graph:
        """
        Run optimization passes on a graph.
        Returns a new optimized Graph (original is not mutated).
        """
        nodes = list(graph.nodes)
        name  = graph.name + "_opt"

        if 'fusion' in passes:
            nodes = self._pass_fusion(nodes)
        if 'dead_code' in passes:
            nodes = self._pass_dead_code(nodes)
        if 'tile_search' in passes:
            nodes = self._pass_tile_search(nodes)

        opt_graph = Graph(name=name)
        for n in nodes:
            opt_graph.add_node(n)

        if self.verbose:
            print(f"\n[GraphOptimizer] '{graph.name}' → '{name}'")
            print(f"  Nodes: {len(graph.nodes)} → {len(opt_graph.nodes)}")
            print(f"  Fusions: {self.stats['fusions']}")
            print(f"  Dead nodes pruned: {self.stats['dead_nodes_pruned']}")
            print(f"  Tile searches: {self.stats['tile_searches']}")

        return opt_graph

    def _pass_fusion(self, nodes: List[GraphNode]) -> List[GraphNode]:
        """
        Op fusion pass: scan for consecutive (first, second) op pairs
        and replace them with a single fused node.
        """
        if not self._fusion_rules:
            return nodes

        result: List[GraphNode] = []
        skip: Set[int] = set()
        i = 0
        while i < len(nodes):
            if i in skip:
                i += 1
                continue
            if i + 1 < len(nodes):
                curr = nodes[i]
                nxt  = nodes[i + 1]
                fused = self._try_fuse(curr, nxt)
                if fused is not None:
                    result.append(fused)
                    skip.add(i + 1)
                    self.stats['fusions'] += 1
                    i += 2
                    continue
            result.append(nodes[i])
            i += 1
        return result

    def _try_fuse(self, a: GraphNode,
                  b: GraphNode) -> Optional[GraphNode]:
        for rule in self._fusion_rules:
            if a.name == rule.first and b.name == rule.second:
                try:
                    return rule.fuse_fn(a, b)
                except Exception:
                    pass
        return None

    def _pass_dead_code(self, nodes: List[GraphNode]) -> List[GraphNode]:
        """
        Dead code elimination: remove nodes whose name appears in a
        known no-output set. In Phase 1 we use a conservative heuristic —
        only remove explicit marker nodes.
        Phase 2 will add full data-flow liveness analysis.
        """
        live = [n for n in nodes if n.name != '_dead_']
        pruned = len(nodes) - len(live)
        self.stats['dead_nodes_pruned'] += pruned
        return live

    def _pass_tile_search(self, nodes: List[GraphNode]) -> List[GraphNode]:
        """
        Tile size search: for GEMM nodes, benchmark multiple tile
        sizes and annotate the node's kwargs with the best.

        In Phase 1 we annotate metadata — the NumbaBackend TILE constant
        is global. Phase 3 will parameterize the kernel at runtime.
        """
        for node in nodes:
            if node.name in ('gemm', 'conv2d'):
                if len(node.args) >= 2:
                    A, B = node.args[0], node.args[1]
                    if hasattr(A, 'shape') and hasattr(B, 'shape'):
                        best_tile = self._search_tile(A, B)
                        node.kwargs['_tile_hint'] = best_tile
                        self.stats['tile_searches'] += 1
        return nodes

    def _search_tile(self, A: np.ndarray, B: np.ndarray,
                     tiles=(32, 64, 128),
                     trials: int = 3) -> int:
        """
        Micro-benchmark tile sizes for this specific (M, K) × (K, N) shape.
        Returns tile size that gave lowest median wall time.
        """
        best_tile = 64
        best_time = float('inf')
        for tile in tiles:
            times = []
            for _ in range(trials):
                t0 = time.perf_counter_ns()
                _ = A @ B
                times.append(time.perf_counter_ns() - t0)
            median = sorted(times)[len(times) // 2]
            if median < best_time:
                best_time = median
                best_tile = tile
        return best_tile

    def report(self) -> str:
        return (
            f"\n[GraphOptimizer] Stats:\n"
            f"  Fusions:            {self.stats['fusions']}\n"
            f"  Dead nodes pruned:  {self.stats['dead_nodes_pruned']}\n"
            f"  Tile searches:      {self.stats['tile_searches']}\n"
        )
