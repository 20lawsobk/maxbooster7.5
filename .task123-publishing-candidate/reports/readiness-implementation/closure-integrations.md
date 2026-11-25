# Original I2 / I3 / I6 / I7 closure work

## Follow-up: granted shared slices integrated

This section supersedes the earlier pending **scheduler** and **scheduled-post
compatibility write** instructions below. The main agent explicitly granted
exclusive ownership of those methods/startup slice for this follow-up.

- `storage.ts:updateScheduledPost` now atomically merges named scheduling
  metadata into the existing JSON object. Raw engagement replacement is rejected.
  `postingResults` is normalized from existing object or legacy array form.
  Existing started/unknown/confirmed/successful platform receipts cannot be
  discarded or overwritten by compatibility writes. Previously absent platforms
  may be added; definitive unsuccessful receipts can be replaced. Unrelated
  metadata and recovery flags survive. A status-only update does not touch
  engagement. `updateScheduledPostStatus` delegates to this same write path.
- `index.ts` now performs a read-only digest schema prerequisite before starting
  any readiness background worker. It registers `runNotificationDigestBatch`
  every 60 seconds with the existing single-flight `scheduleDrainingWork` and
  pushes the stop hook into `readinessWorkerStops`. Existing shutdown prevents
  further ticks and awaits the active batch (within the application's existing
  shutdown deadline). The digest consumer is **scheduled**, not a pending hook.
- The other worker owns the actual additive migration; its table/column/index
  contract remains the SQL below. No schema/migration file was edited here.
- `storage.ts:createNotification` was deliberately **not** given silent generic
  preference suppression: no authoritative essential-security/financial notice
  exemption policy or nullable-callsite contract is established. Current mounted
  callers expect a notification object. Inventing mandatory/optional policy or
  returning a phantom/null notification would be unsafe. Legacy producer
  centralization therefore remains explicitly open; existing essential notices
  have not been disabled or moved into external provider calls.
- The `getScheduledPostById` normalization recommendation remains outside the
  granted write-method slices. V2 execution/immediate-result reads already guard
  arrays locally.

Follow-up verification (no services contacted):

`env -i PATH="$PATH" HOME=/tmp node --test tests/closure-integrations-shared.cjs tests/readiness-worker-composition.cjs tests/closure-integrations.cjs tests/integrations-readiness.cjs`

**16 passed, 0 failed, 0 skipped**, exit 0. New tests execute the extracted actual
storage methods with an isolated query boundary, inspect SQL/payload preservation,
exercise compatibility delegation and rejection-before-write, and assert the
actual startup registration/schema-gate ordering. Existing lifecycle tests prove
single-flight work, stop preventing future ticks, and waiting for active work.
SQL expressions have not been executed against PostgreSQL; real transaction/
concurrency and receipt preservation acceptance remain required.
Both shared TypeScript files also parsed with zero syntax diagnostics using
`transpileModule`; this is not a semantic typecheck.

## Disposition

Source improvements implemented; **not release-ready**. Read
`remaining-gap-execution.md`, `closure-verification.md`, and superseding
`resume-integration.md`. Existing notification router precedence, callback
verification, exact CSRF exemptions and raw-body capture were retained. No
LabelGrid files, schema, package/configuration files or another worker's files
were edited. Shared monolith changes are limited to the explicitly granted
follow-up slices described above.

## Implemented

- **I2:** Submission checkpoint/completion writes now require the original owner
  and `started` state, with exactly one returned receipt. A zero-row checkpoint
  stops the next provider action. A missing completion write cannot return
  success. Error handling cannot downgrade an already completed record. Unknown
  attempts remain quarantined; no remote endpoints, provider statuses or create
  retries were invented.
