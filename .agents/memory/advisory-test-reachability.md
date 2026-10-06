---
name: Advisory test reachability
description: Security regression checks must prove malicious input reaches the affected operation.
---

Validate an equivalent benign payload before asserting that a malicious payload is blocked.

**Why:** An fsspec advisory's generator example used a one-element dimensions array. That produced no iterations, so neither benign nor malicious templates rendered. A no-execution result alone would have falsely proved the vulnerability fixed.

**How to apply:** Confirm that generators actually generate references, streams actually compress, and parsers actually consume the intended payload. Require the patched behavior's specific rejection or cleanup, not just an absent side effect.
