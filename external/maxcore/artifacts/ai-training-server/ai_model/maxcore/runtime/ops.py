"""Pure per-node op dispatch, shared by the in-process and multi-process
execution paths.

This module holds the parts of node execution that depend only on
``(backend, node, resolved_inputs)`` -- no ``Runtime`` instance state, no
scheduler, no pool. That purity is exactly what makes it safe to call from
inside a worker *process* spawned by ``runtime/process_pool.py``: a spawned
process gets a fresh interpreter and can freely ``from .ops import exec_op``
without dragging in any non-picklable ``Runtime``/``StreamScheduler`` state.

``engine.py`` (the single-process path, ``num_streams<=1``) and
``process_pool.py`` (the multi-process path, ``num_streams>1``) both call
these same functions, so the two execution strategies can never numerically
disagree about what a node computes or how its telemetry is measured.
"""
from __future__ import annotations

import numpy as np

from ..ir.nodes import OpType
from ..tensor import Tensor


def _nbytes(value: object) -> int:
    if isinstance(value, Tensor):
        return int(value.data.nbytes)
    nb = getattr(value, "nbytes", None)
    if nb is not None:
        return int(nb)
    return 0


def _to_numpy(value: object):
    return value.data if isinstance(value, Tensor) else np.asarray(value)


def _estimate_flops(node, ins: list, out: object) -> int:
    """Best-effort FLOP estimate for telemetry (GFLOP/s reporting). Returns 0
    for anything it can't confidently size -- an estimate must never crash a
    real graph run, so any shape surprise fails open to "unknown", not to an
    exception."""
    try:
        op = node.op_type
        if op == OpType.GEMM:
            a, b = _to_numpy(ins[0]), _to_numpy(ins[1])
            m = a.shape[-2] if a.ndim >= 2 else 1
            k = a.shape[-1]
            n = b.shape[-1] if b.ndim >= 2 else 1
            batch = 1
            for d in a.shape[:-2]:
                batch *= d
            return int(2 * batch * m * k * n)
        if op == OpType.CONV2D:
            x, w = _to_numpy(ins[0]), _to_numpy(ins[1])
            n_, c, _h, _w = x.shape
            o, _cw, kh, kw = w.shape
            out_arr = _to_numpy(out)
            ho, wo = out_arr.shape[-2], out_arr.shape[-1]
            return int(2 * n_ * o * c * kh * kw * ho * wo)
        if op == OpType.ATTENTION:
            q, k = _to_numpy(ins[0]), _to_numpy(ins[1])
            t_q, d = q.shape[-2], q.shape[-1]
            t_k = k.shape[-2]
            batch = 1
            for dd in q.shape[:-2]:
                batch *= dd
            return int(4 * batch * t_q * t_k * d)  # Q@K^T + probs@V
        if op == OpType.MLP:
            x, w1, w2 = _to_numpy(ins[0]), _to_numpy(ins[1]), _to_numpy(ins[3])
            m = 1
            for d in x.shape[:-1]:
                m *= d
            k1, n1 = w1.shape
            k2, n2 = w2.shape
            return int(2 * m * k1 * n1 + 2 * m * k2 * n2)
    except Exception:
        return 0
    return 0


def exec_op(backend, node, ins: list):
    """Dispatch one ``MaxCoreNode`` to ``backend`` given its resolved inputs.

    A pure function of its three arguments -- identical behavior whether
    called in the coordinator process (serial path) or inside a lane worker
    process (multi-process path)."""
    b = backend
    op = node.op_type
    a = node.attrs
    if op == OpType.GEMM:
        bias = ins[2] if a.get("has_bias") and len(ins) > 2 else None
        return b.gemm(ins[0], ins[1], bias=bias, activation=a.get("activation"))
    if op == OpType.ADD:
        return b.add(ins[0], ins[1])
    if op == OpType.RELU:
        return b.relu(ins[0])
    if op == OpType.SOFTMAX:
        return b.softmax(ins[0], axis=a.get("axis", -1))
    if op == OpType.ATTENTION:
        mask = ins[3] if a.get("has_mask") and len(ins) > 3 else None
        return b.attention(ins[0], ins[1], ins[2], mask=mask, causal=a.get("causal", False))
    if op == OpType.CONV2D:
        bias = ins[2] if a.get("has_bias") and len(ins) > 2 else None
        return b.conv2d(ins[0], ins[1], bias=bias,
                        stride=a.get("stride", 1), padding=a.get("padding", 0))
    if op == OpType.MLP:
        return b.mlp(ins[0], ins[1], ins[2], ins[3], ins[4],
                     activation=a.get("activation", "relu"))
    if op == OpType.REDUCE:
        return b.reduce(ins[0], a["op"], a["axis"], a.get("keepdims", False))
    if op == OpType.COPY:
        return ins[0]
    if op == OpType.BARRIER:
        return ins[0] if ins else None
    raise ValueError(f"runtime: unknown op '{op}'")
