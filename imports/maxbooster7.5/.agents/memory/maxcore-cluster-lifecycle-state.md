---
name: MaxCore cluster lifecycle state
description: Readiness must cross the primary/worker IPC boundary.
---
Lifecycle flags in ordinary module variables are process-local. A Python
supervisor in the cluster primary cannot park HTTP workers merely by setting
its own flag. Workers must start unavailable, obtain an authoritative snapshot,
and receive subsequent transitions, including when they respawn.

**Why:** The primary logged that Python was restarting while workers continued
hundreds of connection retries against the still-closed model port.

**How to apply:** Verify state propagation with a real forked worker, not only
an in-process unit test. Also coalesce asynchronous checks per child identity
and ignore results from replaced children.