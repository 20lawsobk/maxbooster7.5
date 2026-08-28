---
name: Two separate MaxCore integration paths
description: "MaxCoreLocal" (Python ai-training-server) and "external/maxcore workspace bootstrap" (Node artifact provisioning) are structurally distinct subsystems that are easy to conflate from log text alone.
---

This codebase has TWO different things both referred to as "MaxCore" that must not be conflated when triaging a warning or deciding something is fixed:

1. **MaxCoreLocal** — the Python `ai-training-server`/`server.py` subsystem, supervised as a child process on port 8090 (see `maxcore-local-subsystem.md`). This is the subsystem that CPU/resource-tuning work (`SiliconSimtBackend`, `PocketAccelerator`, resource planning) edits and exercises. In the dev workflow this has been observed healthy.
2. **external/maxcore workspace bootstrap** — a separate Node-based startup path (`server/services/maxcoreLocalSupervisor.ts`, checked at boot by `server/startup-probes.ts`) that auto-provisions a nested `external/maxcore/artifacts/api-server` workspace on a clean checkout. This path has been observed failing in the deployed/production-style environment specifically (log text: "external/maxcore workspace bootstrap failed" -> "Startup completed in degraded mode"), independent of whether MaxCoreLocal itself is healthy.

**Why:** Both surface log lines containing "MaxCore" plus words like "degraded" or "failed," so it's easy to assume a warning about one means the other is also broken, or already fixed by work that only touched the other one. They have different failure domains and different supervising code, and can be healthy or broken completely independently of each other across sessions.

**How to apply:** When investigating a MaxCore-related warning, identify WHICH of the two log sources actually produced it (the `maxcoreLocalSupervisor.ts`/`startup-probes.ts` message text vs. the Python `ai-training-server` process's own logs on :8090/:9879) before concluding either subsystem is fixed or broken. Verify current status live — `ps` for the process, `curl` the real health endpoint on its actual port, `curl` an authenticated stats route — rather than trusting a prior session's log snapshot, since either subsystem's state can change between sessions independent of the other.
