---
name: PDIM worker-count gap floor — there's a window between 429s and starvation
description: Why the per-worker BASE must sit between two empirical failure modes, and why direct callers need a fast-fail when the chain stalls.
---

## The rule
`_PDIM_GAP_FLOOR_MS = clusterWorkers × _PDIM_GAP_FLOOR_BASE_MS`. The BASE must be picked from the **window between two production failure modes**, not from PDIM's documented capacity. Direct calls must fast-fail (drop to fallback storage) when the chain wait exceeds a small bound — never queue unbounded.

## Why
There are two opposing failure modes and BASE must thread the needle between them:

1. **Too low (combined rate > PDIM threshold):** every cluster worker has its own AIMD state; combined steady-state rate = `N × 1000/floor`. When that overruns PDIM's per-instance limit you get a permanent 429 sawtooth — workers recover to floor, combined load 429s them, multiplicative backoff fires, recovery resumes, repeat. Empirical: BASE=4ms (combined ~250 req/s with N=13) produced recurring 429 waves where the pre-multiplier gap was right at floor.
2. **Too high (combined rate < arrival rate):** chain depth grows unbounded because drain can't keep up with what sessions, BullMQ cleanup, schedulers, and probes are putting in. Empirical: BASE=10ms (combined ~100 req/s with N=13) drove chain depth to 29,000+ callers within minutes; session fetches timed out; login broke. No 429s in the logs at this point — just a starved-throughput stall.

The working middle: BASE=6ms (combined ~167 req/s with N=13) — ~30 % below the 429 trigger, ~70 % above the starvation threshold.

A defensive second layer is essential because the safe window narrows under load: direct user-facing callers (sessions, distributed cache, rate-limiter) must **fast-fail** when the estimated chain wait exceeds a small bound (we use 2500 ms) so their PG / in-memory fallback actually runs. Without a fast-fail, a temporary throttling spike turns into a user-visible outage even when fallbacks exist in the code.

## How to apply
- Always size BASE from **observed evidence**, not PDIM's documented capacity. There is a window, and PDIM's docs do not tell you where it is.
- When 429s recur: divide `gap→Xms` in the 429 log lines by 2.5 (the AIMD multiplier). If the pre-429 gap ≈ per-worker floor, BASE is too low — raise it.
- When chain depth grows unbounded with no 429s: BASE is too high — lower it.
- `setPdimGapFloor(ms)` must clamp to `Math.max(_PDIM_GAP_FLOOR_WORKER_MIN, Math.min(2000, ms))` so no external caller (e.g. PermanentFixer) can drop the floor below the worker-aware minimum.
- `_pdimAdaptSuccess()` decay must enforce `Math.max(_PDIM_GAP_FLOOR_MS, ...)` on every ramp-down.
- `_MAX_DIRECT_WAIT_MS` must be a real value (not `MAX_SAFE_INTEGER`). The fast-fail path is load-bearing: it is the thing that keeps login working when the chain is degraded but fallbacks exist.
- Boot log must print `floor=Xms (Nworkers×BASEms, combined≤Y req/s)` so the live budget is visible without grepping source.
