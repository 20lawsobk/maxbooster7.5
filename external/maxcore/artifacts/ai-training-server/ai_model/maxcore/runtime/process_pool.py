"""LaneProcessPool — process-backed multi-stream execution.

``StreamScheduler`` (``scheduler.py``) proves genuine, deadlock-free
concurrency for independent graph branches, but the measured, honest result
in ``tests/benchmark_gpu_native.py`` is that OS *threads* are a net loss for
this project's actual NumPy-bound kernels: CPython's GIL means only the
sliver of each op that's already in native code (BLAS, etc.) runs
concurrently, while the Python-level tiling/dispatch bookkeeping around it
serializes anyway, plus thread-scheduling/GIL-handoff overhead on top. Two
Python threads computing GEMMs do not get two CPU cores' worth of GEMM.

Two OS *processes* do. This module is the second, genuinely-parallel
execution strategy: one long-lived worker process per stream/lane, each
running its own real Python interpreter (so its own real, separate GIL),
executing its lane's nodes with true wall-clock overlap on separate cores.
``runtime/engine.py`` routes ``Runtime.run()`` here whenever
``num_streams > 1``; ``num_streams <= 1`` keeps the original, unchanged
serial path.

What moving to processes changes, and how this module handles it:

  * **No shared memory.** ``VramPool`` (``memory/pool.py``) stays exactly as
    it was written -- a single instance living in the *coordinator* process
    only. Worker processes never touch it directly; they report each node's
    output size, aliasing, and timing back to the coordinator as small,
    cheap-to-pickle ``_TelemetryMsg`` messages, and the coordinator performs
    every ``alloc``/``free`` call itself. This mirrors how a real multi-context
    GPU driver centralizes its memory manager -- the accounting is a byte
    ledger, not the tensor data, so it never needs to leave the coordinator.
  * **No shared futures, and no hub-and-spoke relay either.** Cross-lane data
    dependencies (``scheduler.py``'s ``concurrent.futures.Future``) become
    explicit messages, routed as a direct mesh: every lane is handed every
    other lane's data-inbox queue at construction, and the coordinator
    computes, once per ``run()``, exactly which lanes need each node's output
    (``LaneProcessPool.run``'s ``name_to_targets``). A worker whose node
    output another lane needs puts a ``_ValueMsg`` directly on that lane's
    inbox -- one hop, not two. The coordinator only ever *receives*
    ``_ValueMsg``s for actual graph outputs (it must materialize those to
    return them); it never re-sends a value it didn't itself need. A lane
    blocked on an input it doesn't have yet simply blocks on its own inbox
    queue -- the direct process analogue of blocking on a ``Future``. Each
    lane's external inputs that come straight from ``initial_env`` (rather
    than another lane's output) are embedded directly in its ``_RunJob``
    instead of sent as separate messages, since the coordinator already knows
    them before dispatch and a worker can seed its local env from them for
    free.
  * **Persistent, not spawn-per-run.** Starting a Python process and
    re-importing NumPy/this package costs on the order of 100+ ms -- often
    more than an entire small graph run. Paying that cost once per
    ``Runtime``/``DigitalGPU`` instance (at construction) and reusing the same
    worker processes for every subsequent ``run()`` call is what turns
    process-based parallelism into a net win instead of trading GIL overhead
    for process-churn overhead. See ``tests/benchmark_gpu_native.py`` for the
    measured before/after.
  * **Every queue is created once, before any process starts, and never
    recreated.** ``multiprocessing`` only allows a ``Queue`` to cross into a
    worker through inheritance at ``Process`` construction -- a *new* Queue
    created later and handed to an already-running worker via a message
    raises ``RuntimeError: Queue objects should only be shared between
    processes through inheritance``. So each lane gets exactly two
    long-lived queues, both created in ``LaneProcessPool.__init__`` and
    passed as ``Process`` args: a **control** queue (new-job/shutdown
    commands) and a **data** queue (cross-lane value forwards + aborts).
    Because the data queue outlives any single ``run()`` call, every message
    on it is tagged with the ``run_id`` it belongs to, and a worker discards
    anything not matching its *current* run -- the reliable way to handle a
    value or abort signal left over from a run that ended (normally or via
    abort) before that lane got around to consuming it. Every lane receives
    a (possibly empty) job on every run specifically so this discard-stale
    pass always runs, keeping the backlog from growing across many runs.
  * **Explicit ``spawn``, never the platform-default ``fork``.** This package
    is imported inside a larger, plausibly multi-threaded live server process
    (``server.py``). Forking a multi-threaded process is a well-known deadlock
    hazard (any lock held by a thread that isn't the one calling ``fork()``
    stays locked forever in the child, since only the calling thread survives
    the fork). ``spawn`` starts a genuinely fresh interpreter instead, which
    costs more at startup but is correct regardless of what else is going on
    in the launching process. If a caller ever wires ``num_streams > 1`` into
    a process whose own entry module does real work at import time outside an
    ``if __name__ == "__main__":`` guard, that work will re-run once in each
    worker's fresh interpreter (a standard ``spawn`` caveat, not something
    this module can see or fix); ``server.py`` already keeps its own heavy
    startup inside that guard, so this does not affect it.
"""
from __future__ import annotations

