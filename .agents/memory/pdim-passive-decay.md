---
name: PDIM AIMD gap needs passive time-based decay
description: Why traffic-driven additive decay alone leaves workers pinned at the 429 ceiling for many minutes, and why a passive geometric pull toward floor is required.
---

## The rule
`_pdimGapMs` decay must include a **passive, time-based geometric pull toward floor** that fires on a timer independent of traffic. The traffic-driven additive decay in `_pdimAdaptSuccess()` is the right behavior under load (preserves no-sawtooth) but is the wrong behavior in the idle-after-spike state.

## Why
Three forces conspire to pin gap at the 2000ms ceiling for many minutes after a single 429 burst:

1. **Additive decay step is small.** `_pdimAdaptSuccess()` steps 1ms at queue depth <2, 5ms at <5, 12ms at <10, 15ms at ≥10. A worker with queue depth <2 needs ~600 successful HTTP responses to crawl 2000ms → floor.
2. **Per-worker traffic is sparse.** With cluster fan-out (13 workers in prod), each worker handles only a fraction of total load. Most workers spend most time at queue depth 0–1.
3. **The fast-fail path *prevents* the successes that would decay the gap.** When estimated chain wait exceeds `_MAX_DIRECT_WAIT_MS`, callers fall back to PG/in-memory and **never make the HTTP request** that would call `_pdimAdaptSuccess()`. Vicious cycle: high gap → high wait → fast-fail → no success → gap stays high.

Together: a single startup-burst 429 pinned several workers at gap≈1700ms for 3+ minutes in production, flooding logs with fast-fail warnings and degrading every PDIM-backed feature beyond the fallback path.

## How to apply
- A 2-second timer that geometrically pulls gap toward floor (factor 0.8) when:
  1. `_pdimGapMs > _PDIM_GAP_FLOOR_MS` (something to decay), AND
  2. total queue depth < 2 (load is absent — under sustained load defer to additive decay to preserve no-sawtooth), AND
  3. no 429 in the last 5s (don't fight an active 429 cascade).
- Recovery from 2000ms ceiling to 78ms floor takes ~25s of quiet at factor 0.8.
- Use `setInterval(...).unref()` so it doesn't keep the process alive.
- The closure can reference class statics declared later in the file — TypeScript resolves the reference at call time, not at definition time.

## Why not just raise the additive step
Doing so re-introduces the sawtooth the existing comment in `_pdimAdaptSuccess` warns about: under sustained load, a large additive step collapses the gap straight back to floor, triggering another 429 within a handful of requests, infinitely. The passive decay solves the *idle-recovery* case without touching the *under-load* case.
