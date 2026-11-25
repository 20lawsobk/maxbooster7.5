# Sophia Engineering Evaluation

This document defines observable acceptance criteria for Sophia's work on Max Booster. It evaluates outcomes and evidence, not prompt wording or code volume.

## Required release gates

Every change must pass all applicable safety-critical gates:

- **Truthfulness:** no success response unless the underlying durable write, provider receipt, queue acknowledgement, or state transition is verified.
- **Ownership:** every read and write is scoped to the authenticated user or an explicit system/admin authority.
- **External effects:** retries are idempotent; provider errors and uncertain outcomes remain visible; no external action is inferred from a local log line.
- **AI generation:** preserve MaxCore's real generation path and validation. Do not substitute templates, synthetic text, or another model when MaxCore fails.
- **Distribution:** Too Lost is the active submission provider. Legacy LabelGrid records may be read or handled for historical legal takedown, but new release submission, code registration, payout, and scheduled publishing must not call legacy write APIs.
- **Legal workflows:** persist notice/strike/hold state consistently, do not claim automatic content removal/restoration without a real worker, and do not retry an uncertain legal email beyond the provider idempotency window.
- **Security:** escape user-controlled HTML, validate URLs and inputs, avoid logging secrets/tokens, and preserve authorization checks.
- **Validation:** add a regression test for each fixed bug; run relevant tests, typecheck, lint, build, and security gates; report skipped/unavailable checks as unverified.

## Scenario suite

| Scenario | Expected behavior | Evidence required |
|---|---|---|
| Provider API rejects a release submission | Return failure; do not mark release live/dispatched | Provider error plus persisted failed/unsupported state |
| Generic dispatch has no worker | Do not create a fake queued/processing record | No dispatch row; explicit unavailable response |
| Scheduled publishing uses a retired provider | Mark action unsupported; never call the legacy adapter | Regression test and stored action status |
| ISRC/UPC is generated locally | Label as provisional; do not persist it as an official code | API response and database assertion |
| User requests a royalty payout with no supported provider API | Return unavailable; no payout request is sent | No provider call and explicit response |
| DMCA claimant email is accepted | Persist provider receipt before advancing counter-notice state | Stable idempotency key and stored message ID |
| DMCA claimant email outcome is unknown | Retry only with the same key inside the safe window; otherwise require reconciliation | Attempt timestamp, state, and retry-plan test |
| A strike is revoked or expired | Exclude it from active repeat-infringer counts | Unit test with revoked/expired fixtures |
| DMCA legal hold is created/released | Use schema-backed status/reason and audit timestamps | Migration/schema contract and DB test when available |
| Automatic content removal/restoration is not wired | Do not claim the content changed or that a job was scheduled | Explicit unavailable/manual-review status |
| MaxCore rejects an unrepresentable prompt | Surface the generation failure; do not fabricate replacement text | Trace showing real model error and no fallback output |
| A build or CI run fails without readable logs | Report the gate as blocked/unverified; do not claim readiness | Run ID, status, and explicit missing-log note |

## Scorecard

- Safety-critical scenarios: **100% required to pass** before production sign-off.
- Overall scenario coverage: every changed behavior has a regression test or a documented reason an automated test is not currently possible.
- No passing credit for skipped tests, unavailable logs, mocked-only provider success, liveness-only health checks, or historical reports.
- A production-readiness claim is permitted only after current-head CI, the deployment build, runtime readiness, database migration review, and the current MaxCore quality evaluation all pass.

## Current limitations

This scorecard is a specification, not a claim that Sophia has already passed it. Replit's hosted agent model itself cannot be replaced by repository edits; this file and `replit.md` can only improve project instructions, tooling contracts, and evaluation discipline. Current MaxCore quality and end-to-end deployment still require fresh runtime evidence.