import os
import pickle
import queue
import time
import traceback
from dataclasses import dataclass
from multiprocessing import shared_memory as _shm_mod

import numpy as np

from ..backend.registry import get_backend
from ..hardware import _BLAS_ENV_VARS, configure_blas_threads
from ..resource_plan import compute_resource_plan
from ..memory.pool import VramOOMError
from ..observability import METRICS
from ..tensor import Tensor
from .ops import _estimate_flops, _nbytes, exec_op
from .scheduler import assign_streams

# How often the coordinator's broker loop wakes up (when no message has
# arrived) to check whether every still-pending worker process is actually
# alive. Short enough that a crashed worker is detected promptly; long
# enough to be a no-op on the hot path, since `Queue.get(timeout=...)`
# returns immediately once a real message is available -- this never adds
# latency when workers are healthy and busy.
_LIVENESS_POLL_S = 0.5


# ── Cross-process message protocol ───────────────────────────────────────────
# All picklable at module level (required for `multiprocessing` spawn/queues).

@dataclass
class _RunJob:
    """Sent once per `run()` call, on a lane's persistent control inbox:
    which of the graph's nodes this lane owns for this run (possibly none --
    every lane gets a job every run, even an empty one, purely so its data
    inbox still gets its stale-message sweep below), which of its own
    outputs the coordinator itself needs (graph outputs), which of its own
    outputs must be pushed directly onto another lane's inbox (mesh
    routing), and which of its external inputs are already known from
    `initial_env` (embedded here instead of sent as separate messages).
    `run_id` lets the lane's persistent data inbox tell this run's
    forwards/aborts apart from an earlier run's. `shm_name`/`shm_size`
    identify the pool's current shared-memory arena (see the shared-memory
    fast path below `_Shutdown`) -- `None`/`0` if the arena couldn't be
    created this run, in which case every value this run travels the plain
    pickled-message path instead."""
    run_id: int
    nodes: list
    coordinator_marshal: set
    direct_targets: dict
    initial_values: dict
    deterministic: bool = False
    seed: int = 0
    shm_name: str | None = None
    shm_size: int = 0


@dataclass
class _ValueMsg:
    """A resolved value crossing the process boundary: lane -> lane, put
    directly on the target lane's data inbox by the producing worker (mesh
    routing -- see the module docstring), or lane -> coordinator when the
    value is a graph output the coordinator must materialize to return it.
    The coordinator never re-sends a `_ValueMsg` it receives; forwarding to
    other lanes already happened at the source."""
    run_id: int
    lane_id: int
    name: str
    value: object


@dataclass
class _TelemetryMsg:
    lane_id: int
    name: str
    elapsed_ms: float
    nbytes_out: int
    nbytes_moved: int
    is_alias: bool
    flops: int


@dataclass
class _DoneMsg:
    lane_id: int


@dataclass
class _ErrorMsg:
    lane_id: int
    exc: BaseException


@dataclass
class _ReadyMsg:
    lane_id: int
    ok: bool
    error: str = ""


@dataclass
class _AbortMsg:
    """Sent on a lane's persistent *data* inbox: some run-scoped failure
    occurred (this lane's own error, a sibling lane's error, or a
    coordinator-side VramOOMError) -- stop waiting and unwind. Tagged with
    `run_id` for the same reason `_ValueMsg` is: this queue outlives any one
    run, so a stale abort left over from an earlier run must never be
    mistaken for the current one's."""
    run_id: int


class _Shutdown:
    """Sentinel on a lane's persistent *control* inbox: end the worker loop
    for good (pool shutdown). Identity-only, no payload; the control queue
    is never reused after this so no run-id ambiguity is possible."""


