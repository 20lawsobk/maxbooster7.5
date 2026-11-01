---
name: MaxCore crash-on-wake instability
description: MaxCore wakes briefly then hard-crashes ~25-30s later under audio render load; keep-alive pings do not prevent it
---
**Observation (July 2026):** `secure-ai-forge.replit.app` alternates between total unreachability (HTTP 000, hours at a time) and brief wake windows (uptime 1–5 min). Every audio job submitted during a window is accepted (job_id, status pending/rendering) but the server dies ~25–30 s later, losing the in-memory job (poll → 000, then 404 after its restart). 2-second `/api/health` keep-alive pings do NOT prevent the crash — it is load/memory-related, not idle-sleep.

**Why:** jobs lost this way: e3ed0828, 0f33f624, 7b2df484, de5d5103, c0d15741 — five consecutive losses across multiple sessions/wake windows.

**How to apply:** chasing wake windows with resubmission (scripts/poll_chart_topper.py) is not sufficient; the fix is on the MaxCore deployment itself (crash under render load). Don't burn hours re-polling — after 2 lost jobs in one session, report blocked and ask the user to fix/restart the MaxCore Repl. Possible mitigation to try once: much shorter duration (10–15 s) so the render finishes inside the window.

## Local-child event-loop hang variant (Aug 2026)
Symptom: 9878 uvicorn stops accepting (curl times out) while 9879 healthz liveness still 200 and the process is alive — event loop blocked, matches bg-thread GIL stall class. 8090 proxy goes down with it. Fix: kill -9 both the `uv run` wrapper AND the python pid; supervisor respawns healthy in ~30s. Plain SIGTERM is trapped/ignored.
