---
name: Fsync-aware BullMQ lock tests
description: How to test BullMQ lease renewal and stalled-job recovery against the real local PDIM AOF.
---

Use the real local PDIM HTTP path and fsynced journal when validating BullMQ lock renewal. Keep `lockDuration` long enough for real command round trips, then hold the processor beyond that duration and verify it completes once. To test stalled recovery, remove the active lock deliberately, observe the expected lock-loss errors, and require the job to be reclaimed and completed.

**Why:** A short test lease can expire during ordinary HTTP plus fsync latency and report a false compatibility failure; ignoring all worker errors would hide genuine lock-loss defects.

**How to apply:** Exercise renewal and recovery with production-shaped multi-second leases, assert execution counts and final state, and tolerate only the precise lock-loss errors induced by the test.