"""Deterministic awareness math dispatched through the software DigitalGPU.

Host code parses/network-fetches; this backend performs normalization and ranking.
This is real NumPy/SIMD software execution, not a physical GPU claim.
"""
import threading
from collections import Counter
import numpy as np
from ai_model.maxcore.api import DigitalGPU
from ai_model.maxcore.backend.cpu_backend import DigitalGPUBackend


class AwarenessBackend(DigitalGPUBackend):
    name = "digital_gpu_awareness_software"

    def rank(self, values, inverse=False):
        a = np.asarray(values, dtype=np.float64)
        if a.ndim != 1 or not a.size or not np.isfinite(a).all() or (a < 0).any():
            raise ValueError("Invalid awareness measurements")
        if inverse:
            if (a <= 0).any():
                raise ValueError("Chart position must be positive")
            a = np.reciprocal(a)
        scores = a / np.maximum(np.max(a), 1.0)
        order = np.argsort(-scores, kind="stable")
        return scores.tolist(), order.tolist()

    def sum_counts(self, values):
        a = np.asarray(values, dtype=np.float64)
        if a.ndim != 2 or not np.isfinite(a).all() or (a < 0).any():
            raise ValueError("Invalid engagement counts")
        return np.sum(a, axis=1).tolist()


class AwarenessGPU(DigitalGPU):
    def __init__(self):
        super().__init__(backend=AwarenessBackend(), deterministic=True, num_streams=1)
        self.completed = 0
        self.operations = Counter()
        self.lock = threading.Lock()

    def rank(self, values, inverse=False):
        with self.lock:
            result = self.backend.rank(values, inverse=inverse)
            self.completed += 1
            self.operations["rank"] += 1
            return result

    def sum_counts(self, values):
        with self.lock:
            result = self.backend.sum_counts(values)
            self.completed += 1
            self.operations["sum_counts"] += 1
            return result


_gpu = None
_lock = threading.Lock()


def get_gpu():
    global _gpu
    with _lock:
        if _gpu is None:
            _gpu = AwarenessGPU()
    return _gpu


def rank_signals(values, inverse=False):
    return get_gpu().rank(values, inverse=inverse)


def sum_counts(values):
    return get_gpu().sum_counts(values)


def telemetry():
    with _lock:
        gpu = _gpu
    if gpu is None:
        return {"backend": AwarenessBackend.name, "completed": 0, "operations": {}}
    with gpu.lock:
        return {"backend": gpu.backend.name, "completed": gpu.completed,
                "operations": dict(gpu.operations)}