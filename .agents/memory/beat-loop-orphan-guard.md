---
name: Beat loop orphan-recovery guard
description: Orphan recovery must not kill cycles started in the current server session
---

**Rule:** `recoverOrphanedCycles` (called by the autonomous scheduler ~75 s after boot, after the PDIM settle delay) must only mark cycles as failed when `startedAt < processStart − 30 s` (`processStart = Date.now() − process.uptime()*1000`).

**Why:** A manual run-now fired right after a restart puts a live cycle in `generating` before the scheduler registers. Without the cutoff, the recovery pass marked the live cycle "Interrupted by server restart" mid-flight, which looked like a MaxCore failure and burned an entire debugging round.

**How to apply:** Any startup "clean stale in-flight rows" pass in this codebase needs the same current-session guard if the cleanup runs delayed rather than strictly before request handling begins.

**Related:** MaxCore has NO server-side timeout — it holds connections while cold-starting; client aborts are always our side. But `fetch failed` (vs timeout) means TCP-level unreachable — the deployment itself is down, and no client timeout tuning helps. Verify with `curl -m 30 https://secure-ai-forge.replit.app/` (HTTP 000 = down).
