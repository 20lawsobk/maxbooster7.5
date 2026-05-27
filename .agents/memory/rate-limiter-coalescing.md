---
name: Rate-limiter PDIM coalescing
description: Why every high-volume PDIM-direct caller needs an L1 cache, and the shape of the rate-limiter's coalesce layer specifically.
---

When auditing recurring PDIM 429 / chain-saturation incidents, walk every direct PDIM caller and check whether it has an in-process cache. The dominant offender was the rate-limit middleware, which fired one Lua eval per API request × 13 cluster workers. Sessions, distributed cache, and revocation checks all already had L1 tiers; the rate limiter did not, so it produced the bulk of direct-chain load on its own.

**Why:** A single uncached middleware on the hot path can dwarf every other PDIM consumer combined. AIMD tuning and chain-splitting band-aid the symptom; eliminating the call volume at the source is the proper fix.

**How to apply:**
- For any new middleware or per-request hook that touches PDIM, the design must include a cache strategy *before* it ships. "Hits PDIM every request" is never an acceptable answer at this cluster size.
- For coalescing specifically (rate-limit-style "must remain cluster-accurate"): batch local hits, send the batch count to the Lua script, sync to PDIM on (a) no data yet, (b) batch ≥ N, (c) age ≥ Tms, or (d) approaching boundary. Bounded overshoot ≈ batch_size × workers; size batch so overshoot stays under ~15% of the limit.
- Concurrent callers for the same key must `await` the in-flight sync rather than firing parallel PDIM calls — otherwise coalescing reduces volume but not concurrency.
- During a rate-limit storm, rejected requests must short-circuit locally (sticky "limited until next sync" flag) or they re-flood PDIM at exactly the worst time.
- The Lua script's batch-N path must ZADD N *unique* members (e.g. `${entryId}:${i}`); a single ZADD with the same member is idempotent and undercounts.
- Coalesce state lives in a per-key Map. Prune it probabilistically (cold keys older than the rate-limit window) or an attacker enumerating distinct IPs grows it unboundedly.
