---
name: Route mount-prefix duplication and shadowing
description: Express route registration bugs where a sub-router's mount path repeats its own internal topic segment, or two routers claim the same final path and the one registered first silently wins
---

## Duplication (double segment)
A routeModules entry's `path` (the string passed to `app.use(path, router)`) must NOT repeat a word that the router's OWN internal route strings already include. If the router file has `router.get("/projects/:id/markers", ...)` and its mount entry is `path: "/api/studio/markers"`, the live path becomes `/api/studio/markers/projects/:id/markers` (double "markers") — every route in that file 404s for any client calling the intended single-mention path. Sibling routers in the same family (mounted bare at `/api/studio`) are the ground truth for the correct convention.

**Why:** Found live in this codebase for studioComping (path repeated "comping") and studioMarkers (path repeated "markers") — both left a real feature (a "Take mode" multi-take recording flow in RecordingPanel.tsx with real client callers) completely 404ing in production despite the client, service, and route-handler code all being individually correct in isolation. scripts/audit-endpoints.mjs DOES catch this as many "missing-route" findings, but only if someone reads and acts on its report — it was flagged and left unfixed by an earlier pass that fixed the sibling studioStems/studioMidi instances of the same bug class but missed comping/markers.

**How to apply:** When touching any Express sub-router mount in routeModules (server/routes.ts), diff the mount path's last segment against the router file's own route strings. Prefer the sibling convention: bare `/api/studio` mount + topic-word-once-in-route, matching studio.ts/studioStems.ts/studioMidi.ts/studioPlugins.ts/studioWarping.ts/vstBridge.ts. Re-run scripts/audit-endpoints.mjs after any route file change and confirm zero missing-route findings for files you touched. The same class of bug can exist outside the studio family — check any mount whose path's last segment also appears in its router's own route strings.

## Shadowing (duplicate-registration)
Two routers can each define a real, individually-correct handler for the exact same (method, path) pair. Express dispatches to whichever router was `app.use()`'d FIRST in registration order; the second implementation is completely dead code that never runs — no error, no warning, no crash.

**Why:** Found live for GET/POST `/api/studio/projects/:projectId/markers` and PATCH/DELETE `/api/studio/markers/:markerId` — implemented once inline in studio.ts (registered first in routeModules) and again as a separate, more complete implementation in studioMarkers.ts (with ownership checks etc.). The studio.ts version always wins, silently shadowing the newer one. Same pattern found for POST /api/studio/generate (studio.ts vs studioMidi.ts).

**How to apply:** scripts/audit-endpoints.mjs reports these as class "duplicate-registration". When found, read BOTH implementations, determine which is canonical (usually the more complete/recently-written one, or the one other live code already depends on), delete the shadowed one entirely (do not leave dead handler code behind), and re-verify the surviving route live with a real request, not just a route-existence probe.
