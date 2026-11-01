---
name: audit-endpoints.mjs scanner blind spots
description: Known false-positive patterns produced by scripts/audit-endpoints.mjs, so re-runs don't trigger re-investigation of already-confirmed non-bugs.
---

After multiple full sweeps fixing every real finding from `scripts/audit-endpoints.mjs`, a residual set of findings recurs on every fresh run. These are confirmed scanner artifacts, not app bugs. Recognize the pattern before re-investigating:

1. **Template-literal truncation.** The static extractor stops at the first `${` in a call like `` `/api/search/similar/${beatId}?limit=6` ``, so it tests the bare prefix `/api/search/similar` against the live server. That literal prefix genuinely 404s (the real route is `/similar/:beatId`, which requires a segment after it), so the scanner reports a "missing route" even though the real call — with an actual id substituted — hits a registered, working handler. Verify by live-probing the path WITH a placeholder id/slug substituted in, not the bare extracted string.
2. **Comment-text matches.** The extractor's regex can match an `/api/...`-shaped string that only appears inside a code comment (e.g. a comment documenting a past fix), not in any real fetch/apiRequest call. Grep the actual line for a real call expression before trusting the finding.
3. **Cache-invalidation keys treated as calls.** `queryClient.invalidateQueries({ queryKey: ["/api/whatever"] })` has no network call at all — it's a local cache-key match. The scanner still lists these as "frontend calls GET /api/whatever". Check whether the surrounding call is `invalidateQueries`/`setQueryData` (cache-only) vs. an actual `fetch`/`apiRequest`/`useQuery` queryFn.
4. **Self-inflicted probe-load timeouts.** The live-probe phase fires ~2000+ sequential/concurrent requests at the dev server in a short window. A handful of otherwise-instant routes (confirmed <25ms in isolation) can show up as `live-error` "did not complete: timeout" purely from that burst contending with the app's own background schedulers (MaxCore keep-alive, AutonomousScheduler ticks) for the event loop. Re-curl the specific path in isolation before treating a `live-error` finding as a real per-route defect.
5. **Cross-process route conflation for `duplicate-registration`.** If two hits for the same path (e.g. `/health`) come from different standalone `express()` instances (e.g. a sidecar under `server/diffusion-gateway/` with its own `.listen()` on its own port) rather than two registrations on the same app/router tree, there's no real dispatch collision — each process serves its own copy. Check whether the second file actually constructs its own `express()` app and calls `.listen()` before treating it as shadowing.

**Why:** without this list, every fresh audit run looks like it surfaced new high-severity bugs, prompting repeat investigation of the same handful of non-issues across sessions.

**How to apply:** when a new `scripts/audit-endpoints.mjs` run reports findings, check whether they match one of these five shapes before dispatching investigation subagents for them.
