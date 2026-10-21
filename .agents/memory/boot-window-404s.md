---
name: Boot-window 404s during registerRoutes
description: Routes 404 for minutes after startup while registerRoutes is still registering — not a route bug
---
`registerRoutes()` in server/routes.ts registers thousands of routes plus awaited dynamic imports; it can take minutes after the port opens. Until it finishes ("[Boot] Routes registered" log line), later-registered routes (e.g. `/api/ready` at ~line 7186) return plain Express 404s while early ones already work.

**Why:** Chased a phantom "hang" bisecting route registration when the process was simply still booting; probes right after a restart 404 misleadingly.

**How to apply:** Before diagnosing missing routes, check the log for "[Boot] Routes registered" (or wait and retry with a cache-busting query). A mixed pattern of some-routes-work/some-404 right after restart means registration is still in progress.

**Boot stubs must hand off per route group, not at end-of-boot.** Early stubs in server/index.ts that shadow a real handler until `_routesReady` contradict sibling routes that are already live: the `/api/auth/me` stub answered "unauthenticated" while register/login already created sessions, so a boot-window sign-in looked logged out. A stub must yield as soon as its real handler (and the middleware ahead of it) is registered.
**How to apply:** when adding or reviewing a boot stub, check which related routes go live earlier in registerRoutes and hand off at that point.
