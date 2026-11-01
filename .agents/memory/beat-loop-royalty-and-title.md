---
name: Beat loop royalty splits and title sanitization
description: Revenue rows, title sanitization fixes added to the beat money loop; circuit breaker and cycle-metric timing details.
---

## Royalty Splits for Beat Loop Beats

**Rule:** `_createBeatRecord()` now inserts a `royalty_splits` row for every newly listed beat. `releaseId` holds the beat's UUID (varchar, no FK), `percentage=100`, `status='active'`. Uses `process.env.ADMIN_EMAIL` as collaborator email.

**Why:** The task spec requires "revenue rows appear after cycle completes." The royaltySplits table is the correct hook — the marketplace payment flow uses it to route earnings. Without a split record, completed cycles have no durable revenue ownership row.

**How to apply:** Existing beats listed before this fix have no split record — a one-time backfill is needed (see follow-up task). For new cycles: automatic.

---

## Beat Title Concept Sanitization

**Rule:** `conceptRaw` from MaxCore (`mc.concept ?? mc.styleHook`) must be sanitized with `.split(/\r?\n/)[0]` (first line only) BEFORE the `.slice(0,50)` cap. Also strip embedded `(fast tempo ...)`, `(BPM ...)`, and `(key ...)` patterns that would duplicate the title suffix.

**Why:** MaxCore returns multi-paragraph concept text like `"Dark trap (fast tempo, 122.0 BPM, A minor).\n\nTrend"`. Without first-line extraction, newlines persist into `beats.title` and break the marketplace title display.

---

## Circuit Breaker Timeouts for Social Dispatch

**Rule:** Instagram and Threads circuit breakers use 45s (bumped from 20s). socialApi also bumped to 45s. These are in `server/services/externalServices.ts`.

**Why:** Instagram media upload (video) regularly exceeds 20s, causing timeout errors logged as platform failures even when the post would have succeeded. 45s matches real-world upload times for ~10MB video files.

---

## analyseRecentCycles() Timing

**Rule:** `analyseRecentCycles()` is now called fire-and-forget at the end of every successful `runCycle()` (in addition to the scheduler heartbeat after `tick()`). This ensures revenue metrics are current immediately after a cycle, not just on the next 30-min heartbeat.

**Why:** Manual cycles triggered via `/api/admin/beat-money-loop/run-now` bypass the scheduler tick, so revenue metrics were only refreshed on the next scheduled tick (up to 30 min later).
