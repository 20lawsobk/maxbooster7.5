---
name: Packaged restart fixture integrity
description: Keep restart rehearsal databases and repeated starts representative.
---

For isolated startup rehearsals, install the generated current schema as the
fixture baseline and apply only migrations that are not already represented.
A successful homepage or liveness response is not readiness; require the
declared readiness contract on every start cycle. Preserve readiness payloads
and artifact-integrity diagnostics on failure.

**Why:** Replaying historic create-table migrations against the generated
current schema produced a false fixture failure; correcting that exposed an
actual readiness 503 and a repeated-start artifact-manifest mismatch.

**How to apply:** Before certifying a packaged restart, verify migration
provenance, readiness per cycle, shutdown/port cleanup, and post-start build
manifest integrity in disposable fixtures.
