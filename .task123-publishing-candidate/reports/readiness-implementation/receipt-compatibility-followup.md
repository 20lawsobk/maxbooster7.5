# Scheduled-post receipt compatibility follow-up

## Verified defect

The scheduled-post read path recognized `engagement.postingResults` and a
root-array legacy value, but not the accepted legacy object shape
`engagement.results`. The write expression had the same omission. Consequently,
a metadata-only update could canonicalize an object while leaving legacy
receipts unreadable, and a results update could replace a same-platform legacy
confirmed or unknown receipt because that receipt was absent from the
replacement guard.

Follow-up review found a second defect in the pre-existing replacement rule:
`started` and `unknown` were protected from every same-platform incoming
receipt. That also rejected the genuine `started -> unknown -> confirmed`
sequence. The current `PostResult` contract identifies an attempt with
`platform` plus `postedAt`; the V2 publisher creates `postedAt` on the pending
object and mutates that same object after the provider returns. Platform alone
does not identify an operation.

Caller tracing found that `updateScheduledPostStatus` delegates to this shared
merge and the legacy posting service supplies its final result array there. The
V2 service currently persists its interim and final arrays through
`checkpointSocialPost`, which replaces the V2 array directly; its pending
object's unchanged `postedAt` nevertheless defines the current receipt contract.
The shared compatibility merge must safely consume those stored V2 receipts
during later metadata/status updates and any same-attempt reconciliation.

## Repair

- Reads now normalize root arrays, `postingResults`, and legacy `results` to the
  public `results` array. Mixed transitional objects expose both receipt arrays,
  and metadata no longer depends on `_autopilotMeta`.
- Writes use one PostgreSQL expression evaluated against the current row.
  Existing receipts are collected from all three accepted shapes, exact
  duplicates are removed, and the result is stored canonically in
  `postingResults`.
- The object value is retained as the merge base, preserving unrelated metadata.
  The legacy `results` key is removed only after its receipts have entered the
  canonical aggregate.
- Outcomes are ranked as ordinary/failed, `started`, `unknown`, and
  confirmed/`success: true`. A protected receipt progresses only when the
  incoming receipt has the same platform and the same non-null `postedAt`, and
  has a higher outcome rank. Confirmed outcomes cannot downgrade. A protected
  receipt also blocks an incoming receipt whose platform matches but whose
  operation timestamp differs, preventing one operation from being replaced by
  an unrelated same-platform result. Identity-less legacy failed receipts retain
  the historical platform-only replacement fallback.

## Isolated evidence

The focused Node tests transpile and execute the real methods from
`server/storage.ts` with only the database boundary replaced. They cover all
three persisted receipt shapes, a mixed legacy/current object, and falsy
metadata. A private temporary PostgreSQL 16 cluster executes the SQL expression
captured from the production method against a minimal table. It behaviorally
proves legacy and current metadata-only preservation, `started -> unknown ->
confirmed` progression for one operation, confirmed no-downgrade, and rejection
of a different-operation same-platform replacement. The shared closure test also
asserts legacy-source ingestion and canonical-key removal.

Executed:

```text
node --test tests/scheduled-post-receipt-compatibility.cjs tests/closure-integrations-shared.cjs
```

Result after the transition follow-up: 7 tests passed, 0 failed, 0 skipped, 0
cancelled (`duration_ms 6676.680006`). The checks include three focused
receipt-compatibility tests (one using real isolated PostgreSQL) and four
existing shared closure checks.

The PostgreSQL test proves expression behavior, not concurrent-transaction
serialization. It uses a disposable cluster on a private Unix socket and removes
it after the test. No application/live database mutation, provider call, package
change, workflow start, or application start was performed.