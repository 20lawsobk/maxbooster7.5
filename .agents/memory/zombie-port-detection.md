---
name: Zombie-port detection in python-server.ts
description: uvicorn can crash internally (port 9878 closed) while the OS process stays alive (port 9879 healthz still responds), causing the keepalive to show all 32 endpoints unreachable with no automatic recovery.
---

## The rule
When `probeHttpHealth()` returns `"down"` (9878 not open) but `pythonProcess` is still set, do NOT return immediately. Track how long the port has been closed; after PORT_DOWN_KILL_MS (60 s) SIGKILL the tracked process so its `on("exit")` fires and triggers the normal backoff-restart path.

**Why:** uvicorn is a single-threaded async server; an unhandled exception inside a request handler can kill only the event loop while the OS process (and the healthz background thread on 9879) remains alive. The health monitor used to skip the restart in this case ("exit event in flight — don't double-spawn"), leading to indefinite outage (observed: 10+ min, all 32 keepalive endpoints dark).

**How to apply:** The fix is in `artifacts/api-server/src/python-server.ts` — `_portDownSince` variable + PORT_DOWN_KILL_MS constant. If you see the log line "zombie-port detected — process alive but port closed for >60s", it is working correctly. Also reset `_portDownSince = null` in the `on("exit")` handler and on `"healthy"` / `"hung"` paths so the timer doesn't carry over across restarts.

## Symptom pattern
- `[Keepalive] Sweep #N: all 32 endpoints unreachable — Python may be starting` repeated for >2 min
- `curl http://localhost:9878/health` times out
- `curl http://localhost:9879/` returns 200 immediately
- `ps aux | grep server.py` shows the process is alive