- **I3:** Spotify enriches **every** discovered album, follows every track page,
  and processes albums sequentially rather than limiting enrichment to ten
  albums/one page. Failed/malformed pages now reject rather than silently
  substituting a different catalog. An authoritative empty Spotify result stays
  empty. Initial access-block/no-token fallback remains explicitly partial.
  Spotify album/track and Deezer album cursors reject foreign origins,
  credentials, repeated cursors and safety-limit exhaustion; redirects are
  rejected. Spotify requires explicit exhaustion. Deezer retains its existing
  contract where absent `next` ends pagination but rejects malformed cursors.
  Removed comments claiming iTunes is an authoritative Spotify mirror.
- **I6:** Claims refuse recovery-required or started/unknown posting receipts even
  if another path resets the post to pending. Execution preserves existing
  per-platform results instead of repeating creates. Immediate posting reads the
  storage adapter's normalized `results` field, not just raw engagement. Existing
  serialized checkpoints and unknown outcomes remain intact.
- **I7:** Added a real durable digest producer and bounded consumer, connected to
  `notificationService.send`. Daily/weekly event storage is independent of
  in-app visibility. Consumer rechecks current mute/category/channel policy,
  suppresses withdrawn eligibility, defers quiet-hour events, commits claims
  before sending through existing `emailService.sendOnce`, and stores accepted,
  rejected or unknown receipts. Started/unknown work is never blindly resent.
  `digestQueued` is distinct from delivery. Due windows are fixed UTC 24-hour/
  seven-day epoch-aligned windows, not a claim of recipient-local send time.

## Exact shared integration patches required (main-agent ownership)

### Additive migration prerequisite

The new digest source requires this table before it can accept a digest-enabled
notification. Put the following in the next reviewed additive migration; do not
apply live before backup/rollback/provenance prerequisites. No runtime DDL exists.

```sql
CREATE TABLE IF NOT EXISTS integration_notification_digest (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  due_at timestamptz NOT NULL,
  state text NOT NULL CHECK
    (state IN ('pending','started','accepted','rejected','unknown','suppressed')),
  owner uuid,
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_notification_digest_due
  ON integration_notification_digest (due_at,id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS integration_notification_digest_owner
  ON integration_notification_digest (owner) WHERE owner IS NOT NULL;
CREATE INDEX IF NOT EXISTS integration_notification_digest_user_due
  ON integration_notification_digest (user_id,due_at) WHERE state='pending';
```

Register this table in any explicit application-account erasure inventory;
its user FK cascades when the account row is actually removed. Digest event
retention must follow the operator-approved notification retention policy, not
an invented period.

### Scheduler / lifecycle

After migration readiness in `server/index.ts`, import
`runNotificationDigestBatch` from `./services/notificationDigestService.js`.
Run it on the existing bounded background scheduler, with a local single-flight
guard and logged errors; clear the interval at shutdown. It processes at most
100 events for one user per call. PostgreSQL row locks permit multiple replicas
without reusing claimed events. Do not add any requeue of started/unknown rows.
Provision the existing `SENDGRID_FROM_EMAIL` sender and authenticated Resend
configuration. Missing sender is rejected explicitly, never replaced with a
fabricated sender.

### Shared scheduled-post compatibility writes

`server/storage.ts:updateScheduledPost` and `updateScheduledPostStatus` still
replace all engagement JSON with an array when `results` is supplied. Replace
both `updateValues.engagement = results` assignments with a SQL object merge:

```ts
sql`(CASE WHEN jsonb_typeof(${posts.engagement}::jsonb) = 'object'
     THEN ${posts.engagement}::jsonb ELSE '{}'::jsonb END)
     || ${JSON.stringify({ postingResults: results })}::jsonb`
```

In `updateScheduledPost`, merge provided `platforms`, `viralPrediction`,
`createdBy` and object `content` into the same JSON object without overwriting
unrelated fields. Preserve the existing singular platform/content column writes.
Do not let status resets remove `postingRecoveryRequired` or ambiguous receipts.
Normalize `getScheduledPostById.results` to an array only: `postingResults` when
array, else legacy engagement when array, else `[]`; currently a non-autopilot
engagement object can escape as `results`.

