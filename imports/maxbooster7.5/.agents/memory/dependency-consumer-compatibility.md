---
name: Dependency consumer compatibility
description: Security fixes must retain the actual API contract of each consumer.
---

**Rule:** Do not assume that a globally higher package version is a compatible security fix. Validate the advisory ranges for each required major and exercise the real consumer, including application startup.

**Why:** Moving all YAML consumers to a current major passed the dependency inventory but crashed Swagger startup: its old generator depends on mutable default options absent from the newer API. Desktop packaging uses a different YAML library; testing an incidental hoisted dependency had incorrectly represented its actual parser.

**How to apply:** Resolve dependencies from their consuming package, verify what the consumer imports, and test its behavior. Prefer a patched API-compatible branch when no compatible parent upgrade exists; avoid adapters, suppression, or fabricated package versions.