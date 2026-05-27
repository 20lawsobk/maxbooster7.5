---
name: PDIM worker-count gap floor — size it empirically, not theoretically
description: Why the AIMD floor must scale with cluster worker count, and why the per-worker BASE must be sized from observed 429 evidence — not from PDIM's documented limit.
---

## The rule
`_PDIM_GAP_FLOOR_MS = clusterWorkers × _PDIM_GAP_FLOOR_BASE_MS`, with `setPdimGapFloor()` enforcing a hard minimum of `_PDIM_GAP_FLOOR_WORKER_MIN` so no external caller (including PermanentFixer) can lower it below the worker-aware minimum.

## Why
Each Node.js cluster worker has its own AIMD state. A floor that gives each worker rate `R` produces combined load `N × R`, where N = cluster worker count. If `N × R` exceeds PDIM's per-instance limit you get a permanent 429 sawtooth: every worker recovers back down to floor, the combined rate trips PDIM, multiplicative backoff fires, recovery resumes, repeat.

Initial fix used BASE=4ms (combined target 250 req/s) on the theory PDIM tolerated 250–500 req/s. Production logs disproved that theory. Repeated 429 waves showed the pre-multiplier gap was right at the floor (~50ms in a 13-worker deployment), proving workers were AT floor when PDIM rejected them. PDIM's real per-instance limit is **below** 250 combined req/s in this deployment.

Compounding factor: the script-chain split means direct and script chains run in parallel per worker. The shared `_rateLimitedUntil` only engages **after** a 429, not as a budget ceiling, so the steady-state combined rate is direct-chain rate + script-chain rate. The floor sizing must leave headroom for both.

BASE was raised 4ms → 10ms (combined target ~100 req/s direct chain) which gives real headroom under PDIM's threshold.

## How to apply
- Always size the per-worker BASE from **observed 429 evidence**, not from PDIM's documented capacity. If 429s recur with the pre-multiplier gap sitting at or near floor, raise BASE.
- `_PDIM_GAP_FLOOR_WORKER_MIN = Math.max(BASE, clusterWorkers × BASE)` computed at module load.
- `setPdimGapFloor(ms)` must clamp to `Math.max(_PDIM_GAP_FLOOR_WORKER_MIN, Math.min(2000, ms))` — never lower than the worker minimum.
- `_pdimAdaptSuccess()` decay must `Math.max(_PDIM_GAP_FLOOR_MS, ...)` so floor is enforced on every ramp-down.
- Boot log must print `floor=Xms (Nworkers×BASEms, combined≤Y req/s)` so the live budget is visible in prod logs without grepping the source.
- When checking whether a 429 storm warrants raising BASE: look at the `gap→Xms` values in the 429 log lines. Divide by 2.5 (the AIMD multiplier) to get the pre-429 gap. If that pre-429 gap ≈ per-worker floor, the floor is too low and BASE must rise.
