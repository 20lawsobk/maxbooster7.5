"""SiliconSimtEngine — a from-scratch, genuinely-executing software model of
custom lockstep-SIMT-with-predication silicon.

This engine is the software continuation of this project's own synthesized
RTL GPU core (hardware/digital_gpu_core/gpu_core.v): a single shared program
counter issues one instruction per cycle to a fixed-width group of ALU lanes
(``LANES``, matching the RTL's ``parameter LANES = 8``); a lane can be masked
out of the current warp/tile by a predicate (``OP_PRED``) and only resumes
committing results after the predicate is reset (``OP_RSTP``). Nothing here is
a timing/performance *simulation* — contrast ``ai_model/gpu/silicon_model.py``,
which explicitly reports *estimated* figures. Every call here actually
performs the floating point work and returns the real numeric result,
instrumented with real, load-bearing execution counters (cycles issued, lanes
committed, instructions retired) rather than modeled/guessed ones.

Architectural honesty about what is, and isn't, "custom" here:
  * The EXECUTION MODEL — how a GEMM is decomposed into lockstep tiles, how a
    tile's lane group is padded and predicated at the M boundary, and (most
    consequentially) how attention's causal/mask handling uses genuine
    per-position *exclusion* from a lockstep reduction instead of the
    industry-standard additive ``-1e9`` bias every other backend in this
    codebase uses — is an original design, derived only from this project's
    own RTL, not from any existing commercial GPU/TPU architecture.
  * The bounded, per-tile fused-multiply-add that executes *within* one
    lockstep cycle uses a small NumPy matrix product as its "ALU array" — the
    same way the RTL's own ALU is, at the gate level, built from a foundry
    standard-cell library rather than hand-invented transistors. Tile sizes
    (``m_tile``/``k_tile``) are kept small and bounded by construction (never
    the whole problem in one call) so this stays "the circuit that executes
    one cycle", not "the whole job handed to an outside library". Empirically
    (see the backend module docstring for measurements), this tiled-execution
    design is ~40-100x faster than issuing one Python-level lockstep cycle per
    scalar reduction step, which is what makes it realistic to run as this
    process's default compute path rather than a toy that only proves a point
    on tiny inputs.
  * Reductions over the K/temporal axis are *blocked* (grouped into
    ``k_tile``-sized bursts) rather than issued one cycle per scalar step:
    real hardware pipelines a block of MAC cycles back-to-back with no stall,
    so a block of K is the honest granularity for "one issued instruction",
    not a philosophical shortcut.
"""
from __future__ import annotations

import threading

import numpy as np

LANES = 8  # matches `parameter LANES = 8` in hardware/digital_gpu_core/gpu_core.v


