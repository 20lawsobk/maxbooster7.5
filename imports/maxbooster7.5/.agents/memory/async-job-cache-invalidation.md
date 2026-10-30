---
name: Blanket response cache misses background-job writes
description: A path-unrestricted GET cache whose invalidation only hooks synchronous POST/PUT/PATCH/DELETE will serve stale data indefinitely for any endpoint mutated by an async/background job instead of a request-response cycle.
---

The app mounts a blanket, unrestricted `cacheMiddleware()` on every GET route
(`server/routes.ts`, `server/middleware/apiCache.ts`) plus
`invalidateCacheOnMutation()`, which only fires on synchronous
POST/PUT/PATCH/DELETE HTTP requests. Any feature that kicks off a background
job (e.g. stem export: trigger via POST, then poll GET /status/:id while a
detached async function updates the DB directly) has no HTTP mutation for the
invalidator to hook — so a polling client can see a stale snapshot for up to
the full cache TTL after the real state actually changed.

Proved via a timed test: DB `completed_at` landed under 1s after
`created_at` (confirmed by direct `psql` query), but the polling endpoint
kept returning `"processing"` for 20+ seconds afterward. That ruled out
performance/contention as the cause — it was pure cache staleness.

**Why:** the cache middleware and the async-job pattern were each reasonable
in isolation; the bug only exists at their intersection, which is invisible
from reading either piece of code alone.

**How to apply:** any background/async job that mutates DB state a GET route
serves must explicitly call the cache singleton's invalidation
(`apiCache.invalidateForUser(userId)` / `invalidatePattern(...)`) right after
each write — see `stemExportService.ts`'s `processExportAsync` for the
pattern now applied there. Treat "kick off async job, poll a GET status
route" as a systemic pattern to check for this bug: audio/video job queues,
beat-loop cycles, and any other poll-for-completion feature are candidates
for the same latent staleness until verified with a timed test against the
real DB timestamp, not just "the UI eventually updated."
