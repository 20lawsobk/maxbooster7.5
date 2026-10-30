---
name: PDIM tuning history
description: Historical queue, gap, concurrency and startup lessons; verify against current local subsystem
---
Related historical lessons:
- [Script-chain split](pdim-script-chain.md)
- [Startup gap cap](pdim-startup-gap-cap.md)
- [Worker-count floor](pdim-worker-floor.md)
- [Rate-limiter coalescing](rate-limiter-coalescing.md)
- [Gap lifecycle](pdim-gap-lifecycle.md)
- [Direct parallel lanes](pdim-direct-parallel-lanes.md)

**Why:** Queue starvation, oversized restored gaps and duplicate direct calls produced similar availability symptoms with different causes.

**How to apply:** Consult the relevant topic when diagnosing PDIM queue latency. These observations predate some local-subsystem changes; verify the current transport and configuration first.