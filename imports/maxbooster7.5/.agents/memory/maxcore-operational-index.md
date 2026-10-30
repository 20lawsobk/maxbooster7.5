---
name: MaxCore operational index
description: Focused MaxCore notes for API topology, health, auth, transport and generation behavior.
---

Start here for MaxCore integration changes, then follow the focused note for the specific seam:

- [Availability probing](diffbg-maxcore-check.md) — check the external MaxCore URL before local fallback.
- [Generation transport](maxcore-video-no-file.md) — video requests remain pure submit/poll/cache transport.
- [Route surfaces](maxcore-endpoint-map.md) — canonical paths and contracts.
- [Audio mastering](maxcore-audio-mastering-capability-gap.md) — endpoint capability and the remaining analysis gap.
- [Proxy allowlist](maxcore-proxy-allowlist-gap.md) — Node must expose new Python model-server routes.
- [Image generation](maxcore-image-pil-card.md) — the endpoint renders prompt text into artwork.
- [Auth headers](maxcore-auth-header.md) — generation auth uses Authorization Bearer only.
- [Fail-explicit AI](maxcore-only-fail-explicit.md) — preserve 503 errors and the documented carve-outs.
- [Resilience](maxcore-resilience.md) — bulkheads, circuit breakers, polling and media URL normalization.
- [Reconnect handling](maxcore-reconnect-callback.md) — reschedule work when MaxCore returns.
- [Crash-on-wake behavior](maxcore-crash-on-wake.md) — observed instability belongs to the MaxCore Repl.
- [Local subsystem topology](maxcore-local-subsystem.md) — supervision and health evidence.
- [Warm-up isolation](maxcore-warmup-isolation.md) — preserve guarded errors through outer wrappers.

**Why:** These are independent contracts within one integration surface; a single entry point keeps the memory index navigable without losing focused findings.

**How to apply:** Use this index for MaxCore route, availability, auth, generation or recovery work, and open the linked note matching the changed seam.