# ── Shared-memory tensor fast path ───────────────────────────────────────────
# `_ValueMsg.value` / `_RunJob.initial_values` entries are ordinarily a real
# `Tensor` pickled straight into the message -- for anything but tiny arrays
# this is the dominant cost of the whole multi-process path (measured at
# roughly 150-200MB/s through a `multiprocessing.Queue`'s pickle+pipe
# machinery, vs. ~10GB/s for a plain memcpy into an already-mapped shared
# segment -- see `tests/benchmark_gpu_native.py`'s history). A `_ShmRef`
# stands in for a `Tensor` payload that has instead been written directly
# into the pool's persistent shared-memory arena; the receiver copies it out
# (never a zero-copy view -- see below) and reconstructs a real `Tensor`.
#
# This is purely a fast path with a safe, always-correct fallback: placing a
# value in the arena can fail (not a `Tensor`, or the arena's scratch region
# is full for this run), in which case the caller sends the plain `Tensor`
# exactly as it always did. Nothing ever depends on the arena succeeding.
_SHM_MIN_SCRATCH = 1 << 20  # 1MiB floor so even tiny graphs get a scratch region


@dataclass
class _ShmRef:
    """A `Tensor` payload living in the pool's shared arena at `offset` for
    `nbytes` bytes, instead of embedded directly in a pickled message. The
    arena is reset (its bump-allocation counter rewound) at the start of
    every `run()` call, which is safe only because `LaneProcessPool.run` is
    fully synchronous -- it never returns to the caller (and therefore a new
    run's dispatch never begins) until every value from the current run has
    already been consumed. Nothing may hold a `_ShmRef`, or a view derived
    from one, past the `run()` call it was produced in."""
    offset: int
    nbytes: int
    shape: tuple
    dtype: str
    device: str


def _tensor_payload(value: object) -> tuple[np.ndarray, str] | None:
    """Return `(contiguous ndarray, device)` if `value` is a `Tensor` over a
    numpy buffer -- eligible for the shared-memory fast path -- else `None`,
    telling the caller to fall back to embedding `value` directly."""
    if not isinstance(value, Tensor) or not isinstance(value.data, np.ndarray):
        return None
    return np.ascontiguousarray(value.data), value.device


def _shm_alloc(counter, lock, capacity: int, nbytes: int) -> int | None:
    """Atomically bump-allocate `nbytes` from the pool's shared scratch
    arena (shared across every lane process and the coordinator). Returns
    the byte offset on success, or `None` if it would exceed `capacity` --
    callers must treat `None` as "fall back to the pickled-message path for
    this one value", never as an error."""
    if nbytes <= 0 or capacity <= 0:
        return None
    with lock:
        offset = counter.value
        if offset + nbytes > capacity:
            return None
        counter.value = offset + nbytes
    return offset


def _try_shm_put(value: object, shm_buf, counter, lock, capacity: int):
    """Try to place `value` into the pool's shared arena. Returns a
    `_ShmRef` on success, or `None` if `value` isn't shm-eligible or the
    arena has no room left this run -- either way the caller must fall back
    to sending `value` directly, exactly as this pool worked before shared
    memory existed for it."""
    if shm_buf is None:
        return None
    payload = _tensor_payload(value)
    if payload is None:
        return None
    arr, device = payload
    offset = _shm_alloc(counter, lock, capacity, arr.nbytes)
    if offset is None:
        return None
    dst = np.ndarray((arr.size,), dtype=arr.dtype, buffer=shm_buf, offset=offset)
    dst[:] = arr.reshape(-1)
    return _ShmRef(offset=offset, nbytes=arr.nbytes, shape=arr.shape, dtype=str(arr.dtype),
                    device=device)


def _shm_get(ref: "_ShmRef", shm_buf) -> Tensor:
    """Reconstruct the `Tensor` a `_ShmRef` stands in for. Always copies out
    of the shared buffer into independently-owned memory -- the arena's
    bytes at `ref.offset` are only valid until the next `run()` call resets
    the allocator, so nothing downstream may keep a zero-copy view alive."""
    count = 1
    for d in ref.shape:
        count *= d
    flat = np.ndarray((count,), dtype=np.dtype(ref.dtype), buffer=shm_buf, offset=ref.offset)
    return Tensor(flat.reshape(ref.shape).copy(), dtype=None, device=ref.device)


def _shm_resolve_value(value: object, shm_buf):
    """Resolve `value` if it's a `_ShmRef`, else return it unchanged. Used at
    every point a value crosses from "just arrived in a message" to "held in
    `local_env` / returned to the caller", so nothing downstream ever needs
    to know shared memory is involved."""
    return _shm_get(value, shm_buf) if isinstance(value, _ShmRef) else value


