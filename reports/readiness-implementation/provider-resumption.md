# Provider/reconciliation resumption

## Scope and safety

Resumed the original I1/I2/I3/I9 provider and reconciliation review after
checking the current closure/handoff reports and the prior Too Lost entrypoint
work. Too Lost remains the current provider; LabelGrid remains historical only.
No workflow or application was started. No live database, provider, credential,
money, payout, submission, deletion, or external write was used.

## Source defects repaired

### Too Lost read and reconciliation truthfulness

- Provider/API failures from release analytics now fail explicitly instead of
  becoming a zero-stream/zero-revenue result. An outage can no longer erase the
  distinction between “no earnings” and “earnings unavailable.”
- Catalog transport failures and malformed catalog envelopes now fail explicitly
  instead of appearing to be a successful empty catalog.
- Release-detail reads no longer use the synchronous connection-cache advisory
  as an authority. They use the durable connection-loading path; only an actual
  provider 404 maps to `null`, while connection/transport failures remain errors.
- Unknown release and outlet status values now remain `unknown`; they are no
  longer relabelled `processing`. A failed post-submit status lookup similarly
  reports unknown outlet evidence rather than invented processing evidence.
  The distribution consumer now persists that outcome as pending/indeterminate
  with the remote release ID, rather than rejected/failed, and both status
  endpoints can perform a real Too Lost GET reconciliation without replaying
  the submission.
- Live outlet evidence remains `live` through the shared dispatch mapper rather
  than being downgraded to `delivered`.
- A successful remote submission can no longer become a provider rejection when
  one or every local dispatch write fails. The release remains pending and
  indeterminate, retains the Too Lost release ID, and the durable submission
  record remains the replay guard.
- Both per-release analytics routes now call Too Lost analytics for Too Lost
  release IDs. They preserve ownership checks and response DTOs, do not fall
  back to an empty local ledger after provider failure, and reject unqualified
  currency/accounting-period data rather than fabricating zero.
- Platform-specific Too Lost submission routes now map unknown evidence to
  pending/indeterminate, retain the remote ID, and no longer claim acceptance.
- Failed status refreshes now return a real failure response and only expose a
  previously persisted check time; they do not fabricate a successful fresh
  check.
- OAuth refresh now rejects a successful HTTP response that contains no usable
  access token instead of persisting/sending an undefined bearer token.
- Royalty summary reconciliation now requires one identified currency, rejects
  cross-currency aggregation without authoritative conversion data, rejects
  malformed numeric values, accepts legitimate negative revenue adjustments,
  and no longer defaults an unidentified currency to USD. Currency values are
  trimmed and uppercased; channel analytics also reject mixed currencies and
  invalid/negative count fields while preserving negative revenue corrections.
- Unknown royalty envelopes can no longer become fabricated zero-dollar
  summaries. Zero is returned only for a recognized empty row/list shape or an
  explicit finite summary total.

### Retired LabelGrid automation

The startup-visible LabelGrid royalty service no longer schedules boot-time or
daily reads from the retired provider and no longer performs automatic legacy
ledger writes. Its explicit historical reconciliation function is retained for
separately authorized operator use, preserving historical support without
treating LabelGrid as the active readiness target.

A Too Lost ledger writer was deliberately not substituted. The inspected
contract does not establish the closed accounting period, per-release currency,
or payout receipt/authority needed to turn current sales responses into payable
ledger entries safely.

## Focused evidence

- `npx vitest run tests/unit/toolost-release-transport.test.ts tests/unit/distribution-toolost-submission.test.ts`
  — 2 files, 29 tests passed. Resumption verification also included
  `tests/unit/legacy-labelgrid-royalty-sync.test.ts`: 3 files, 30 tests passed.
- The focused tests use mocked provider/storage boundaries and verify outage vs
  zero behavior, malformed catalog rejection, durable connection loading,
  unknown-status preservation after a successful POST and failed GET,
  pending/indeterminate consumer mapping, local dispatch persistence failure
  branches, live-status preservation, existing submission choreography,
  malformed analytics/royalty numbers, negative adjustment semantics,
  multi-currency refusal, normalized currencies, malformed unknown envelopes,
  and legitimate empty analytics/royalty rows.
- `npm run check:server` — passed.

## Remaining blockers

- No authorized Too Lost sandbox connection or provider response fixtures were
  available, so current response shapes, scopes, pagination/completeness,
  statuses, and delivery receipts still need authorized sandbox acceptance.
- The release list currently requests a bounded provider page. No confirmed
  Too Lost pagination contract was found in the inspected source evidence, so
  exhaustive catalog support was not invented. Full-catalog reconciliation
  remains blocked on that authoritative contract.
- Too Lost exposes no confirmed payout-request API or official
  royalty-statement endpoint. Payout execution, statement reconciliation,
  account ownership/entitlement, and provider receipts remain I9 blockers.
- Too Lost sales data cannot safely fund the local royalty/payables ledger until
  authoritative period identity, currency semantics, correction/reversal rules,
  and duplicate-safe receipt keys are established. Explicit unavailability is
  not claimed as capability completion.
- Existing unknown distribution attempts still require provider/operator
  reconciliation, but the authorized status-refresh path now performs the real
  remote GET when a Too Lost release ID is present. No blind replay or
  fabricated remote lookup was added.
- The startup comment now accurately identifies the imported LabelGrid service
  as historical and its start method as an intentional no-op.

Decision remains **NOT READY** for provider/reconciliation acceptance.