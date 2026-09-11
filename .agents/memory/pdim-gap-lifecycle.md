---
name: PDIM adaptive gap (_pdimGapMs) lifecycle — decay, timeout mishandling, fast-fail cap
description: Three connected facts about the same AIMD gap variable in server/lib/pdimClient.ts — why it needs passive time-based decay, a bug that permanently pinned it, and a cap needed where it's read for fast-fail estimation.
---

## 1. Passive time-based decay is required (additive-only decay pins the gap for minutes)

`_pdimGapMs` decay must include a **passive, time-based geometric pull toward floor** that
fires on a timer independent of traffic. The traffic-driven additive decay in
`_pdimAdaptSuccess()` is the right behavior under load (preserves no-sawtooth) but is the
wrong behavior in the idle-after-spike state.

**Why:** three forces conspire to pin gap at the 2000ms ceiling for many minutes after a
single 429 burst:
1. **Additive decay step is small** — `_pdimAdaptSuccess()` steps 1ms at queue depth <2, 5ms
   at <5, 12ms at <10, 15ms at ≥10. A worker with queue depth <2 needs ~600 successful HTTP
   responses to crawl 2000ms → floor.
2. **Per-worker traffic is sparse** — with cluster fan-out (13 workers in prod), each worker
   handles only a fraction of total load; most spend most time at queue depth 0–1.
3. **The fast-fail path prevents the successes that would decay the gap** — when estimated
   chain wait exceeds `_MAX_DIRECT_WAIT_MS`, callers fall back to PG/in-memory and never make
   the HTTP request that would call `_pdimAdaptSuccess()`. Vicious cycle: high gap → high
   wait → fast-fail → no success → gap stays high.

**How to apply:**
- A 2-second timer that geometrically pulls gap toward floor (factor 0.8) when
  `_pdimGapMs > _PDIM_GAP_FLOOR_MS` AND no 429 in the last 5s (don't fight an active 429
  cascade).
- **Do NOT gate on queue depth.** An earlier version added a `totalDepth < 2` gate as a
  "preserve no-sawtooth under load" guard — wrong, because depth conflates `load` with
  `PDIM pressure`. In prod, the fast-fail path keeps direct queue depth pinned at the
  boundary under steady background traffic with PDIM perfectly healthy — exactly the case
  where decay is most needed. The 429-recency check alone preserves no-sawtooth.
- Recovery from 2000ms ceiling to 78ms floor takes ~25s of quiet at factor 0.8.
- Use `setInterval(...).unref()` so it doesn't keep the process alive.
- Raising the additive step instead re-introduces the sawtooth: under sustained load, a
  large additive step collapses the gap straight back to floor, triggering another 429
  within a handful of requests, infinitely. Passive decay solves idle-recovery without
  touching the under-load case.

## 2. Timeouts must NOT be treated as 429s, or decay never runs

Timeouts (`AbortSignal` `TimeoutError`/`AbortError`) must NOT call `_pdimAdapt429()`. Use a
separate `_pdimAdaptTimeout()` that nudges the gap by one floor-unit but does NOT set
`_last429At`.

**Why:** `_pdimAdapt429()` sets `_last429At = Date.now()`. The passive decay timer (rule 1
above) is gated on `_last429At === 0 OR Date.now() - _last429At >= QUIET_MS (5000ms)`.
Timeouts occur every ~5s in congested PDIM, so `_last429At` was always <5s ago → passive
decay NEVER ran → gap pinned at the 2000ms ceiling forever. This cascaded into the fast-fail
threshold firing constantly, the session store falling back to PG (added latency), BullMQ
script Workers timing out (LuaExecutor 60s timeout), and auth/me returning null-user during
the congested window.

**How to apply:** any catch block handling `err.name === 'TimeoutError' || err.name ===
'AbortError'` in `pdimClient.ts` must call `_pdimAdaptTimeout()` (= `_pdimGapMs = min(ceil,
_pdimGapMs + floor)`, no `_last429At` update), not `_pdimAdapt429()`. Passive decay resumes
within 2s after the last real 429 clears the 5s quiet window.

**Companion fixes (same session):** dev lanes increased 4 → 8 (at 200+ concurrent callers
and 48ms cap, 4 lanes gave 48ms × (200/4) = 2400ms — within 100ms of the 2500ms fast-fail
threshold; 8 lanes gives 1200ms, 2× headroom). Dev startup jitter reduced to 0 from 1500ms:
in a single-worker process there's no thundering herd, so starting at gap=1ms lets passive
decay reach floor ~40s sooner.

## 3. The fast-fail wait estimate must cap the gap it reads, not use it raw

In `_enqueueExec()` (`server/lib/pdimClient.ts`), the gap used for the fast-fail wait
estimate must be capped at `_PDIM_GAP_FLOOR_MS × 8`:

```js
const gapForFastFail = Math.min(_pdimGapMs, _PDIM_GAP_FLOOR_MS * 8);
const perLaneDirectWaitMs = (_directQueueDepth / _PDIM_DIRECT_LANES) * gapForFastFail;
const estimatedWaitMs = perLaneDirectWaitMs + _scriptQueueDepth * 10;
```

Do NOT use the raw `_pdimGapMs` (which can reach the 2000ms ceiling) for this estimate.

**Why:** after a 429 burst, AIMD pushes `_pdimGapMs` to the 2000ms ceiling. At 2000ms with 2
lanes, even 3 queued callers exceeds the 2500ms fast-fail threshold (3/2 × 2000 = 3000ms),
so virtually every new caller fast-fails. Fast-fail prevents the success events that drive
additive decay → no successes → gap stays at 2000ms → more fast-fails: the same vicious
cycle as rule 1, now visible to callers as a full outage rather than graceful degradation
during the ~30s the passive decay timer needs to pull the gap back to floor.

**Fix:** cap the gap for estimation at `floor × 8`. At prod floor=78ms: cap=624ms, fast-fail
at (8/2)×624=2496ms < 2500ms — 8 callers can queue safely. At dev floor=6ms: cap=48ms, well
within budget. The cap has zero effect at normal operation (when `_pdimGapMs ≤ floor × 8`) —
it only kicks in post-429 recovery, exactly when the vicious cycle otherwise occurs.

**How to apply:** already coded in `_enqueueExec()`. Do NOT remove or raise the cap beyond
`floor × 16` without profiling the actual queue depth during a real 429 recovery event.
