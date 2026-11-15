"""
Real software GPU virtualization: Deficit Round Robin (Shreedhar & Varghese,
1995) time-slicing across multiple tenant "virtual GPUs" sharing one
underlying compute resource.

Honesty boundary, stated up front: this is the same category NVIDIA shipped
for years as "time-sliced vGPU" -- software-scheduled sharing of one GPU
across tenants -- as distinct from MIG's later hardware spatial partitioning
(MIG fuses off physical die regions; that requires real GPU silicon this
container does not have, so it is not reproduced here). Virtualization
changes WHO gets access to a compute resource and WHEN, under an enforced
fairness/isolation contract; it has never claimed to change how fast the
underlying resource runs. The resource being shared below is real CPU work
(numpy, or a tools.native_simt kernel launch through the identical
`submit()` interface) -- same CPU-class throughput ceiling documented
everywhere else in this project's GPU work.

Isolation model: each tenant is a separate TenantContext object with its own
queue and accounting; one tenant's job closures cannot reach another
tenant's queue/state (namespace isolation), which is the real isolation
boundary software virtualization provides. This is not hardware page-table
/IOMMU isolation -- there is no physical device here for an IOMMU to
protect in the first place.
"""

from __future__ import annotations

import time
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, Dict, List, Optional


@dataclass
class KernelJob:
    tenant_id: str
    fn: Callable[[], None]
    cost: float  # declared job size (like a packet's byte length in classic DRR)
    label: str = ""


@dataclass
class TenantContext:
    """One isolated virtual GPU context / tenant."""
    tenant_id: str
    weight: float                     # configured quota share
    queue: Deque[KernelJob] = field(default_factory=deque)
    deficit: float = 0.0
    jobs_submitted: int = 0
    jobs_run: int = 0
    total_wall_s: float = 0.0


class VGPUTimeSlicer:
    """
    Deficit Round Robin scheduler. Each round every tenant with pending work
    receives deficit += weight*quantum; while its head-of-queue job costs no
    more than its current deficit, that job runs and the cost is deducted.
    Control then rotates to the next tenant -- this is what makes it
    time-SLICING (real interleaving) rather than drain-one-queue-then-the-next.

    Per the DRR spec, a tenant's deficit resets to 0 when its queue empties,
    so an idle tenant cannot bank credit while absent and then monopolize the
    resource when it returns.
    """

    def __init__(self, quantum: float = 1.0):
        self.quantum = quantum
        self.tenants: Dict[str, TenantContext] = {}
        self.execution_log: List[str] = []  # tenant_id per job, in run order
        self._lock = threading.Lock()

    def add_tenant(self, tenant_id: str, weight: float) -> TenantContext:
        with self._lock:
            ctx = TenantContext(tenant_id=tenant_id, weight=weight)
            self.tenants[tenant_id] = ctx
            return ctx

    def submit(self, tenant_id: str, fn: Callable[[], None], cost: float = 1.0, label: str = "") -> None:
        ctx = self.tenants[tenant_id]
        ctx.queue.append(KernelJob(tenant_id, fn, cost, label))
        ctx.jobs_submitted += 1

    def _any_pending(self) -> bool:
        return any(ctx.queue for ctx in self.tenants.values())

    def run_until_idle(self, max_rounds: int = 1_000_000) -> int:
        rounds = 0
        while self._any_pending() and rounds < max_rounds:
            for ctx in self.tenants.values():
                if not ctx.queue:
                    ctx.deficit = 0.0  # DRR rule: no credit banking while idle
                    continue
                ctx.deficit += ctx.weight * self.quantum
                while ctx.queue and ctx.queue[0].cost <= ctx.deficit:
                    job = ctx.queue.popleft()
                    start = time.perf_counter()
                    job.fn()
                    elapsed = time.perf_counter() - start
                    ctx.total_wall_s += elapsed
                    ctx.jobs_run += 1
                    ctx.deficit -= job.cost
                    self.execution_log.append(ctx.tenant_id)
            rounds += 1
        return rounds

    def stats(self) -> Dict[str, dict]:
        return {
            tid: {
                "weight": c.weight,
                "jobs_submitted": c.jobs_submitted,
                "jobs_run": c.jobs_run,
                "total_wall_s": c.total_wall_s,
            }
            for tid, c in self.tenants.items()
        }
