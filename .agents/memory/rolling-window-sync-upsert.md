---
name: Rolling-window external analytics synced into an accumulating ledger
description: When an external API's totals are a rolling window (not lifetime-cumulative), a periodic sync into an internal transaction ledger must UPSERT by natural identity, never INSERT/append or blind onConflictDoUpdate
---

A periodic sync job that pulls "totalRevenue"/"totalStreams"-style aggregates from an
external analytics endpoint must first confirm whether that total is a ROLLING window
(e.g. trailing 30 days, recomputed fresh on every call) or a true lifetime/cumulative
figure. Appending a new ledger row per sync run silently multiplies the same underlying
revenue by however many times the job has run within that window — a correctness bug
that produces plausible-looking, steadily-growing numbers, not an obvious crash.

**Why:** the bug is invisible in a single-run test (one row looks correct) and only
compounds over days/weeks of scheduled runs, by which point it looks like organic
growth rather than double-counting.

**How to apply:** key the upsert on the natural identity of the fact being recorded
(e.g. releaseId + userId + platform + transactionType), not on a surrogate/random id.
Look up the existing row for that identity first; UPDATE it to the latest snapshot if
found (even when the new total is 0 — a rolling window can legitimately drop back
down, and a stale positive amount must not survive), INSERT only if not found AND the
new total is nonzero (avoids seeding empty rows for entities with no real activity yet).

**Constraint check first:** don't assume `.onConflictDoUpdate()` is available — check
the actual table definition for a unique/composite index on your chosen identity
columns before reaching for it. Many ledger tables (e.g. this project's
`royaltyTransactions`) have no such constraint, only a plain per-row varchar id, which
makes a native upsert impossible; a manual select-then-branch inside a `db.transaction`
is the correct fallback, not a schema change made solely to enable a cleaner upsert.