class SiliconSimtEngine:
    """Lockstep-SIMT engine with single-level sticky predication.

    Parameters
    ----------
    lanes:
        Width of one warp/tile group -- the number of ALU lanes that receive
        the same shared instruction each cycle. Defaults to the RTL's LANES.
    m_tile, k_tile:
        Tile sizes for the GEMM's output-row and reduction axes. These bound
        the amount of work one lockstep cycle performs (cache-blocked; the
        defaults were chosen from wall-clock measurements on the shapes this
        engine's real callers actually use -- see
        ai_model/maxcore/backend/silicon_simt_backend.py).
    reduce_tile:
        Block size for ``masked_reduce``'s predicated scan.
    """

    def __init__(self, lanes: int = LANES, m_tile: int = 256, k_tile: int = 512,
                 reduce_tile: int = 128):
        if lanes < 1:
            raise ValueError("lanes must be >= 1")
        self.lanes = int(lanes)
        self.m_tile = max(self.lanes, int(m_tile))
        self.k_tile = max(1, int(k_tile))
        self.reduce_tile = max(1, int(reduce_tile))
        self.cycles_issued = 0
        self.lanes_committed = 0
        self.instructions_retired = 0
        # Real hardware performance counters are atomic increments shared
        # across every lane/SM; this engine now has genuine concurrent
        # callers (the orchestration layer's stream scheduler dispatches
        # independent graph nodes to worker threads that share one engine
        # instance), so the same counters need the software equivalent -- a
        # lock around the read-modify-write -- or concurrent `+=` calls lose
        # updates. The lock only guards the cheap bookkeeping increment, not
        # the actual FMA compute, so genuine cross-thread execution overlap
        # is preserved.
        self._counter_lock = threading.Lock()

    # ── ISA-mirroring predicate primitives (OP_RSTP / OP_PRED) ───────────────
    def reset_predicate(self, shape) -> np.ndarray:
        """OP_RSTP: (re)activate every lane -- the predicate state a fresh
        warp starts with, before any conditional narrowing."""
        return np.ones(shape, dtype=bool)

    def predicate(self, active: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """OP_PRED: narrow the active set by ANDing in a new condition. A lane
        masked off here stays off until reset -- gpu_core.v's single-level
        sticky predicate register, not a stack."""
        return np.logical_and(active, cond)

    def _issue_cycle(self, active: np.ndarray) -> None:
        """Issue one lockstep cycle: every lane in `active` executes the
        shared instruction and commits its result; predicated-off lanes do
        not commit. Mirrors gpu_core.v's single-PC fetch + per-lane
        predicate-gated writeback."""
        committed = int(np.count_nonzero(active))
        with self._counter_lock:
            self.cycles_issued += 1
            self.lanes_committed += committed

    def reset_stats(self) -> None:
        with self._counter_lock:
            self.cycles_issued = 0
            self.lanes_committed = 0
            self.instructions_retired = 0

    def stats(self) -> dict:
        return {
            "lanes": self.lanes,
            "m_tile": self.m_tile,
            "k_tile": self.k_tile,
            "reduce_tile": self.reduce_tile,
            "cycles_issued": self.cycles_issued,
            "lanes_committed": self.lanes_committed,
            "instructions_retired": self.instructions_retired,
        }

    # ── GEMM: tiled lockstep multiply-accumulate ─────────────────────────────
    def gemm(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        """C = A @ B, executed as a lockstep tile-by-tile accumulation.

        The M axis is padded to a multiple of ``lanes`` (a warp is always a
        full lane-group wide, even at the boundary) and the resulting tail
        lanes are predicated off (OP_PRED) for the whole call -- they still
        run every cycle, exactly like a real partially-full warp, but never
        commit into the returned result. M and K are then tiled at
        ``m_tile``/``k_tile`` granularity and accumulated lockstep-cycle by
        lockstep-cycle.
        """
        A = np.ascontiguousarray(a, dtype=np.float32)
        B = np.ascontiguousarray(b, dtype=np.float32)
        if A.ndim != 2 or B.ndim != 2 or A.shape[1] != B.shape[0]:
            raise ValueError(f"gemm: incompatible shapes {A.shape} x {B.shape}")
        M, K = A.shape
        _, N = B.shape
        if M == 0 or N == 0:
            return np.zeros((M, N), dtype=np.float32)

        lanes = self.lanes
        pad_m = (-M) % lanes
        Ap = np.pad(A, ((0, pad_m), (0, 0))) if pad_m else A
        Mp = M + pad_m

        # OP_PRED: padded tail rows run every cycle but never commit to the
        # real output -- exactly like a hardware warp that's only partially
        # full at the M boundary.
        active_rows = self.predicate(self.reset_predicate(Mp), np.arange(Mp) < M)

        acc = np.zeros((Mp, N), dtype=np.float32)
        k_tile = max(1, min(self.k_tile, K)) if K > 0 else 1
        for m0 in range(0, Mp, self.m_tile):
            m1 = min(m0 + self.m_tile, Mp)
            for k0 in range(0, K, k_tile):
                k1 = min(k0 + k_tile, K)
                a_blk = Ap[m0:m1, k0:k1]
                b_blk = B[k0:k1, :]
                # Bounded fused multiply-accumulate for this tile/cycle -- the
                # "ALU array" a real lane group would execute this burst with.
                acc[m0:m1, :] += a_blk @ b_blk
                self._issue_cycle(active_rows[m0:m1])
        self.instructions_retired += 1
        return acc[:M, :]

    # ── Predicated lockstep reduction (max / sum) ────────────────────────────
    def masked_reduce(self, x: np.ndarray, axis: int, active: np.ndarray,
                       op: str = "max") -> np.ndarray:
        """Reduce ``x`` along ``axis``, honoring a per-position active
        predicate -- the software analogue of a lockstep scan where only
        predicated-active lanes contribute to the running accumulator each
        cycle. This is the primitive that gives SiliconSimtBackend.attention
        its genuine causal/mask *exclusion* semantics (see
        silicon_simt_backend.py), as opposed to biasing scores with a large
        negative additive constant.

        Blocked in chunks of ``reduce_tile`` positions so a long axis costs
        O(len/reduce_tile) lockstep cycles; every position inside a block is
        still individually masked (via its own identity element) before the
        block's reduction, so no position is silently mis-included.
        """
        if op not in ("max", "sum"):
            raise ValueError(f"masked_reduce: unsupported op '{op}'")
        x_arr = np.asarray(x, dtype=np.float32)
        # Broadcast `active` against x's ORIGINAL (pre-moveaxis) shape using
        # NumPy's standard trailing-aligned rule -- this is what lets a caller
        # pass a lower-rank mask (e.g. a [T_q, T_k] causal mask against a
        # [B, H, T_q, T_k] batched score tensor). Moving `axis` to the front
        # on each operand BEFORE this broadcast would misalign a lower-rank
        # mask's remaining axes against the higher-rank tensor's middle
        # (batch/head) axes instead of its trailing ones.
        active_full = np.broadcast_to(np.asarray(active, dtype=bool), x_arr.shape)
        x_m = np.moveaxis(x_arr, axis, 0)
        active_m = np.moveaxis(active_full, axis, 0)
        length = x_m.shape[0]
        if op == "max":
            acc = np.full(x_m.shape[1:], -np.inf, dtype=np.float32)
        else:
            acc = np.zeros(x_m.shape[1:], dtype=np.float32)
        if length == 0:
            return acc
        identity = -np.inf if op == "max" else 0.0
        rb = self.reduce_tile
        for t0 in range(0, length, rb):
            t1 = min(t0 + rb, length)
            block_active = active_m[t0:t1]
            masked = np.where(block_active, x_m[t0:t1], identity)
            if op == "max":
                acc = np.maximum(acc, np.max(masked, axis=0))
            else:
                acc = acc + np.sum(masked, axis=0)
            self._issue_cycle(np.any(block_active, axis=0))
        return acc
