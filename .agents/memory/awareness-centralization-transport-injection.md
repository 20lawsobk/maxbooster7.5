---
name: Awareness centralization via transport-layer injection
description: When a rich live-signal awareness system already exists, extend it with one shared payload-builder and inject at the shared transport chokepoint instead of building a competing system or patching each call site.
---

This codebase already had a rich, live-signal-backed awareness system (`awarenessContext.ts` fronting
an RSS/Tavily/Exa-backed aggregator: trending genres/moods, content angles, CTA patterns, emotional
triggers, platform-algorithm notes) before a task to "wire awareness into every generation service"
began. The correct move, once that was discovered, was NOT to build a second/competing awareness
mechanism — it was to:

1. Extract the one proven awareness-mapping pattern (previously inlined in a single caller) into a
   shared exported builder function that returns a typed payload or `null` when nothing real is
   available (never a fabricated default).
2. Inject that payload at the ONE shared transport chokepoint every generation call already passes
   through (the AI client's `generate()`/`infer()` methods), keyed off a path/body heuristic, skipping
   silently (never throwing) if the caller already supplied its own `awareness` field. This reached
   ~20+ existing call sites with a single, small, well-tested change instead of touching every
   generation service file individually.

**Why:** duplicating trend/awareness logic per-service (as an earlier, unrelated part of the codebase
had started doing with a separate `dynamicTrendsService`/`platformAwarenessOptimization` pair) creates
two divergent sources of truth that silently drift apart. A single injection chokepoint also means
every NEW generation call site gets awareness for free with zero additional wiring, as long as it
goes through the shared client.

One endpoint must be excluded from any generic-text awareness injection: an image-generation endpoint
that renders its composed prompt as literal typographic artwork (PIL text-card style) — injecting
trend/CTA prose into that prompt corrupts buyer-facing cover art with garbled overlaid text. That
exclusion is a deliberate, commented carve-out, not an oversight; do not "complete the coverage" by
removing it.

**How to apply:** before adding awareness/trend-conditioning to a new generation surface, grep for
whether a shared awareness system already exists and what its payload shape is, rather than assuming
none exists. Verify the shared builder function directly (call it standalone with real inputs and
inspect the returned object for real, non-empty data) before trusting that call sites wired through it
work — a clean typecheck does not prove the live signal source is actually returning data.
