---
name: PDIM direct-call parallel lanes
description: Single-chain serialization of direct PDIM calls saturates the fast-fail boundary under sustained background load; N parallel lanes is the right shape, not a higher fast-fail threshold.
---

Direct PDIM calls were serialized through one chain per process. At RTT ≈ 80 ms + AIMD gap, single-lane throughput is ~11 ops/sec. Sustained arrivals from audit pump, presence, session writes, autonomous schedulers, etc. exceed that, the chain pins at the fast-fail boundary (depth = `ceil(_MAX_DIRECT_WAIT_MS / gap)` — e.g. 417 at gap=6ms / 2500ms threshold), and every new direct caller fast-fails to its fallback.

**Why:** the symptom looks like a leak (chain "stuck" at exactly 417 for many minutes) but it is steady-state: as one item completes, exactly one new arrival fits under the threshold. Raising the fast-fail threshold only deepens the queue without raising throughput.

**Rule:** when chain depth pins at the fast-fail boundary and `_pdimGapMs` is at/near the worker-count-aware floor, the constraint is concurrency, not gap. Split the direct chain into N parallel lanes (round-robin assignment) so throughput becomes `N / (RTT + gap)` per worker. PDIM itself handles concurrent connections — the script chain already runs in parallel with the direct chain, which is the existence proof.

**How to apply:**
- AIMD state (`_pdimGapMs`, `_rateLimitedUntil`, success/429 adapters) MUST stay global. Each lane reads the same gap and honours the same rate-limit deadline — that is what keeps cluster-wide rate within PDIM's per-instance limit.
- Update the fast-fail wait estimate to `(directDepth / lanes) × gap`, otherwise the threshold trips at 1/N of the actual draining capacity.
- Lane count must be sized against the worker-count-aware gap floor (`_PDIM_GAP_FLOOR_BASE_MS × clusterWorkers`, currently 6ms × workers) so combined req/s stays under PDIM's per-instance limit. Dev (1 worker, floor 6 ms): 4 lanes ≈ ~47 req/s at RTT≈80ms. Prod (13 workers, floor 78 ms): 2 lanes/worker ≈ ~165 req/s combined at RTT≈80ms. Recheck the math whenever `_PDIM_GAP_FLOOR_BASE_MS` changes.
- Round-robin index, not "shortest lane" — RR is O(1), self-balancing over time, and survives a slow lane (one stalled on 429 backoff) because the counter advances regardless of lane state.
- Bound the RR counter (e.g. reset at 1e6) to prevent integer drift in a long-lived process.
- Race-safety: `_rateLimitedUntil` becomes critical under parallel lanes. An in-flight success that started before a sibling lane's 429 must NOT clear a future hold. Make the 429-setter monotonic (`max(existing, newDeadline)`) and the success-clear conditional (only clear if `Date.now() >= deadline`).
- Pipeline/multi semantics: anything that calls `pipeline().exec()` and expects ioredis ordering must run sequentially within one pipeline (await each command in order), or be pinned to a single lane. `Promise.all(cmds.map(exec))` was correct under one chain and races under N lanes.
- Timeout-path asymmetry: AIMD `_pdimAdapt429()` is called on both 429 and timeout, but `_rateLimitedUntil` is only set on 429. Under PDIM slowness (not 429) the multi-lane fleet relies on gap pacing alone, no deadline hold. Consider symmetric deadline-set on timeout if a slow-PDIM saturation incident recurs.
- Throttle bypasses live outside `PdimRedisClient`: several modules (e.g. `server/routes/maxcore.ts` pdim helpers, `server/diffusion-gateway/index.ts` memory sync, `server/services/platformAutoFixer.ts` probes) fetch PDIM directly without honouring `_rateLimitedUntil` or AIMD gap. Probe/diagnostic bypasses are intentional, but request-path bypasses defeat the limiter; new operational PDIM callers should route through the client.