### Legacy notification producers: concrete remaining bypasses

- `server/storage.ts:createNotification` inserts without reading canonical
  preferences. Make its in-app insertion conditional on
  `notificationAllowed(user.notificationSettings,data.type,"inApp")`, adjust
  its return type/callers for suppression, and route intended email/push/SMS
  notifications through `notificationService` rather than silently changing a
  storage insert into external sends.
- The legacy `/api/notifications/test` handler in `server/routes.ts` still calls
  that method; canonical router precedence already shadows matched routes.
  Remove the duplicate handler or delegate explicitly—do not claim it is the
  active provider callback implementation.
- Direct transactional notification inserts remain in
  `stripeService.ts` (one), `instantPayoutService.ts` (multiple),
  `selfHealingSecurityEngine.ts` and `moderationDecisionService.ts`. Coordinate
  with their owners. Apply canonical **in-app** policy using the transaction's
  authoritative user read; preserve the encompassing transaction. If external
  channels are intended, enqueue transactionally and dispatch after commit;
  calling providers inside a financial/moderation transaction is not safe.
  `approvalService`, `approvalWorkflowService`, and `supportTicketService`
  already call the canonical notification service and are not absent consumers.

## Remaining external acceptance / capability blockers

- I2 automatic remote reconciliation is still **not implemented**: existing
  checkpoint IDs can identify remote objects, but an object existing does not
  prove final submission acceptance. Need authenticated provider contracts for
  correlating lost create responses and proving the intended final submission.
  Missing IDs cannot be recovered by invented lookup/status endpoints. Authorized
  operator/provider evidence is required before releasing quarantined attempts.
- I3 market-specific Spotify discovery and cross-provider fallback are not
  universal catalog completeness. Spotify simplified album-track responses do
  not guarantee ISRCs; absent identifiers remain absent. Real pagination,
  entitlement, throttling, namesake identity and large-catalog fixtures still
  need authorized provider acceptance.
- I6 no automatic retry/reconciliation of unknown publications. Real accepted-
  before-checkpoint loss, worker death, storage-merge compatibility and multi-
  replica claim tests remain necessary. Existing V1/direct provider paths are
  not certified by these V2 changes.
- I7 digest claims/receipts need the migration and scheduler patches above.
  Started rows after a crash are intentionally left for reconciliation; there
  is no unsupported receipt-lookup or indefinite Resend-idempotency assumption.
  The producer has no new caller-owned notification event identity, so repeating
  a business producer call can still enqueue distinct notifications; no
  content-based deduplication was invented. Legacy producer centralization is
  incomplete until the shared/other-owner patches above land.
- No real DB concurrency, browser, proxy, credential, SMTP/provider receipt,
  deployment or migration acceptance was performed. Digest `accepted` means
  provider queued, not delivered. No historical receipt reconciliation occurred.

## Verification

Final isolated command:

`env -i PATH="$PATH" HOME=/tmp node --test tests/closure-integrations.cjs tests/integrations-readiness.cjs tests/resume-integration-contracts.cjs tests/integration-webhooks.cjs`

**15 passed, 0 failed, 0 skipped**, exit 0. Eight new tests include actual
extracted Spotify scanner execution past ten albums/two track pages, empty/
failed catalog behavior, cursor credential boundaries, checkpoint ownership loss,
digest queue/policy/quiet-hours and unknown-send quarantine. Existing posting
execution fixture now verifies existing receipts produce no further checkpoints.
Two older standalone scripts count as file-level tests. One earlier run exposed
a missing `URL` global in the old isolated VM fixture; fixed the fixture and
reran successfully.

Seven changed/new production TypeScript files were parsed with TypeScript
`transpileModule`: zero syntax diagnostics. This is not a full semantic typecheck.
No app/workflow start, workflow/console logs, installs, secrets, network calls,
DB access, provider sends, screenshot, or live migration was performed.