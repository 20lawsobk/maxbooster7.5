---
name: Boot-window 404s during registerRoutes
description: Routes 404 for minutes after startup while registerRoutes is still registering — not a route bug
---
`registerRoutes()` in server/routes.ts registers thousands of routes plus awaited dynamic imports; it can take minutes after the port opens. Until it finishes ("[Boot] Routes registered" log line), later-registered routes (e.g. `/api/ready` at ~line 7186) return plain Express 404s while early ones already work.

**Why:** Chased a phantom "hang" bisecting route registration when the process was simply still booting; probes right after a restart 404 misleadingly.

**How to apply:** Before diagnosing missing routes, check the log for "[Boot] Routes registered" (or wait and retry with a cache-busting query). A mixed pattern of some-routes-work/some-404 right after restart means registration is still in progress.
