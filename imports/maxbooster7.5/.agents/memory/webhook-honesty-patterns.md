---
name: Webhook honesty: create-then-update ID races, multi-creator events, and test-mocking pitfalls
description: How to eliminate the create-then-update external-ID race in webhook reconciliation, why a webhook handler must discriminate when multiple code paths can emit the same event type, and why mocking a whole delegated service can hide exactly the no-write bugs webhook-honesty review targets.
---

## Create-then-update external-ID race

A common integration shape: insert a local row, call an external API (Stripe
transfer/payout/account, etc.), then patch the local row with the external
object's ID once the API call returns. If a webhook for that external object
can arrive before the ID-backfill write commits, a handler that looks up the
local row **by the external ID** can transiently (or permanently, if the
backfill itself silently fails) find nothing — and naively treating "not
found" as a legitimate no-op silently drops a real event.

**Fix:** at creation time, before calling the external API, stamp the
external object's own metadata/idempotency field with your **internal** row
id (e.g. Stripe `metadata.payoutId`). Webhook handlers then look up by that
internal id first — guaranteed to exist, since the row was inserted before
the external call was even made — falling back to the external id only for
older records. This removes the race window entirely rather than just
tolerating it via the provider's retry mechanism. A lookup that still finds
nothing by either id is then a genuine anomaly (not a legitimate no-op) and
should fail/retry, not succeed silently.

**How to apply:** whenever a webhook/callback handler does "look up local row
by provider-assigned id, and if missing, log and return success" — check
whether the provider gives you a metadata/idempotency-key field you control,
and whether your creation flow could emit the webhook before your own
backfill write lands. If so, tag with your own id up front instead of
trusting a fragile post-hoc match.

## Test-mocking can hide the exact bug review is meant to catch

When the property under test is "handler X only reports success once a real
DB write is confirmed," mocking the entire delegated service (e.g.
`vi.mock(".../someService")` with `mockResolvedValue(undefined)`) and
asserting the caller reports success only proves the **caller's** try/catch
wiring is correct — it says nothing about whether the service's own internal
"record not found" or "0 rows updated" branches are honest, because the mock
always resolves regardless of what the real implementation would do.

**How to apply:** for webhook/handler-honesty regression suites, add a
second layer of tests that import the real delegated service and mock only
its dependencies (db, logger, audit), then directly exercise its
no-record/no-user/zero-rows-updated branches and assert it throws/rejects.
Reserve the whole-service mock for testing the caller's own dispatch logic
(does it convert a thrown error into a retryable failure response), not the
service's internal correctness.

## Multiple creator paths can emit the same webhook event type

Fixing the create-then-update race by stamping your own id in metadata (see
above) is not enough if more than one code path in your own app can trigger
the same external event. Two different "create a transfer" functions may
write to two different local tables under two different metadata keys — a
reconciliation handler that only knows how to look up ONE of those tables
will treat every event from the OTHER path as an orphan. If it then throws
on "not found" (the correct move for a genuinely orphaned event), it turns
real, successful transfers from the un-handled path into permanently-failing
webhook retries — a regression that looks identical to the bug the honesty
fix was meant to catch, just inverted (false failure instead of false
success). A whole-service test mock cannot catch this either, since it never
exercises the real lookup-table choice.

**Fix:** branch the lookup on whichever metadata field is actually present,
one branch per known creator path, each reconciling against its own table.
Add a third, distinct branch for "carries none of the known id fields at
all" — this is a legitimate untracked event from a path that intentionally
keeps no local record (e.g. a legacy/manual creation flow) — and make that
branch resolve successfully with a persisted audit-log trace, not a silent
no-op and not a throw.

**How to apply:** before writing "look up by id X, throw if not found" in a
webhook handler, grep for every code path that creates the external object
this event type describes. If more than one exists, check what each one
tags the object with (or whether it tags it at all), and give each a
distinct lookup/table branch instead of assuming one shape covers every
emitter.

## A buffered audit-log call is not a durability guarantee

A "legitimate no-op" branch (see above) that leaves an audit-log call as its
**only** trace of the event is not automatically honest just because the
audit call resolves without throwing. If the audit logger's normal write
path buffers entries in memory and flushes on a timer/batch-size (rather
than writing synchronously), and its flush path catches DB errors and
re-queues instead of propagating them, then the logger call can resolve
"successfully" while the row it describes never lands — and a process
crash/restart in the buffering window loses the event's only record even
though an external caller (e.g. Stripe) already got a 2xx. A test that mocks
the audit module entirely cannot catch this, since the mock always resolves.

**Fix:** give the audit logger two tiers. Keep the buffered/batched call for
high-volume best-effort logging where losing an entry on crash is
acceptable. Add a second, separate function that performs the insert
directly and does **not** catch/re-buffer on failure, so a DB error
propagates as a rejected promise. Use the confirmed variant specifically at
call sites where the audit row is the sole record of an event (no other
table gets a write on that branch) and the caller's success response to an
external system depends on that row actually existing — let its rejection
propagate so the webhook/handler reports a retryable failure instead of a
false success.

**How to apply:** when a webhook-honesty (or similar "must not report
success without a real write") fix adds an audit-log call as the entire
persisted trace for a no-op/edge-case branch, check whether the project's
audit logger is buffered before trusting that call as sufficient evidence.
Grep its flush path for a try/catch that swallows and re-queues rather than
throwing — if found, that call cannot be the thing gating a success
response. Test it with a real (unmocked) DB: prove the confirmed variant's
row exists immediately with no poll loop, and prove it rejects on a genuine
DB-level failure (e.g. a real FK violation), not just that a mock was
called with the right arguments.
