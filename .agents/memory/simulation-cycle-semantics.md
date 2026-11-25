---
name: Simulation cycle semantics
description: The owner-defined repeating horizon and state behavior for MaxCore's long-running simulation.
---

MaxCore's simulation repeats a fixed ten-year horizon indefinitely and supports both continuation from the previous cycle's ending state and replay from a fixed baseline.

**Why:** the owner selected both cycle behaviors.

**How to apply:** keep the rolling and baseline histories clearly distinguished; a baseline replay is not a new real-world observation or fresh industry event.
