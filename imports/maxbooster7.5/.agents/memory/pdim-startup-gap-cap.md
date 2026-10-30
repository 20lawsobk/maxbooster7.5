---
name: PDIM startup gap cap
description: PermanentFixer must cap the restored AIMD gap at 400ms or the startup direct-call queue takes 28+ minutes to drain.
---

## Rule

In `server/services/permanentFixRegistry.ts`, the AIMD gap restored from PDIM at startup must be capped at `_AIMD_RESTORE_CAP_MS = 400` before calling `setPdimAdaptiveGap(capped)`.

## Why

PermanentFixer saves `_pdimGapMs` every 60s and restores it at the next boot for "session continuity" (anti-thundering-herd). If the last session ended at the 2000ms ceiling (sustained 429 cascade), the next session starts at 2000ms.

With 780+ direct callers queued at boot and a 2000ms gap: 780 × (200ms RTT + 2000ms) ≈ 28 minutes to drain. User-facing operations (session lookups, rate limiting, cache reads) wait behind all those callers. Even background model syncs and BullMQ registration are blocked.

400ms gives a safe spacing that prevents synchronized 429 storms (13 workers × 400ms = well-spread) while draining in ~4 minutes (780 × 600ms). AIMD self-tunes freely from 400ms within seconds of boot once PDIM confirms the real rate limit.

## How to apply

The cap is already coded in `permanentFixRegistry.ts` as a local constant `_AIMD_RESTORE_CAP_MS = 400`. Do NOT raise this constant beyond 500ms without profiling the startup queue drain time. Do NOT remove it — the original motivation was a real 28-minute drain that caused widespread 60s timeouts.
