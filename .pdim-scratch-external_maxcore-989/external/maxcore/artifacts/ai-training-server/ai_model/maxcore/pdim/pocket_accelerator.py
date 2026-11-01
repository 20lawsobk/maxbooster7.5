"""Pocket Accelerator — in-process GEMM dedup cache for the Digital GPU.

Every GEMM (gemm / gemm_batched / mixed_gemm / …) is offered to this cache
before it reaches the TensorCoreUnit.  Identical operand arrays — identified by
a sha256 content hash — return the stored result in microseconds instead of
recomputing.

Architecture
────────────
The accelerator is a 256-shard LRU keyed by operand content-hash.  Each shard
owns its own ``threading.Lock`` and its own ``OrderedDict``.  Because the cache
key is already a sha256 hex digest, the last two hex characters provide a
perfectly uniform 0-255 shard index: concurrent GEMMs for *different* keys
land in *different* shards and never contend.

At 90 000 concurrent unique requests, each making N GEMM calls, the lock wait
is proportional to (90 000 × N) / 256 — roughly 350 waiters per shard instead
of 90 000 × N waiters on a single lock.

Results are stored as lossless copies in the caller's original dtype — a hit
is byte-identical to what a fresh compute() call would have returned. This
cache used to quantize floating results to FP16 to stretch capacity, but that
silently broke the byte-identical contract (a stored value could differ from
a fresh compute by more than this codebase's own correctness tolerance).
Capacity pressure must be handled via the per-shard byte budget / LRU
eviction below, never by lowering stored precision.

Adaptive gate
─────────────
Two tiers decide whether a GEMM is worth offering to the cache:

1. **Static prior** — brand-new shapes have no evidence yet, so
   ``min_flops`` bypasses obviously-tiny GEMMs before any hashing happens
   (hash cost almost certainly exceeds compute cost for these).
2. **Measured posterior** — once a pocket (a `kind`+shape bucket) has
   accumulated ``warmup`` real cache-miss samples, admission switches to
   *evidence*: every ``accelerate()`` call times its own hashing, LRU
   lookup, result copy, and store cost, and feeds those seconds into
   per-pocket EWMAs — kept as separate series for what is paid on *every*
   call (hash + lookup) versus what is paid only on a hit (copy) or only
   on a miss (compute, store). From that, the required hit rate to keep
   this pocket admitted is derived from first principles rather than
   assumed:

       breakeven_hit_rate = (overhead + store) / (compute + store - copy)

   (caching only lowers expected per-call cost when the hit rate clears
   this ratio — see the derivation in ``_ShardedBuckets.settle``). The
   pocket's effective floor is ``max(hit_rate_floor, breakeven_hit_rate)``,
   so a shape whose hash/lookup overhead is comparable to its own compute
   cost is held to a stricter bar than the flat 5% default, while cheap
   overhead relative to expensive compute keeps today's low floor. The
   gate re-probes every ``reprobe_every`` calls so a muted pocket can
   recover if the workload becomes repetitive again.

Sharding contract
─────────────────
``_ShardedLRU`` shards both ``_store`` (the LRU dict) and per-shard byte
accounting.  ``_ShardedBuckets`` shards the per-pocket adaptive-gate state.
Stats (hits/misses/bypass counts) are separated into a dedicated lightweight
``_stats_lock`` that is acquired far less often than the data-path locks.
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import numpy as np

from ..observability import METRICS

# ── feature flag ──────────────────────────────────────────────────────────────

_ENV_ENABLED  = "POCKET_ACCEL_ENABLED"
_ENV_BUDGET_MB = "POCKET_ACCEL_BUDGET_MB"


def _enabled() -> bool:
    return os.environ.get(_ENV_ENABLED, "1") not in ("0", "false", "False")


# ── shard count ───────────────────────────────────────────────────────────────

_NUM_SHARDS = 256   # must be a power-of-two for `& 0xFF` trick; 256 = 2^8

# Exponential-moving-average smoothing for the per-pocket cost estimates used
# by the evidence-based admission check below. 0.2 tracks a shape's real
# behavior on this host within a handful of samples without being so
# reactive that one slow/fast outlier call swings the estimate.
_EWMA_ALPHA = 0.2


# ── adaptive gate bucket ──────────────────────────────────────────────────────

@dataclass
class _PocketBucket:
    attempts: int = 0
    hits:     int = 0
    muted:    bool = False
    skipped:  int = field(default=0, repr=False)
    # Evidence-based cost tracking (seconds, EWMA) — populated by `settle()`
    # on every call so admission can compare THIS shape's measured costs
    # against what a hit actually saves, instead of assuming a fixed
    # hit-rate floor fits every shape on every host. Each series only
    # updates on the call type that actually pays it: `overhead_ewma`
    # (hash + lookup) is paid either way so it updates on every call;
    # `copy_ewma` is paid only on a hit; `compute_ewma`/`store_ewma` are
    # paid only on a miss. Keeping them separate (rather than blending
    # copy into "overhead") lets the breakeven formula weigh each cost
    # against exactly what it replaces.
    overhead_ewma:    float = field(default=0.0, repr=False)
    overhead_samples: int   = field(default=0, repr=False)
    copy_ewma:        float = field(default=0.0, repr=False)
    copy_samples:     int   = field(default=0, repr=False)
    compute_ewma:     float = field(default=0.0, repr=False)
    store_ewma:       float = field(default=0.0, repr=False)
    compute_samples:  int   = field(default=0, repr=False)


# ── 256-shard LRU store ───────────────────────────────────────────────────────

class _ShardedLRU:
    """256-bucket sharded LRU.

    GEMMs for different cache keys land in different shards and never block
    each other.  The shard index is the integer value of the last two hex
    characters of the key — already uniformly distributed because keys are
    sha256 hex digests.
    """

    def __init__(self, budget_bytes: int) -> None:
        # Each shard gets an equal share of the byte budget.
        self._shard_budget = max(budget_bytes // _NUM_SHARDS, 512 * 1024)
        self._stores: list[OrderedDict] = [OrderedDict() for _ in range(_NUM_SHARDS)]
        self._locks   = [threading.Lock() for _ in range(_NUM_SHARDS)]
        self._bytes   = [0] * _NUM_SHARDS
        # Eviction counter needs its own lock (written rarely; not on hot path).
        self._evictions   = 0
        self._evict_lock  = threading.Lock()

    @staticmethod
    def _idx(key: str) -> int:
        """Map any key to a shard index in O(1)."""
        # Originally parsed last 2 chars as hex, but extra_key suffixes
        # (e.g. ":int=false") make the tail non-hex → ValueError.
        # Use Python's built-in hash masked to 0-255; collisions are fine
        # since the shard still does an exact-key lookup.
        return hash(key) & 0xFF

    def get(self, key: str) -> "Optional[tuple[np.ndarray, float]]":
        idx = self._idx(key)
        with self._locks[idx]:
            entry = self._stores[idx].get(key)
            if entry is not None:
                self._stores[idx].move_to_end(key)   # LRU promote
            return entry

    def put(self, key: str, value: np.ndarray, compute_seconds: float) -> None:
        # Lossless copy in the caller's own dtype: a hit must be byte-identical
        # to what a fresh compute() call would have returned. Never quantize —
        # that silently breaks correctness for every caller of this cache. If
        # capacity pressure matters, tune the per-shard byte budget / eviction
        # below instead of stored precision.
        arr = np.ascontiguousarray(value).copy()
        size = arr.nbytes
        if size > self._shard_budget:
            return   # single result too large for any shard
        idx    = self._idx(key)
        evicted = 0
        with self._locks[idx]:
            if key in self._stores[idx]:
                return   # already present — skip double-write
            while self._bytes[idx] + size > self._shard_budget and self._stores[idx]:
                _, (old, _) = self._stores[idx].popitem(last=False)
                self._bytes[idx] -= old.nbytes
                evicted += 1
            self._stores[idx][key] = (arr, compute_seconds)
            self._bytes[idx] += size
        if evicted:
            with self._evict_lock:
                self._evictions += evicted

    # ── aggregate stats (for observability only — not on hot path) ────────────

    @property
    def total_bytes(self) -> int:
        return sum(self._bytes)

    @property
    def total_entries(self) -> int:
        return sum(len(s) for s in self._stores)

    @property
    def total_evictions(self) -> int:
        with self._evict_lock:
            return self._evictions

    def clear(self) -> None:
        for i in range(_NUM_SHARDS):
            with self._locks[i]:
                self._stores[i].clear()
                self._bytes[i] = 0
        with self._evict_lock:
            self._evictions = 0


# ── 256-shard adaptive gate buckets ──────────────────────────────────────────

class _ShardedBuckets:
    """256-bucket sharded pocket-gate registry.

    Different pocket names land in different shards; concurrent gate/settle
    calls for different pockets never block each other.
    """

    def __init__(self) -> None:
        self._shards: list[dict[str, _PocketBucket]] = [{} for _ in range(_NUM_SHARDS)]
        self._locks  = [threading.Lock() for _ in range(_NUM_SHARDS)]

    @staticmethod
    def _idx(pocket: str) -> int:
        return hash(pocket) & 0xFF   # uniform 0-255 from string hash

    def gate(self, pocket: str, flops: float, min_flops: float,
             reprobe_every: int) -> bool:
        """Return True if this GEMM should be offered to the cache."""
        if flops < min_flops:
            return False
        idx = self._idx(pocket)
        with self._locks[idx]:
            b = self._shards[idx].get(pocket)
            if b is None:
                b = self._shards[idx][pocket] = _PocketBucket()
            if b.muted:
                b.skipped += 1
                if b.skipped % reprobe_every:   # not a re-probe turn
                    return False
                b.muted = False                 # re-probe this call
            return True

    def settle(self, pocket: str, hit: bool, warmup: int,
               hit_rate_floor: float, overhead_seconds: float = 0.0,
               compute_seconds: "Optional[float]" = None,
               store_seconds: float = 0.0, copy_seconds: float = 0.0) -> None:
        idx = self._idx(pocket)
        with self._locks[idx]:
            b = self._shards[idx].get(pocket)
            if b is None:
                return
            b.attempts += 1

            # Evidence-based cost tracking: overhead (hash + lookup) is paid
            # on every call, hit or miss, so it always updates. copy is
            # measured only on a hit; compute/store only on a miss — a
            # hit's whole point is that compute() was never called, and a
            # miss never copies a stored result. Keeping these as separate
            # series (rather than folding copy into "overhead") means the
            # breakeven formula below weighs each cost against exactly what
            # it replaces instead of a hit-rate-contaminated blend.
            if b.overhead_samples == 0:
                b.overhead_ewma = overhead_seconds
            else:
                b.overhead_ewma += _EWMA_ALPHA * (overhead_seconds - b.overhead_ewma)
            b.overhead_samples += 1

            if hit:
                if b.copy_samples == 0:
                    b.copy_ewma = copy_seconds
                else:
                    b.copy_ewma += _EWMA_ALPHA * (copy_seconds - b.copy_ewma)
                b.copy_samples += 1
                b.hits   += 1
                b.muted   = False
                b.skipped = 0
                return

            if compute_seconds is not None:
                if b.compute_samples == 0:
                    b.compute_ewma = compute_seconds
                    b.store_ewma   = store_seconds
                else:
                    b.compute_ewma += _EWMA_ALPHA * (compute_seconds - b.compute_ewma)
                    b.store_ewma   += _EWMA_ALPHA * (store_seconds - b.store_ewma)
                b.compute_samples += 1

            # Required hit rate to break even, derived from measured cost.
            # Expected cost per call WITH caching is
            #   overhead + hit_rate * copy + (1 - hit_rate) * (compute + store)
            # (overhead is paid always; copy only on the hit fraction;
            # compute+store only on the miss fraction). WITHOUT caching
            # every call simply costs `compute`. Caching only wins once
            #   hit_rate > (overhead + store) / (compute + store - copy).
            # Below `warmup` compute samples there isn't enough evidence to
            # trust that ratio yet, so fall back to the static floor; above
            # it, never go BELOW the static floor either — only ever raise
            # the bar for shapes whose overhead isn't cheap relative to what
            # they'd save. A non-positive denominator (copy cost at or
            # above compute+store — never expected for a real GEMM, where
            # copying a result is far cheaper than computing it) skips the
            # posterior adjustment for this call rather than divide by a
            # non-positive number.
            required_floor = hit_rate_floor
            denom = b.compute_ewma + b.store_ewma - b.copy_ewma
            if b.compute_samples >= warmup and denom > 0:
                breakeven = (b.overhead_ewma + b.store_ewma) / denom
                required_floor = max(hit_rate_floor, min(breakeven, 0.99))

            if b.attempts >= warmup and b.hits / b.attempts < required_floor:
                b.muted = True

    def snapshot(self) -> tuple[int, int]:
        """(total_pockets, muted_pockets) — called only for /gpu/status."""
        total = muted = 0
        for i in range(_NUM_SHARDS):
            with self._locks[i]:
                for b in self._shards[i].values():
                    total += 1
                    if b.muted:
                        muted += 1
        return total, muted

    def clear(self) -> None:
        for i in range(_NUM_SHARDS):
            with self._locks[i]:
                self._shards[i].clear()


# ── Pocket Accelerator ────────────────────────────────────────────────────────

class PocketAccelerator:
    """Content-hash GEMM dedup cache with 256-shard concurrency.

    ``accelerate(kind, operands, flops, compute)`` serves the result from the
    sharded LRU when the operand content-hash matches a stored entry; otherwise
    it calls ``compute()``, stores the result, and returns it.

    All data-path operations (get/put/gate/settle) acquire only the shard lock
    for their specific key — they never block unrelated keys.  Stats counters
    are updated under a separate lightweight ``_stats_lock`` that is never held
    during computation.
    """

    def __init__(
        self,
        budget_bytes:    Optional[int] = None,
        min_flops:       float = 2e6,
        warmup:          int   = 8,
        hit_rate_floor:  float = 0.05,
        reprobe_every:   int   = 16,
    ) -> None:
        if budget_bytes is None:
            _budget_mb_override = os.environ.get(_ENV_BUDGET_MB)
            if _budget_mb_override is not None:
                budget_bytes = int(float(_budget_mb_override) * 1e6)
            else:
                # No operator override: default to a memory-scaled budget
                # (small fixed fraction of usable host memory, floor/ceiling
                # bounded) instead of a flat number tuned for one host size —
                # see resource_plan.py for the exact policy.
                from ..resource_plan import cache_budget_bytes, planned_memory_bytes
                budget_bytes = cache_budget_bytes(planned_memory_bytes())
        self.budget_bytes   = max(budget_bytes, 1_000_000)
        self.min_flops      = min_flops
        self.warmup         = warmup
        self.hit_rate_floor = hit_rate_floor
        self.reprobe_every  = max(reprobe_every, 2)

        # Sharded data structures — no global lock on the hot path.
        self._lru     = _ShardedLRU(self.budget_bytes)
        self._buckets = _ShardedBuckets()

        # Stats: a dedicated lightweight lock, never held during compute.
        self._stats_lock            = threading.Lock()
        self._hits                  = 0
        self._misses                = 0
        self._bypass_small          = 0
        self._bypass_muted          = 0
        self._compute_seconds_saved = 0.0
        self._hit_serving_seconds   = 0.0
        # Evidence-based admission (task step 3): measured, aggregate cost of
        # every phase of the cache path, exposed via stats() so an operator
        # can see exactly what hashing/lookup/copy/storage cost this process
        # — not just infer it from hit rate.
        self._hash_seconds_total    = 0.0
        self._lookup_seconds_total  = 0.0
        self._copy_seconds_total    = 0.0
        self._store_seconds_total   = 0.0

    # ── content-hash ──────────────────────────────────────────────────────────

    @staticmethod
    def _digest(*arrays: Optional[np.ndarray]) -> str:
        h = hashlib.sha256()
        for a in arrays:
            if a is None:
                h.update(b"<none>")
                continue
            c = np.ascontiguousarray(a)
            h.update(str(c.dtype).encode())
            h.update(str(c.shape).encode())
            h.update(c.tobytes())
        return h.hexdigest()

    # ── adaptive gate (uses sharded buckets) ──────────────────────────────────

    def _gate(self, pocket: str, flops: float) -> bool:
        if flops < self.min_flops:
            with self._stats_lock:
                self._bypass_small += 1
            return False
        allowed = self._buckets.gate(
            pocket, flops, self.min_flops, self.reprobe_every
        )
        if not allowed:
            with self._stats_lock:
                self._bypass_muted += 1
        return allowed

    def _settle(self, pocket: str, hit: bool, overhead_seconds: float = 0.0,
                compute_seconds: Optional[float] = None,
                store_seconds: float = 0.0, copy_seconds: float = 0.0) -> None:
        self._buckets.settle(
            pocket, hit, self.warmup, self.hit_rate_floor,
            overhead_seconds=overhead_seconds,
            compute_seconds=compute_seconds,
            store_seconds=store_seconds,
            copy_seconds=copy_seconds,
        )

    # ── wired entry point ─────────────────────────────────────────────────────

    def accelerate(
        self,
        kind:      str,
        operands:  tuple,
        flops:     float,
        compute:   Callable[[], np.ndarray],
        extra_key: str = "",
    ) -> tuple[np.ndarray, str]:
        """Serve ``compute()`` through the 256-shard pocket cache.

        Returns ``(result, source)`` where source is one of:
        - ``"pocket"``  — served from cache (no compute)
        - ``"compute"`` — computed and cached
        - ``"bypass"``  — gate rejected; compute called directly, not cached
        """
        if not _enabled():
            return compute(), "bypass"

        first     = operands[0]
        shape_sig = "x".join(str(d) for d in first.shape) + "@" + \
                    "x".join(str(d) for d in operands[1].shape)
        pocket = f"gpu/{kind}/{shape_sig}"

        if not self._gate(pocket, flops):
            return compute(), "bypass"

        # Every phase below is timed individually (not just bundled into one
        # "hit_serving_seconds" blob) so hashing, lookup, copy, and storage
        # costs are each measured and can each be exposed via stats() —
        # that measurement is what lets `_settle` admit or mute a pocket on
        # real evidence instead of a guessed constant.
        t0     = time.perf_counter()
        digest = self._digest(*operands)
        t1     = time.perf_counter()
        key    = f"{pocket}:{digest}{extra_key}"

        # ── cache hit path (acquires only shard lock for this key) ────────────
        entry = self._lru.get(key)
        t2    = time.perf_counter()
        hash_seconds, lookup_seconds = t1 - t0, t2 - t1

        if entry is not None:
            stored, saved = entry
            # Lossless: stored is an exact copy in the original dtype, so a
            # hit is byte-identical to what compute() would have returned.
            result = stored.copy()
            t3 = time.perf_counter()
            copy_seconds    = t3 - t2
            serving_seconds = hash_seconds + lookup_seconds + copy_seconds
            with self._stats_lock:
                self._hits                  += 1
                self._compute_seconds_saved += saved
                self._hit_serving_seconds   += serving_seconds
                self._hash_seconds_total    += hash_seconds
                self._lookup_seconds_total  += lookup_seconds
                self._copy_seconds_total    += copy_seconds
            # Admission overhead (hash+lookup) is passed separately from
            # copy cost: `settle()` weighs copy against the compute cost it
            # replaces rather than folding it into "cost paid every call".
            self._settle(pocket, hit=True,
                         overhead_seconds=hash_seconds + lookup_seconds,
                         copy_seconds=copy_seconds)
            METRICS.incr("pocket_accel.hit")
            return result, "pocket"

        # ── cache miss path ───────────────────────────────────────────────────
        c0             = time.perf_counter()
        result         = compute()
        compute_seconds = time.perf_counter() - c0

        s0 = time.perf_counter()
        self._lru.put(key, result, compute_seconds)
        store_seconds = time.perf_counter() - s0

        # Overhead paid on a miss is the hash + lookup that turned up nothing
        # — real cost with zero payoff, which is exactly what admission must
        # weigh against the compute it's trying to protect.
        overhead_seconds = hash_seconds + lookup_seconds
        with self._stats_lock:
            self._misses                += 1
            self._hash_seconds_total    += hash_seconds
            self._lookup_seconds_total  += lookup_seconds
            self._store_seconds_total   += store_seconds
        self._settle(pocket, hit=False, overhead_seconds=overhead_seconds,
                     compute_seconds=compute_seconds, store_seconds=store_seconds)
        METRICS.incr("pocket_accel.miss")
        return result, "compute"

    # ── observability ─────────────────────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        with self._stats_lock:
            hits    = self._hits
            misses  = self._misses
            bypS    = self._bypass_small
            bypM    = self._bypass_muted
            saved   = self._compute_seconds_saved
            serving = self._hit_serving_seconds
            hash_t  = self._hash_seconds_total
            lookup_t = self._lookup_seconds_total
            copy_t  = self._copy_seconds_total
            store_t = self._store_seconds_total

        lookups   = hits + misses
        total_pk, muted_pk = self._buckets.snapshot()

        speedup: Any
        if hits and serving > 0:
            speedup = round(saved / serving, 2)
        elif hits:
            speedup = float("inf")
        else:
            speedup = None

        admission_overhead = hash_t + lookup_t + copy_t + store_t

        return {
            "enabled":                    _enabled(),
            "shards":                     _NUM_SHARDS,
            "hits":                       hits,
            "misses":                     misses,
            "hit_rate":                   round(hits / lookups, 4) if lookups else 0.0,
            "bypass_small":               bypS,
            "bypass_adaptive_muted":      bypM,
            "pockets":                    total_pk,
            "pockets_muted":              muted_pk,
            "entries":                    self._lru.total_entries,
            "bytes_held":                 self._lru.total_bytes,
            "budget_bytes":               self.budget_bytes,
            "evictions":                  self._lru.total_evictions,
            "compute_seconds_saved":      round(saved, 6),
            "hit_serving_seconds":        round(serving, 6),
            "effective_speedup_on_hits":  speedup,
            # Evidence-based admission (task step 3): measured cost of each
            # cache-path phase, aggregated across every call this process has
            # served. `admission_overhead_seconds_total` is the full price
            # paid for caching (hash+lookup on every call, plus copy on hits
            # and store on misses) — compare it against
            # `compute_seconds_saved` to see whether this process's cache
            # traffic is, in aggregate, actually paying for itself.
            "hash_seconds_total":                round(hash_t, 6),
            "lookup_seconds_total":              round(lookup_t, 6),
            "copy_seconds_total":                round(copy_t, 6),
            "store_seconds_total":               round(store_t, 6),
            "admission_overhead_seconds_total":  round(admission_overhead, 6),
        }

    def clear(self) -> None:
        self._lru.clear()
        self._buckets.clear()
        with self._stats_lock:
            self._hits                  = 0
            self._misses                = 0
            self._bypass_small          = 0
            self._bypass_muted          = 0
            self._compute_seconds_saved = 0.0
            self._hit_serving_seconds   = 0.0
            self._hash_seconds_total    = 0.0
            self._lookup_seconds_total  = 0.0
            self._copy_seconds_total    = 0.0
            self._store_seconds_total   = 0.0


# ── shared singleton (one pocket tree per process, both GPUs feed it) ─────────

_shared:      Optional[PocketAccelerator] = None
_shared_lock = threading.Lock()


def get_pocket_accelerator() -> PocketAccelerator:
    global _shared
    if _shared is None:
        with _shared_lock:
            if _shared is None:
                _shared = PocketAccelerator()
    return _shared