class _LaneAborted(Exception):
    """Internal control-flow signal raised inside a worker when its data
    inbox delivers an ``_AbortMsg`` for the current run. Caught in
    ``_run_lane_job``; never crosses the process boundary."""


def _safe_exc(exc: BaseException) -> BaseException:
    """Best-effort make `exc` safe to pickle across the process boundary.
    Built-in exceptions round-trip fine; on the rare exception that doesn't
    (e.g. it wraps something unpicklable), fall back to a plain RuntimeError
    carrying the original type/message/traceback as text, so the failure is
    still fully visible to the caller instead of the pickle error silently
    replacing it (or, worse, hanging the coordinator when the ``_ErrorMsg``
    itself fails to cross the queue)."""
    tb_text = traceback.format_exc()
    try:
        pickle.dumps(exc)
        safe = exc
    except Exception:
        safe = RuntimeError(f"{type(exc).__name__}: {exc}")
    try:
        safe.add_note(f"[worker traceback]\n{tb_text}")
    except Exception:
        pass
    return safe


# ── Worker process body ──────────────────────────────────────────────────────

def _drain_ready(local_env: dict, data_inbox, run_id: int, shm_buf) -> None:
    """Non-blocking sweep of the lane's persistent data inbox: absorb any
    current-run values that have already arrived, silently discard anything
    tagged with a different run_id (a value or abort left over from a run
    that ended, normally or via abort, before this lane consumed it), and
    raise immediately if a current-run abort is already queued. Called
    before every node (mirrors ``StreamScheduler``'s ``if errors: return``
    check, bounding wasted work after a sibling fails) and once up front
    even when this lane owns zero nodes this run, so every run reliably
    sweeps out that run's leftovers instead of letting them accumulate."""
    while True:
        try:
            msg = data_inbox.get_nowait()
        except queue.Empty:
            return
        if isinstance(msg, _AbortMsg):
            if msg.run_id == run_id:
                raise _LaneAborted()
            continue  # stale abort from an earlier run -- discard
        if msg.run_id != run_id:
            continue  # stale value from an earlier run -- discard
        local_env[msg.name] = _shm_resolve_value(msg.value, shm_buf)


def _resolve(name: str, local_env: dict, data_inbox, run_id: int, shm_buf) -> object:
    while name not in local_env:
        msg = data_inbox.get()
        if isinstance(msg, _AbortMsg):
            if msg.run_id == run_id:
                raise _LaneAborted()
            continue  # stale abort from an earlier run -- discard
        if msg.run_id != run_id:
            continue  # stale value from an earlier run -- discard
        local_env[msg.name] = _shm_resolve_value(msg.value, shm_buf)
    return local_env[name]


def _run_lane_job(lane_id: int, job: _RunJob, backend, data_inbox, outbox, all_data_inboxes,
                   shm_buf, shm_counter, shm_lock) -> None:
    # External inputs known up front -- no round trip. Anything the
    # coordinator placed in the shared arena arrives here as a `_ShmRef` and
    # is copied out into a real `Tensor` immediately, so every line below
    # this can treat `local_env` exactly as it could before shared memory
    # existed for this pool.
    local_env: dict = {name: _shm_resolve_value(v, shm_buf) for name, v in job.initial_values.items()}
    try:
        if job.deterministic:
            np.random.seed(job.seed)
        _drain_ready(local_env, data_inbox, job.run_id, shm_buf)  # sweep even if `nodes` is empty
        for node in job.nodes:
            _drain_ready(local_env, data_inbox, job.run_id, shm_buf)
            resolved = [_resolve(name, local_env, data_inbox, job.run_id, shm_buf)
                        for name in node.inputs]
            t0 = time.perf_counter()
            value = exec_op(backend, node, resolved)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            is_alias = any(value is r for r in resolved)
            nbytes_out = 0 if is_alias else _nbytes(value)
            nbytes_moved = sum(_nbytes(r) for r in resolved) + _nbytes(value)
            flops = _estimate_flops(node, resolved, value)
            local_env[node.output] = value
            outbox.put(_TelemetryMsg(lane_id, node.output, elapsed_ms, nbytes_out,
                                      nbytes_moved, is_alias, flops))
            needs_send = node.output in job.direct_targets or node.output in job.coordinator_marshal
            payload = value
            # Aliased values (the op just handed back one of its own inputs)
            # are already cheap to pickle -- and may well already be a value
            # this lane received *as* a `_ShmRef` and copied out, so writing
            # it back into the arena under a fresh offset would just waste
            # scratch space. Only genuinely new outputs try the fast path.
            if needs_send and not is_alias:
                ref = _try_shm_put(value, shm_buf, shm_counter, shm_lock, job.shm_size)
                if ref is not None:
                    payload = ref
            # Mesh routing: push straight onto every other lane that needs this
            # value -- one hop, no coordinator relay.
            for target_lid in job.direct_targets.get(node.output, ()):
                all_data_inboxes[target_lid].put(_ValueMsg(job.run_id, lane_id, node.output, payload))
            # The coordinator only needs a copy when it's a graph output it
            # must materialize to return.
            if node.output in job.coordinator_marshal:
                outbox.put(_ValueMsg(job.run_id, lane_id, node.output, payload))
        outbox.put(_DoneMsg(lane_id))
    except _LaneAborted:
        outbox.put(_DoneMsg(lane_id))  # coordinator already recorded the root cause
    except BaseException as exc:  # noqa: BLE001 - must report, never hang the coordinator
        outbox.put(_ErrorMsg(lane_id, _safe_exc(exc)))


