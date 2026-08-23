---
name: Pocket-backed elastic compute
description: PocketFabric and PocketGPUPool provide uncapped logical lifecycle scaling for nodes and GPU instances.
---

The platform's elastic compute model uses the pocket dimension for lifecycle state: PocketFabric may create and drain storage-backed logical nodes without an artificial count cap, while MaxCore's PocketGPUPool creates isolated GPU lives per batch or request.

**Why:** The imported architecture was designed to scale logical node and GPU lifecycles through compressed pocket state; finite node caps contradicted that design.

**How to apply:** Preserve health, utilization, cooldown, and drain safeguards, but do not reintroduce fixed `maxNodes` ceilings or confuse logical pocket capacity with active host execution capacity.