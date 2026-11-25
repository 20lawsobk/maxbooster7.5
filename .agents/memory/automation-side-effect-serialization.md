---
name: Automation side-effect serialization
description: Keep scheduled and event-driven workflows from duplicating external actions when triggers overlap.
---

Serialize each workflow's action execution and make start/stop transitions idempotent. Do not automatically replay a provider action when its outcome is ambiguous; require a durable idempotency key and persisted execution receipt before adding retries.

**Why:** The in-process scheduler ticks more frequently than some provider actions complete, so overlapping ticks or duplicate triggers can repeat a payment, social post, or distribution submission. An in-memory lock prevents concurrent repeats in one process but does not prove exactly-once behavior across process restarts or multiple instances.

**How to apply:** Preserve per-workflow execution fencing and accurate active/completed/failed counters. Before enabling retries or horizontal workers for external actions, persist an operation identity and provider outcome, then test replay and crash recovery with isolated fixtures.
