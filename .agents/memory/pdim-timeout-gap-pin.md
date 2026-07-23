---
name: PDIM timeout-as-429 gap-pin bug
description: Timeouts called _pdimAdapt429() which set _last429At, permanently blocking passive decay and pinning the gap at 2000ms.
---

## The Rule
Timeouts (AbortSignal TimeoutError/AbortError) must NOT call `_pdimAdapt429()`. Use a separate `_pdimAdaptTimeout()` that nudges the gap by one floor-unit but does NOT set `_last429At`.

**Why:**
`_pdimAdapt429()` sets `_last429At = Date.now()`. The passive decay timer (0.8× every 2s) is gated on `_last429At === 0 OR Date.now() - _last429At >= QUIET_MS (5000ms)`. Timeouts occur every ~5s in congested PDIM. So `_last429At` was always <5s ago → passive decay NEVER ran → gap pinned at 2000ms ceiling forever. This caused the fast-fail threshold to fire constantly, the session store to fall back to PG (adding latency), BullMQ script Workers to time out (LuaExecutor 60s timeout), and auth/me to return null-user for requests during the congested window.

**How to apply:**
- Any catch block handling `err.name === 'TimeoutError' || err.name === 'AbortError'` in pdimClient.ts must call `_pdimAdaptTimeout()`, not `_pdimAdapt429()`.
- `_pdimAdaptTimeout()` = `_pdimGapMs = min(ceil, _pdimGapMs + floor)` — no update to `_last429At`.
- Passive decay resumes within 2s after the last real 429 clears the 5s quiet window.

**Companion fixes (same session):**
- Dev lanes increased from 4 → 8: at 200+ concurrent callers and 48ms cap, 4 lanes gave 48ms × (200/4) = 2400ms — within 100ms of the 2500ms fast-fail threshold; 8 lanes gives 1200ms (2× headroom).
- Dev startup jitter reduced to 0 (from 1500ms): in a single-worker process there is no thundering herd; starting at gap=1ms lets passive decay reach floor ~40s sooner.