def _lane_worker_main(lane_id, backend_name, backend_kwargs, ctrl_inbox, data_inbox, outbox,
                       all_data_inboxes, shm_counter, shm_lock) -> None:
    """Entry point for one persistent lane worker process. Constructs its
    backend exactly once, reports readiness, then services ``_RunJob``s off
    its control inbox until told to shut down."""
    try:
        backend = get_backend(backend_name, **(backend_kwargs or {}))
    except Exception as exc:  # noqa: BLE001 - must report, never hang pool startup
        outbox.put(_ReadyMsg(lane_id, ok=False, error=f"{type(exc).__name__}: {exc}"))
        return
    outbox.put(_ReadyMsg(lane_id, ok=True))

    # The pool's shared-memory arena can grow across runs (a new, bigger
    # segment replacing the old one -- see `LaneProcessPool.run`), so this
    # loop re-attaches whenever a job names a different segment than the one
    # it already has open. `attached_shm` is this worker's own handle; it is
    # only ever `close()`d here (detach), never `unlink()`d -- the arena is
    # owned and destroyed by the coordinator that created it.
    attached_shm = None
    attached_name = None
    try:
        while True:
            msg = ctrl_inbox.get()
            if isinstance(msg, _Shutdown):
                return
            if isinstance(msg, _RunJob):
                if msg.shm_name != attached_name:
                    if attached_shm is not None:
                        attached_shm.close()
                    attached_shm = None
                    attached_name = None
                    if msg.shm_name is not None:
                        try:
                            attached_shm = _shm_mod.SharedMemory(name=msg.shm_name)
                            attached_name = msg.shm_name
                        except Exception:
                            # Arena vanished or was never reachable -- fall back
                            # to the plain pickled-message path for this run
                            # rather than crashing the lane over an optimization.
                            attached_shm = None
                            attached_name = None
                shm_buf = attached_shm.buf if attached_shm is not None else None
                _run_lane_job(lane_id, msg, backend, data_inbox, outbox, all_data_inboxes,
                              shm_buf, shm_counter, shm_lock)
    finally:
        if attached_shm is not None:
            attached_shm.close()


# ── Per-run lane partitioning helpers (coordinator side) ─────────────────────

def _compute_external_needs(lanes: dict) -> dict:
    """For each lane, the set of names it references but does not produce
    itself -- exactly the values that must be delivered to it from
    ``initial_env`` or forwarded from another lane's output."""
    needs: dict = {}
    for lid, nodes in lanes.items():
        produced_locally: set = set()
        external: set = set()
        for node in nodes:
            for i in node.inputs:
                if i not in produced_locally:
                    external.add(i)
            produced_locally.add(node.output)
        needs[lid] = external
    return needs


# ── Coordinator ───────────────────────────────────────────────────────────────

