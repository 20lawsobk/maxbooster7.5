---
name: Backend-only MaxCore/PDIM internalization
description: User directive — internalizing external MaxCore and PDIM servers must touch the backend only
---

## Rule
The internalization of the external MaxCore and PDIM servers into Max Booster is a BACKEND-ONLY change. No frontend additions, UI panels, client routes, or client-side awareness of the subsystems may be added as part of it.

**Why:** explicit user directive (2026-08-11). The subsystems are infrastructure; the client must remain unchanged by their relocation.

**How to apply:** any work on PDIM/MaxCore internalization (local exec endpoints, env rewiring, queue command coverage) stays under `server/`; expose status only via existing backend surfaces (e.g. /api/ready, admin API), never new client components.
