---
name: MaxCore/PDIM internalization direction
description: User directive — imported MaxCore/PDIM become internal subsystems; durable constraints
---

User directive: the imported MaxCore and PDIM repos are to run as **internal** subsystems of the unified backend, not external HTTP peers. The subsequent full-stack restoration request authorizes subsystem source changes needed for local integration; the earlier no-imported-source-edits restriction is superseded.

**Why:** removes the external-server failure class (sleeping peers, crash-on-wake, 429 backoff machinery, keep-alive pinging).

**Durable constraints:**
- Local integration must not require user-supplied service API keys. Private process-inherited authentication is compatible with this requirement; locality is not permission to disable public authentication.
- A GPU lifecycle allocation is not proof that inference uses that instance, and lifecycle metadata is not a persisted GPU state. Verify execution ownership and byte-exact VRAM/KV recovery separately.
- The shared MaxCore connector module is the ONLY place origin/credentials resolve; swap transport there, never in callers. Generation auth is Bearer-only; admin ops use only the admin header — the schemes must never be combined on one request, and admin credentials must never leak into generation calls.
- MaxCore's Python service must be run under its existing Node supervisor, not reimplemented; a pure Express-app import is insufficient.
- PDIM local mode must reuse the imported canonical store. Cluster constraint: all workers must share ONE PDIM owner (or stay remote) — a per-process store forks session/queue state and silently breaks auth and BullMQ. The old in-repo dev shim lacks blocking list ops and is not BullMQ-safe.
- PDIM args are strings only; the client rejects nullish args (TypeError) on BOTH the main exec path and the Lua/script path, instead of coercing null→"" (which silently persisted empty strings).
- The imported repos' standalone workflows are debug-only and expected to fail in this workspace; retire them as internalization lands.

**Live delivery verification boundary:** A successful isolated canonical-PDIM roundtrip does not establish that the application's storage provider can initialize and commit generated media.

**Why:** Isolated storage tests passed while the real provider initialized before the local owner existed and retained an unusable singleton. The first authenticated generation reached rendering but failed at durable commit.

**How to apply:** Verify the real provider's startup ordering and explicit endpoint/credential pairing, then exercise authenticated generation through receipt, read-back digest and unauthorized-download rejection. Keep those transport results separate from learned output quality.
