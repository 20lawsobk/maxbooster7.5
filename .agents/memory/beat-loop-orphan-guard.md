---
name: Beat loop orphan-recovery guard
description: Orphan recovery can kill live cycles across processes
---
Scheduler calls recoverOrphanedCycles ~75s after boot; it excludes cycles started in the CURRENT process (startedAt < process-start cutoff).

**Why:** Observed 2026-07-25: when a SECOND server process boots (e.g. duplicate workflow instance, EADDRINUSE race), its recovery marks a cycle live in the OTHER process as "Interrupted by server restart" — the cycle's own final update later overwrites it, so status flaps failed→listed mid-poll.

**How to apply:** never restart the workflow while a cycle is in-flight; if a cycle shows "Interrupted by server restart" but the beat/campaign rows exist, re-check the row — the live process may have finished and overwritten the status. A robust fix would need a cross-process heartbeat/lease, not just a per-process cutoff.
