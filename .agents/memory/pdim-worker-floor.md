---
name: PDIM worker-count-aware gap floor
description: Why the AIMD floor must scale with cluster worker count, and the formula used to fix sustained 429 floods in production.
---

## The rule
`_PDIM_GAP_FLOOR_MS = clusterWorkers × BASE_MS` (BASE=4ms).  
`setPdimGapFloor()` enforces a minimum of `_PDIM_GAP_FLOOR_WORKER_MIN` so no external caller can lower it below this value.

## Why
Each Node.js cluster worker has its own independent AIMD state.  
A floor of 1ms means every worker eventually ramps back to 1ms after recovering from a 429.  
With N workers all at 1ms, combined rate = N × 1000 req/s — far above PDIM's per-instance limit (~250–500 req/s).  
Result: relentless 429 → backoff → recovery → 429 cycle, visible in prod logs as continuous `PDIM HTTP 429 — gap→2ms` from every worker PID.

In production PDIM_CLUSTER_WORKERS=13, cpuCores=16 → each worker floor = 52ms → combined ≤ 250 req/s.  
In dev PDIM_CLUSTER_WORKERS=1 → floor = 4ms → negligible latency impact.

## How to apply
- `_PDIM_GAP_FLOOR_WORKER_MIN = Math.max(BASE, _clusterWorkers × BASE)` computed at module load in `server/lib/pdimClient.ts`.
- `setPdimGapFloor(ms)` clamps to `Math.max(_PDIM_GAP_FLOOR_WORKER_MIN, Math.min(2000, ms))`.
- `_pdimAdaptSuccess()` uses `Math.max(_PDIM_GAP_FLOOR_MS, ...)` — floor is always enforced on ramp-down.
- Boot log now prints: `floor=Xms (Nworkers×4ms, combined≤250 req/s)` for easy verification in prod logs.
- The jitter (1500ms random init) and 2.5× backoff multiplier remain unchanged — they desync startup and compress recovery, respectively.
