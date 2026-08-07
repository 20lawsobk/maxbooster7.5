---
name: MaxCore/PDIM internalization direction
description: User directive — imported MaxCore/PDIM become internal subsystems; durable constraints
---

User directive: the imported MaxCore and PDIM repos are to run as **internal** subsystems of the unified backend, not external HTTP peers. Imported source must not be modified.

**Why:** removes the external-server failure class (sleeping peers, crash-on-wake, 429 backoff machinery, keep-alive pinging).

**Durable constraints:**
- The shared MaxCore connector module is the ONLY place origin/credentials resolve; swap transport there, never in callers. Generation auth is Bearer-only; admin ops use only the admin header — the schemes must never be combined on one request, and admin credentials must never leak into generation calls.
- MaxCore's Python service must be run under its existing Node supervisor, not reimplemented; a pure Express-app import is insufficient.
- PDIM local mode must reuse the imported canonical store. Cluster constraint: all workers must share ONE PDIM owner (or stay remote) — a per-process store forks session/queue state and silently breaks auth and BullMQ. The old in-repo dev shim lacks blocking list ops and is not BullMQ-safe.
- PDIM args are strings only; the client rejects nullish args (TypeError) on BOTH the main exec path and the Lua/script path, instead of coercing null→"" (which silently persisted empty strings).
- The imported repos' standalone workflows are debug-only and expected to fail in this workspace; retire them as internalization lands.
