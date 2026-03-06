"""
MaxCore DigitalGPU — Profiler
Per-kernel FLOPs, bandwidth, wall-time counters with trace export.

Each call to a DigitalGPU op atomically updates the kernel counter for
that op type. Agents can read, reset, and auto-tune based on this data.
"""

import time
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class KernelStat:
    name: str
    calls:     int   = 0
    flops:     int   = 0          # total floating-point ops
    bytes_in:  int   = 0          # bytes read from memory
    bytes_out: int   = 0          # bytes written to memory
    wall_ns:   int   = 0          # wall-clock time in nanoseconds

    @property
    def gflops(self) -> float:
        return self.flops / 1e9

    @property
    def avg_ms(self) -> float:
        if self.calls == 0:
            return 0.0
        return (self.wall_ns / self.calls) / 1e6

    @property
    def bandwidth_gb(self) -> float:
        if self.wall_ns == 0:
            return 0.0
        total_bytes = self.bytes_in + self.bytes_out
        return (total_bytes / self.wall_ns) * 1.0

    def __repr__(self):
        return (f"KernelStat({self.name}: calls={self.calls}, "
                f"gflops={self.gflops:.3f}, avg_ms={self.avg_ms:.2f})")


@dataclass
class TraceEvent:
    op:       str
    start_ns: int
    end_ns:   int
    flops:    int
    shape_in: tuple
    shape_out: tuple
    backend:  str = "cpu"

    @property
    def duration_ms(self) -> float:
        return (self.end_ns - self.start_ns) / 1e6


class Profiler:
    """
    Thread-safe per-kernel profiler for MaxCore ops.

    Usage:
        prof = Profiler()
        with prof.record("gemm", flops=2*M*N*K, bytes_in=..., bytes_out=...):
            result = backend.gemm(...)
        prof.report()
    """

    def __init__(self, enabled: bool = True, trace: bool = False):
        self.enabled = enabled
        self.trace   = trace
        self._lock   = threading.Lock()
        self._stats: Dict[str, KernelStat] = {}
        self._events: List[TraceEvent] = []

    def record(self, op_name: str, flops: int = 0,
               bytes_in: int = 0, bytes_out: int = 0,
               shape_in: tuple = (), shape_out: tuple = (),
               backend: str = "cpu"):
        """Context manager — wraps a kernel call with timing and accounting."""
        return _KernelTimer(self, op_name, flops, bytes_in, bytes_out,
                            shape_in, shape_out, backend)

    def _update(self, op_name: str, flops: int, bytes_in: int, bytes_out: int,
                start_ns: int, end_ns: int,
                shape_in: tuple, shape_out: tuple, backend: str):
        elapsed = end_ns - start_ns
        with self._lock:
            if op_name not in self._stats:
                self._stats[op_name] = KernelStat(name=op_name)
            s = self._stats[op_name]
            s.calls     += 1
            s.flops     += flops
            s.bytes_in  += bytes_in
            s.bytes_out += bytes_out
            s.wall_ns   += elapsed

            if self.trace:
                self._events.append(TraceEvent(
                    op=op_name, start_ns=start_ns, end_ns=end_ns,
                    flops=flops, shape_in=shape_in, shape_out=shape_out,
                    backend=backend,
                ))

    def reset(self):
        with self._lock:
            self._stats.clear()
            self._events.clear()

    def stats(self) -> Dict[str, KernelStat]:
        with self._lock:
            return dict(self._stats)

    def report(self) -> str:
        with self._lock:
            if not self._stats:
                return "No profiling data recorded."
            lines = [
                "",
                "┌─────────────────────────────────────────────────────────────────────────┐",
                "│                      MaxCore DigitalGPU  —  Kernel Report               │",
                "├──────────────────┬────────┬──────────┬──────────┬────────────┬──────────┤",
                "│ Op               │ Calls  │ GFLOPs   │ Avg (ms) │ Total (ms) │ BW (GB/s)│",
                "├──────────────────┼────────┼──────────┼──────────┼────────────┼──────────┤",
            ]
            total_flops = 0
            total_ns    = 0
            for name, s in sorted(self._stats.items(),
                                   key=lambda x: -x[1].wall_ns):
                total_flops += s.flops
                total_ns    += s.wall_ns
                lines.append(
                    f"│ {name:<16} │ {s.calls:>6} │ {s.gflops:>8.4f} │"
                    f" {s.avg_ms:>8.2f} │ {s.wall_ns/1e6:>10.1f} │"
                    f" {s.bandwidth_gb:>8.2f} │"
                )
            lines += [
                "├──────────────────┴────────┴──────────┴──────────┴────────────┴──────────┤",
                f"│ TOTAL  GFLOPs: {total_flops/1e9:>8.4f}   Wall: {total_ns/1e6:>8.1f} ms"
                f"{'':>27}│",
                "└─────────────────────────────────────────────────────────────────────────┘",
                "",
            ]
            return "\n".join(lines)

    def export_trace(self) -> List[dict]:
        """Export Chrome tracing format events for timeline visualization."""
        with self._lock:
            return [
                {
                    "name":  e.op,
                    "ph":    "X",
                    "ts":    e.start_ns / 1000,
                    "dur":   (e.end_ns - e.start_ns) / 1000,
                    "pid":   0,
                    "tid":   0,
                    "args":  {
                        "flops":    e.flops,
                        "shape_in": str(e.shape_in),
                        "shape_out": str(e.shape_out),
                        "backend":  e.backend,
                        "dur_ms":   e.duration_ms,
                    }
                }
                for e in self._events
            ]


class _KernelTimer:
    """Internal context manager returned by Profiler.record()."""

    __slots__ = ('_prof', '_op', '_flops', '_bin', '_bout',
                 '_sin', '_sout', '_backend', '_t0')

    def __init__(self, prof, op, flops, bytes_in, bytes_out,
                 shape_in, shape_out, backend):
        self._prof    = prof
        self._op      = op
        self._flops   = flops
        self._bin     = bytes_in
        self._bout    = bytes_out
        self._sin     = shape_in
        self._sout    = shape_out
        self._backend = backend
        self._t0      = 0

    def __enter__(self):
        if self._prof.enabled:
            self._t0 = time.perf_counter_ns()
        return self

    def __exit__(self, *_):
        if self._prof.enabled:
            t1 = time.perf_counter_ns()
            self._prof._update(
                self._op, self._flops, self._bin, self._bout,
                self._t0, t1, self._sin, self._sout, self._backend,
            )


_global_profiler = Profiler(enabled=True, trace=False)


def get_profiler() -> Profiler:
    return _global_profiler


def enable_trace():
    _global_profiler.trace = True


def disable_trace():
    _global_profiler.trace = False
