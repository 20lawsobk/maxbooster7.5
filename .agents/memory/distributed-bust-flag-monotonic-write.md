---
name: Fire-and-forget distributed flag writes need a monotonic guard
description: A cache-invalidation "bust" timestamp (or any last-write-wins flag) written via a blind SET from concurrent async callers can be overwritten by an older value arriving late, silently reverting the flag and letting stale data serve as a cache HIT again. Applies to any shared mutable "latest state" value updated by more than one concurrent writer.
---

# Fire-and-forget distributed flag writes need a monotonic guard

## The bug class
A per-user (or per-key) "invalidate everything written before time T" flag is a natural way to defend a cache against read/write races, and the read-side comparison (`entry.timestamp < bustAt` → treat as stale) is correct on its own. But if the *write* of `bustAt` itself is a plain `SETEX`/`SET` fired from an un-awaited async callback on every mutation, concurrent invalidations for the same key can complete their round-trip to the store out of order. A later invalidation's write can land first, then an earlier invalidation's write lands after it and silently overwrites the flag backward — undoing the protection with no error, no exception, nothing to log.

This is NOT hypothetical latency-tolerance paranoia — it was empirically reproduced in this project: a burst of ~30 concurrent PATCH-triggered invalidations for one user produced 19 out-of-order completions out of 60 (round-trip latency to the store varied ~20ms–200ms+ for calls issued within the same ~50ms window). After adding a Lua-script compare-and-swap (`only SETEX if no current value or new value numerically greater`) around the write, an identical burst produced 0 reversals.

## Why the read-side check alone isn't enough
Correct comparison logic on read (`if (bustAt && entry.timestamp < bustAt) treat as stale`) only works if `bustAt` itself always holds the *latest* invalidation time. A blind overwrite breaks that invariant at the write layer, and no amount of read-side correctness can compensate — the two layers are independent contracts and both must hold.

## The same risk exists one layer up, in an in-process cache
Even after the distributed store's write is made monotonic, if there's a **local in-process cache of that same flag** (e.g. an L1 cache in front of the distributed store, to avoid a network round-trip on every read), two concurrent *reads* of the now-correct distributed value can still resolve their promises out of order in-process, and the second (stale) read can overwrite the first (fresher) local cache entry — reintroducing the exact same bug independently at the local layer. The local write path needs its own monotonic guard (refuse to overwrite an existing local value with a smaller one), and any function that "read-then-cache-then-return" should return the post-write cached value (which might now be someone else's newer write) rather than the value it personally just fetched.

## How to apply
- Any time you see a per-key/per-user "last invalidated at" or similar scalar flag written via a plain `SET`/`SETEX` from more than one possible concurrent caller, treat it as suspect. Either make the write atomic-and-monotonic (Lua CAS script: `if not exists or tonumber(new) > tonumber(current) then SETEX`), or use a data structure that's inherently safe under concurrent writes (e.g. an append-only list/log consumed by readers that track their own max-seen timestamp — see the companion note on why `LPUSH`-based invalidation logs don't have this problem).
- Not every blind overwrite is dangerous — a flag whose value is always the same regardless of when it's set (e.g. a boolean "revoked" flag written as `"1"`) is idempotent and can't be reverted by reordering. The risk is specific to values that are *compared* to decide freshness (timestamps, sequence numbers, version counters).
- To verify a fix like this, don't just reason about it — add a trace log with a random per-call id and the value being written on both start and completion of the write, fire a large concurrent burst, then script-check the completion log for any write whose value is smaller than an earlier-completing write's value. Zero reversals across a large burst (tens of concurrent calls) is meaningful evidence; a handful of manual curl calls is not enough to surface this kind of race.
