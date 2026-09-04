---
name: Fabricated numeric metrics presented as real analysis
description: Several live services return hash-seeded or PRNG-seeded fake numbers (audio analysis, competitor stats, model training/canary metrics) formatted exactly like real measurements, with no marker distinguishing them from genuine data.
---

**Distinct from the [deterministic-hash-pick-vs-adaptive-bandit](deterministic-hash-pick-vs-adaptive-bandit.md)
bug class.** That class is about a discrete *choice* from a small candidate list freezing forever. This
one is about a *continuous number* (a percentage, a score, a duration, a count) manufactured from a hash
or seeded PRNG and then presented to the user/caller as if it were a genuine measurement — wrong shape for
a bandit fix entirely; the fix (if ever undertaken) is building the real measurement, not adding variety.

**Confirmed instances found during a platform-wide grep sweep (not yet fixed — out of scope for the bandit
audit that surfaced them, flagged to the user instead of auto-fixed):**

- `aiMusicService.ts` `analyzeLoudness()` — returns `currentLUFS`/`peak`/`dynamic_range` derived purely
  from hashing the project id, plus a hardcoded `confidence: 0.92`, explicitly code-commented as a stand-in
  for real audio-file analysis. The fake confidence value is the most misleading part — it invites the
  caller to trust a number that was never measured.
- `advertisingAIService.ts` `analyzeCompetitor()` (and probably its other 3 internal `seededRandom()` call
  sites — not individually audited yet) — fabricates competitor posting frequency, engagement rate,
  likes/comments/shares, and content-type distribution from `hashString(name + platform)`, commented
  "Deterministic simulation based on industry benchmarks."
- `autonomous-updates.ts` — the most severe instance: a `deterministicValue(seed, min, max)` helper is
  called at 60+ sites to fabricate an entire autonomous "self-improvement" subsystem's numbers — model
  training loss/accuracy/precision/recall/F1, canary/A-B error rate/latency/throughput/user-satisfaction,
  query performance, engagement-shift percentages, user/downtime counts. This file is live/wired (imported
  and reachable from `server/index.ts`), not dead code, so these fabricated numbers are real runtime output,
  not inert.
- `routes/socialMedia.ts` trending-hashtags endpoint — returns a `posts` count and `trend` (up/down/stable)
  computed from `hash(tag text) + sine(time)`, presented as real trending data to users.
- `dynamicTrendsService.ts` — related-topic entries get `popularity: 70 + seededIndex(topic + ":popularity", 20)`,
  a fabricated score from the topic string alone, and that score then **drives real sort order** —
  `.sort((a, b) => b.popularity - a.popularity)` — so it's not just cosmetic, it decides which "trending"
  topics rank first for real users. Confirmed live (reachable from `autoPostGenerator.ts`, wired in
  `server/index.ts`).

**Why this matters enough to record:** it directly conflicts with a "no mocks / no fabricated data"
product standard, and it is easy to rediscover piecemeal (one file at a time) without ever realizing it is
a systemic pattern across at least 4 unrelated subsystems (audio analysis, ad intelligence, ML ops
self-monitoring, social analytics). A future audit of any one of these files should assume the others are
likely still unfixed unless memory or the changelog says otherwise, and should scope a fix as "build the
real measurement" (a real feature, potentially large) rather than a quick swap — this is not the same
quick fix as the bandit class above.
