---
name: MaxCore resilience patterns
description: Keep-alive, bulkhead, circuit breaker, 202-async, and media-URL rules for the external MaxCore AI server
---

# MaxCore resilience rules

- **Never use a generation endpoint as a keep-alive/availability probe.** Warmth pings and `isAvailable()` once POSTed `/api/generate/content`; with MaxCore's server-side timeouts removed, this queued hundreds of real AI jobs and took MaxCore fully down. Probe only `GET /api/platform/model/info` (15 s timeout).
- **Any route waiting on MaxCore for >~120 s must be async (202 + poll).** The Replit proxy kills held connections at ~120 s. Pattern: submit job → return `{jobId, pollUrl}` immediately → client polls `/api/audio-job/:id`. Applied to studio text-to-audio and beat-loop `/run-now`.
- **MaxCoreAIClient has a bulkhead (8 concurrent, 30 s wait then null) and circuit breaker (3 consecutive network failures → open 60 s, single half-open probe).** HTTP error responses do NOT trip the breaker (server responding = up); only network errors/timeouts do. Null return surfaces upstream as 503 via requireMaxCore.
- **MaxCore returns media URLs relative to ITS domain** (`/uploads/...`). Unrewritten, they resolve against our domain and the SPA serves index.html (an "HTML mp3"). `maxcoreProxy.ts absolutizeMediaUrls()` rewrites url-ish fields on every proxied JSON response.
- **MaxCore restarts lose in-flight/finished job records** — a poll returning `{"status":"error","error":"Job not found"}` after a MaxCore restart means resubmit, not a client bug.

**Why:** July 2026 outage — warmth pings flooded MaxCore's queue until even metadata GETs timed out; recovery required restarting MaxCore.
**How to apply:** any new MaxCore call site must go through MaxCoreAIClient (inherits bulkhead+CB) or the maxcoreProxy (inherits URL rewrite), and any long-running op must use the 202+poll pattern.
