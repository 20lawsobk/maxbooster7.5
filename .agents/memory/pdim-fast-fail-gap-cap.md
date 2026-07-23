---
name: PDIM fast-fail gap cap
description: Fast-fail wait estimate must cap the live gap at floor×8; raw 2000ms ceiling causes fast-fail at 3 callers, starving recovery in production.
---

## The Rule

In `_enqueueExec()` (`server/lib/pdimClient.ts`), the gap used for the fast-fail wait estimate must be capped at `_PDIM_GAP_FLOOR_MS × 8`:

```js
const gapForFastFail = Math.min(_pdimGapMs, _PDIM_GAP_FLOOR_MS * 8);
const perLaneDirectWaitMs = (_directQueueDepth / _PDIM_DIRECT_LANES) * gapForFastFail;
const estimatedWaitMs = perLaneDirectWaitMs + _scriptQueueDepth * 10;
```

Do NOT use the raw `_pdimGapMs` (which can reach 2000ms ceiling) for the estimation.

## Why

After a 429 burst, AIMD pushes `_pdimGapMs` to the 2000ms ceiling. At 2000ms with 2 lanes, even 3 queued callers exceeds the 2500ms fast-fail threshold (3/2 × 2000 = 3000ms). This causes virtually every new caller to fast-fail:

- Fast-fail prevents the success events that drive additive decay
- No successes → gap stays at 2000ms → more fast-fails → vicious cycle
- PDIM appears completely unavailable to callers WITH fallbacks during the recovery period

The passive decay timer (0.8× every 2s) IS pulling the gap back to floor (~30s), but callers experience the full 30s as an outage rather than graceful degradation.

## Fix

Cap the gap for estimation at `floor × 8`. This reflects the highest practical wait a truly-queued caller will experience while passive decay runs. At prod floor=78ms: cap=624ms, fast-fail at (8/2)×624=2496ms < 2500ms — 8 callers can queue safely. At dev floor=6ms: cap=48ms, fast-fail at (8/8)×48×… well within budget.

**Why:** The cap has zero effect at normal operation (when `_pdimGapMs ≤ floor × 8`). It only kicks in post-429 recovery, which is exactly when the vicious cycle otherwise occurs.

**How to apply:** Already coded in `_enqueueExec()`. Do NOT remove or raise the cap beyond `floor × 16` without profiling the actual queue depth during a 429 recovery event.
