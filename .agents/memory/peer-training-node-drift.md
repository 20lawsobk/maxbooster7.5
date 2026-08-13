---
name: Separate peer/training env vars from the main origin var
description: When renaming an external service's URL, check for other env vars that independently point at the same host.
---

MaxCore's origin is normally resolved from `MAXCORE_URL || AI_SERVER_URL`. A separate feature (`maxcoreSync.ts`'s "training peer" path) reads its own `PEER_TRAINING_NODE` env var directly and independently — it is not derived from `AI_SERVER_URL`/`MAXCORE_URL` at all.

**Why:** After renaming the MaxCore external hostname everywhere in code (fallback literals, CSP allowlist, comments) and updating `AI_SERVER_URL`, a screenshot of a fresh boot log still showed the old hostname via a completely different code path — `PEER_TRAINING_NODE` was a distinct env var nobody had touched.

**How to apply:** When a rename/migration task involves an external hostname, grep for the *literal old hostname string* across env vars too (`viewEnvVars`), not just source code. A single service can have multiple independently-configured env vars pointing at conceptually related but distinct roles (main origin vs. peer/training node vs. admin key host, etc.).