class LaneProcessPool:
    """A persistent pool of one OS process per stream lane, started once and
    reused across every subsequent ``run()`` call on the owning ``Runtime``.

    Construction spawns ``num_streams`` worker processes and blocks until
    each has constructed its own copy of ``backend_name`` (via the same
    registry every in-process caller uses) and reported ready -- so the
    interpreter-start/import/backend-construction cost is paid exactly once,
    up front, not on the first (or every) ``run()`` call.
    """

    def __init__(self, num_streams: int, backend_name: str, backend_kwargs: dict | None = None,
                 mp_context: str = "spawn", start_timeout: float = 60.0):
        import multiprocessing

        self.num_streams = max(1, int(num_streams))
        self.backend_name = backend_name
        self.backend_kwargs = dict(backend_kwargs or {})
        self._ctx = multiprocessing.get_context(mp_context)
        self._run_counter = 0
        # Every queue is created here, before any process starts, and never
        # recreated -- see the module docstring for why that's required.
        self._outbox = self._ctx.Queue()
        self._ctrl_inboxes = {lid: self._ctx.Queue() for lid in range(self.num_streams)}
        self._data_inboxes = {lid: self._ctx.Queue() for lid in range(self.num_streams)}
        self._procs: dict[int, object] = {}
        self._closed = False
        # Shared-memory tensor fast path (see the `_ShmRef` docs above). The
        # counter/lock are synchronization primitives, not `Queue`s, so --
        # unlike the per-lane queues -- they *could* cross into an already-
        # running worker later via a message; they're still created once
        # here and passed at spawn purely for symmetry with the rest of this
        # constructor. The actual `SharedMemory` segment is created lazily
        # (and grown as needed) in `run()`, since its size depends on what a
        # real run actually needs to move.
        self._shm_counter = self._ctx.Value("q", 0)
        self._shm_lock = self._ctx.Lock()
        self._shm_obj = None
        self._shm_name: str | None = None
        self._shm_size = 0
        self._shm_high_water = 0
        # N worker processes each defaulting to an all-core BLAS thread pool
        # oversubscribes the CPU (N x cpus threads on cpus cores) and is a
        # measured net *loss* -- worse than the single-process serial path it
        # is supposed to beat (see benchmark_gpu_native.py's stream_overlap_*
        # "honest takeaway"). Cap each worker to cpus // num_streams before it
        # starts, via the same central plan process_pool's own coordinator
        # process used (`resource_plan.compute_resource_plan`) so the reserve
        # policy stays identical everywhere. This MUST pass override=True: the
        # coordinator process's own BLAS vars are already set (by server.py's
        # bootstrap, sized for its own *single-stream* default use), and a
        # plain "set if absent" call would leave that larger, wrong-for-N-way
        # value in place -- guaranteeing oversubscription once workers inherit
        # it. Restore the coordinator's own env immediately after spawning so
        # this pool's sizing can never leak into a later pool's own
        # ``configure_blas_threads`` call or into an unrelated child the
        # coordinator process spawns afterwards.
        _prior_blas_env = {var: os.environ.get(var) for var in _BLAS_ENV_VARS}
        try:
            _blas_plan = compute_resource_plan(num_streams=self.num_streams)
            configure_blas_threads(
                num_workers=self.num_streams, reserve=_blas_plan.reserve_cpus, override=True
            )
            for lid in range(self.num_streams):
                proc = self._ctx.Process(
                    target=_lane_worker_main,
                    args=(lid, self.backend_name, self.backend_kwargs,
                          self._ctrl_inboxes[lid], self._data_inboxes[lid], self._outbox,
                          self._data_inboxes,  # full dict: lets a lane mesh-route to any other
                          self._shm_counter, self._shm_lock),
                    name=f"maxcore-lane-{lid}",
                    daemon=True,
                )
                proc.start()
                self._procs[lid] = proc
        finally:
            for var, val in _prior_blas_env.items():
                if val is None:
                    os.environ.pop(var, None)
                else:
                    os.environ[var] = val
        try:
            self._await_ready(start_timeout)
        except Exception:
            self.shutdown()
            raise

    def _await_ready(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        pending = set(self._procs.keys())
        failures: dict[int, str] = {}
        while pending:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError(
                    f"LaneProcessPool: worker(s) {sorted(pending)} for backend "
                    f"'{self.backend_name}' did not become ready within {timeout}s"
                )
            try:
                msg = self._outbox.get(timeout=min(_LIVENESS_POLL_S, remaining))
            except queue.Empty:
                dead = [lid for lid in pending if not self._procs[lid].is_alive()]
                if dead:
                    codes = {lid: self._procs[lid].exitcode for lid in dead}
                    raise RuntimeError(
                        f"LaneProcessPool: worker process for lane(s) {sorted(dead)} "
                        f"died before completing backend init (exit codes: {codes})"
                    )
                continue
            if isinstance(msg, _ReadyMsg):
                pending.discard(msg.lane_id)
                if not msg.ok:
                    failures[msg.lane_id] = msg.error
        if failures:
            raise RuntimeError(
                f"LaneProcessPool: worker backend init failed for lane(s) "
                f"{sorted(failures)}: {failures}"
            )

    def _ensure_shm_capacity(self, per_lane_initial: dict) -> None:
        """Size (creating or growing as needed) the pool's shared-memory
        arena for the run about to be dispatched, and reset its
        bump-allocation counter to 0. Sizing combines what's exactly
        knowable up front (the total bytes of this run's `initial_env`
        values) with a scratch allowance for values lanes will produce and
        forward mid-run (mesh routing / graph outputs), whose sizes aren't
        known until they're actually computed. The scratch allowance grows
        adaptively from `_shm_high_water` -- the most any past run has
        actually used -- so a workload whose real output volume exceeds the
        initial 2x-of-inputs guess gets a bigger arena on its *next* run
        rather than repeatedly falling back to pickled messages for the
        overflow.

        Never raises: if creating shared memory fails for any reason
        (platform without shm support, permissions, ...), the arena is left
        as `None` (or whatever smaller one already existed) and every value
        this run takes the always-correct pickled-message path instead --
        this method is a pure performance optimization and must never be
        able to break a run."""
        reserved_bytes = 0
        for lane_values in per_lane_initial.values():
            for value in lane_values.values():
                payload = _tensor_payload(value)
                if payload is not None:
                    reserved_bytes += payload[0].nbytes

        scratch_bytes = max(_SHM_MIN_SCRATCH, 2 * reserved_bytes, self._shm_high_water)
        needed = reserved_bytes + scratch_bytes

        if self._shm_obj is None or needed > self._shm_size:
            old_obj = self._shm_obj
            try:
                new_obj = _shm_mod.SharedMemory(create=True, size=needed)
            except Exception:
                new_obj = None
            if new_obj is not None:
                self._shm_obj = new_obj
                self._shm_name = new_obj.name
                self._shm_size = needed
                if old_obj is not None:
                    try:
                        old_obj.close()
                        old_obj.unlink()
                    except Exception:
                        pass

        if self._shm_obj is not None:
            with self._shm_lock:
                self._shm_counter.value = 0

    def run(self, order: list, initial_env: dict, outputs_set: set, consumer_count: dict,
            pool, deterministic: bool = False, seed: int = 0) -> dict:
        """Execute `order` (topologically sorted) against `initial_env`,
        partitioned across this pool's persistent worker processes.
        Same contract as ``StreamScheduler.run``, plus coordinator-side
        ``pool`` (``VramPool``) bookkeeping driven by worker telemetry: an
        intermediate is allocated when its producing node's telemetry
        arrives and freed the instant every one of its consumers has been
        reported, mirroring ``Runtime``'s in-process bookkeeping exactly."""
        if self._closed:
            raise RuntimeError("LaneProcessPool: pool is already shut down")

        run_id = self._run_counter
        self._run_counter += 1

        stream_of = assign_streams(order, self.num_streams)
        lanes: dict[int, list] = {}
        for node in order:
            lanes.setdefault(stream_of[node.output], []).append(node)

        by_output = {node.output: node for node in order}
        external_needs = _compute_external_needs(lanes)

        # Mesh routing table: for each name produced by *this* graph run that
        # some other lane needs (i.e. not satisfiable from `initial_env`),
        # which lane ids need it directly from the producer.
        name_to_targets: dict[str, list[int]] = {}
        for lid, needed in external_needs.items():
            for name in needed:
                if name not in initial_env:
                    name_to_targets.setdefault(name, []).append(lid)

        per_lane_initial: dict[int, dict] = {
            lid: {name: initial_env[name] for name in external_needs.get(lid, ()) if name in initial_env}
            for lid in range(self.num_streams)
        }
        self._ensure_shm_capacity(per_lane_initial)
        shm_buf = self._shm_obj.buf if self._shm_obj is not None else None

        # Every lane gets a job every run -- even an empty one -- purely so
        # its persistent data inbox always gets its stale-message sweep
        # (see `_drain_ready`'s pre-loop call and the module docstring).
        for lid in range(self.num_streams):
            nodes = lanes.get(lid, [])
            initial_values = {
                name: (_try_shm_put(v, shm_buf, self._shm_counter, self._shm_lock, self._shm_size) or v)
                for name, v in per_lane_initial[lid].items()
            }
            job = _RunJob(
                run_id=run_id,
                nodes=nodes,
                coordinator_marshal={n.output for n in nodes} & outputs_set,
                direct_targets={n.output: name_to_targets[n.output]
                                for n in nodes if n.output in name_to_targets},
                initial_values=initial_values,
                deterministic=deterministic,
                seed=seed,
                shm_name=self._shm_name,
                shm_size=self._shm_size,
            )
            self._ctrl_inboxes[lid].put(job)

        results: dict = dict(initial_env)
        remaining = dict(consumer_count)
        handles: dict[str, int] = {}
        pending_lanes = set(range(self.num_streams))
        error: BaseException | None = None

        def abort_all(exc: BaseException) -> None:
            nonlocal error
            if error is not None:
                return
            error = exc
            for lid in pending_lanes:
                self._data_inboxes[lid].put(_AbortMsg(run_id))

        while pending_lanes:
            try:
                msg = self._outbox.get(timeout=_LIVENESS_POLL_S)
            except queue.Empty:
                dead = [lid for lid in pending_lanes if not self._procs[lid].is_alive()]
                if dead:
                    codes = {lid: self._procs[lid].exitcode for lid in dead}
                    abort_all(RuntimeError(
                        f"LaneProcessPool: worker process for lane(s) {sorted(dead)} "
                        f"died unexpectedly (exit codes: {codes}) before completing "
                        f"its assigned nodes for this run"
                    ))
                    for lid in dead:
                        pending_lanes.discard(lid)
                continue

            if isinstance(msg, _TelemetryMsg):
                if error is not None:
                    continue  # aborting -- skip further pool/metrics bookkeeping
                node = by_output[msg.name]
                op_name = node.op_type.value
                METRICS.incr(f"runtime.stream.{msg.lane_id}.ops")
                METRICS.observe(f"runtime.op.{op_name}", msg.elapsed_ms)
                METRICS.incr("runtime.bytes_moved", msg.nbytes_moved)
                METRICS.incr(f"runtime.bytes_moved.{op_name}", msg.nbytes_moved)
                if msg.flops:
                    METRICS.incr(f"runtime.flops.{op_name}", msg.flops)
                    METRICS.incr("runtime.flops", msg.flops)
                if (msg.name not in outputs_set and consumer_count.get(msg.name, 0) > 0
                        and not msg.is_alias):
                    try:
                        handles[msg.name] = pool.alloc(msg.nbytes_out, tag=op_name)
                    except VramOOMError as exc:
                        abort_all(exc)
                        continue
                for iname in node.inputs:
                    if iname in outputs_set:
                        continue
                    if iname not in remaining:
                        continue
                    remaining[iname] -= 1
                    if remaining[iname] <= 0:
                        h = handles.pop(iname, None)
                        if h is not None:
                            pool.free(h)
            elif isinstance(msg, _ValueMsg):
                # Only graph outputs ever reach the coordinator as a
                # `_ValueMsg` (mesh routing already delivered lane-to-lane
                # forwards directly -- see the module docstring); resolve it
                # (a `_ShmRef` copies out of the arena; anything else is
                # already a real value) and materialize it into the result
                # the caller gets back.
                results[msg.name] = _shm_resolve_value(msg.value, shm_buf)
            elif isinstance(msg, _ErrorMsg):
                abort_all(msg.exc)
                pending_lanes.discard(msg.lane_id)
            elif isinstance(msg, _DoneMsg):
                pending_lanes.discard(msg.lane_id)
            else:
                raise RuntimeError(f"LaneProcessPool: unexpected message {msg!r}")

        if self._shm_obj is not None:
            # Feed this run's actual scratch usage back into future sizing
            # (see `_ensure_shm_capacity`) -- read without the lock since
            # every worker for this run has already reported `_DoneMsg` or
            # `_ErrorMsg` by this point, so nothing is still writing.
            self._shm_high_water = max(self._shm_high_water, self._shm_counter.value)

        if error is not None:
            raise error
        return results

    def shutdown(self, timeout: float = 5.0) -> None:
        if self._closed:
            return
        self._closed = True
        for inbox in self._ctrl_inboxes.values():
            try:
                inbox.put(_Shutdown())
            except Exception:
                pass
        for proc in self._procs.values():
            try:
                proc.join(timeout=timeout)
                if proc.is_alive():
                    proc.terminate()
                    proc.join(timeout=1.0)
            except Exception:
                pass
        for q in [*self._ctrl_inboxes.values(), *self._data_inboxes.values(), self._outbox]:
            try:
                q.close()
            except Exception:
                pass
        if self._shm_obj is not None:
            # This pool created the arena, so it (not any worker, which only
            # ever `close()`s its attachment) is the one responsible for
            # `unlink()`ing it -- otherwise the OS-level segment leaks past
            # process exit.
            try:
                self._shm_obj.close()
                self._shm_obj.unlink()
            except Exception:
                pass
            self._shm_obj = None

    def __del__(self):
        try:
            self.shutdown(timeout=1.0)
        except Exception:
            pass
