---
name: Wake-from-sleep Python grace period
description: Health monitor must not kill Python immediately after VM suspend/resume; grace window prevents needless cold restart.
---

## Rule
When the Replit VM resumes from sleep, Python's GC blocks uvicorn's event loop and the healthz thread for up to 30 s. The health monitor must NOT declare "hung" during this window.

## How it works
- `keepalive.ts` detects a sleep gap (`gap > SLEEP_GAP_MS = 15 s` between heartbeats)
- It calls `notifyWakeFromSleep()` from `python-server.ts` which sets `_postWakeGraceUntil = Date.now() + 90_000`
- `probeHttpHealth()` returns `"healthy"` immediately if `Date.now() < _postWakeGraceUntil`, skipping the hung check entirely

## Why
Without the grace period: VM wakes → healthz times out within 10 s → SIGKILL Python → 3-5 min cold restart → all proxy requests held → HTTPS 000 for all endpoints.

## How to apply
If you change the health monitor probe logic, preserve the `_postWakeGraceUntil` check **before** the healthz port probe (not after), so the fast-path is always taken during grace.
Also: `DISABLE_PYTHON_SPAWN=1` instances (dashboard proxy) do NOT run `startKeepalive()` — the real api-server's keepalive is sufficient and doubles load otherwise.
