---
name: Beat loop self-optimization design
description: How the Beat Money Loop self-optimizes genre, price, and batch size, and the honesty rules around it
---
**Rule:** all self-optimization must be driven ONLY by real backfilled outcomes (beatMoneyLoopCycles plays/downloads/revenueCents written by analyseRecentCycles) — never fabricated scores.

- Genre: revenue-weighted pick over the genre pool with +1.5 forced-exploration bonus for untried genres (never lock to one arm). Genre spellings must be normalized (lo_fi/lofi, r&b/rnb) before aggregating history.
- Price: adaptive factor on the genre median — downloads raise it (cap 1.15), 3+ listings with zero downloads discount to 0.85; fallback to static 0.95.
- Batch size: 1–3 beats per scheduled tick via the existing queueOverrides auto-chain; any consecutive failure pins batch at 1.
- Campaign optimizers (targeting/creative/bidding) return `boolean` = a real DB change was persisted; caller only counts/notifies for applied ones. Targeting writes targetAudience.priorityPlatforms which activateCampaign now actually consumes for platform ordering; organicMetrics.posts entries must carry creativeId or optimizeCreative has no data.

**Why:** code review found "optimized" claims with no consumed side effects (see autonomous-completed-honesty memory) — the loop had called four methods that didn't exist, so campaign self-optimization had been silently dead.
