# SEC-04 — bounded erasure workflow execution

## Result

**Source: partial; production acceptance: blocked.** Re-read the original SEC-04
recommended durable-saga playbook, remaining-gap instructions, closure inventory,
and security implementation notes. No approved retention matrix, complete subject
inventory, hold authority, backup suppression contract or authorized processor
adapters were provided. Therefore no deletion, worker scheduling, live DB/provider
connection, application startup or migration application was performed. This is
not a completed erasure feature.

## Implemented

- `accountErasureRequests.ts`: preserve atomic request/session-epoch revocation;
  cancelled/reopened requests now receive a distinct UUID cycle and clear stale
  policy/completion metadata. Repeated active requests preserve the cycle/date.
  Cancellation remains limited to `pending_policy`.
- `accountErasureHandlers.ts` and existing route: isolated real handlers with
  injected storage/password/queue boundaries. Caller identity is never accepted
  from the body; missing bodies do not throw; passwordless requests require the
  existing owner-bound, recent, nonfuture OAuth stamp. Existing router MFA/auth
  middleware is retained. Request acknowledgment follows durable revocation and
  session destruction; failures propagate rather than returning success.
- `accountErasureWorkflow.ts`: explicit approved-policy/inventory gate; expired
  approval, unknown/missing systems, retention, legal holds, incomplete inventory,
  or absent write fence block attempts. There is **no default authority** and no
  production adapter. Recheck after claiming; adapters must also enforce holds at
  their mutation boundary (a boolean snapshot cannot eliminate that race).
- Real parameterized SQL repository stages per-system inventory/policy/approval
  references; atomically claims with request locking and epoch revocation;
  uses expiring fenced leases, retry timestamps, stable request/system
  idempotency keys, and verified receipt acknowledgments. Claim requires an exact
  staged inventory and matching policy/approval. Stale receipts cannot acknowledge
  another lease. Receipt-persistence/provider failures remain failures and
  eligible for reconciliation, never successful erasure.
- `0024_account_erasure_workflow.sql`: **authored, not applied**. Adds request-cycle
  identity and durable step evidence (reviewer/reference, attempts, receipts,
  timestamps). Evidence survives cancellation/reopening. Receipt rows are not
  attached by FK to the deletable users row.
- Deliberately **no completion transition**. Per-system acknowledgments alone
  cannot prove absent residual data, backup expiration or restore suppression.
  No old destructive row-delete service was activated.

## Isolated evidence

- `node --import tsx --test server/services/accountErasureWorkflow.test.ts server/services/securityAuthority.test.ts`:
  **19/19 passed**, including 11 new tests.
- `node --test tests/unit/client-auth-beta-contracts.test.mjs`: **5/5 passed**.
- TypeScript compiler API strict/no-emit check of the three erasure services, new
  test and canonical Express declarations, with existing shared alias mapping:
  **zero diagnostics**, including transitive dependencies.
- Tests execute real handlers, workflow and repository methods with injected
  authority/provider/query boundaries. Cover authentication/owner isolation,
  OAuth expiry/future/wrong owner, no-body denial, DB/session failures, hold during
  claim, unknown/incomplete adapters, provider ambiguity, unverified/lost receipt,
  lease loss, retry-persistence failure, policy expiry and request cycle SQL.
  SQL assertions are **not** PostgreSQL transaction/concurrency/migration proof.
  Provider responses and policy approval in these tests are explicitly fixtures.

## Exact integration and release requirements

1. Review/rehearse/apply migration `0024_account_erasure_workflow.sql` **after
   `0020_security_authority.sql` and before deploying the changed request service**.
   It requires `gen_random_uuid()` support. No shared schema/index/journal/bootstrap
   file was edited. Reconcile the new columns/tables with the authoritative schema
   and migration runner; preserve evidence across subsequent schema pushes.
2. Obtain approved policy and an immutable approval-reference authority binding
   subject + request cycle + inventory version + reviewer. Existing 30-day queue
   delay was preserved for compatibility; it is **not** proof of lawful retention
   or authority to delete. Define financial/contracts/royalties exceptions, holds,
   evidence retention and final public status semantics.
3. Supply/backfill a complete ownership inventory: all relational and non-FK rows
   (including analytics), objects/versions, processor copies, session/JWT/API
   credentials, caches/search/derived copies, logs and backups. Define ordering
   and dependencies before implementing destructive adapters; do not infer that
   `users` cascades or `storageService.deleteFile` cover these systems.
4. Implement a durable write fence across **all** mutating/auth/refresh/background
   consumers; the existing epoch increment revokes previously issued sessions but
   does not alone prevent new login, token issuance or racing writes. The workflow
   requires authoritative `writesFenced` proof and repeats revocation at claim.
5. Only then bind `createErasureWorkflowRepository(pool)` to
   `createErasureWorkflow(repository, authority, adapters)`. Implement `review`
   from trusted operator-approved state and `verifyReceipt` from real
   subject/system/inventory-specific processor evidence. Do not expose approvals
   through an untrusted request body. Each adapter must reconcile ambiguous
   outcomes and honor the stable idempotency key under overlapping expired leases;
   adapters without this capability must remain unregistered. No scheduler or
   admin mutation route was added intentionally.
6. Add approved residual-resource reconciliation, retained-exception reporting,
   backup-expiration/restore-time suppression evidence and minimal immutable
   final audit before implementing any `completed` transition. Requests otherwise
   remain pending/processing honestly, even if every step has an acknowledgment.
7. Rehearse real PostgreSQL competing claims/cancel/reopen, restart/lost-ACK and
   outage behavior; verify actual provider sandbox receipts, complete seeded
   subject residuals, racing writes, federated/MFA/CSRF and credential revocation
   through deployed HTTP. These acceptance gates remain unverified.

## Follow-up: schema integration and isolated PostgreSQL evidence

The subsequent explicit assignment authorized a local-only PostgreSQL rehearsal.
It did **not** authorize live migration application or erasure/provider execution.
The earlier no-DB evidence above describes the first implementation pass.

- Verified actual schema filename: `shared/readiness-schema.ts`. Added exact
  structural declarations for the 0024 request-cycle column/unique index and
  erasure-step columns, primary key, checks and retry index.
- Added digest declaration and `0025_integration_notification_digest.sql` using
  the exact DDL from `closure-integrations.md`, including named partial indexes,
  frequency/state checks and cascading user FK. No notification retention policy
  or erasure adapter was invented.
- Updated `scripts/readiness-isolated-rehearsal.mjs` to write timestamped,
  exclusive-create snapshot artifacts instead of replacing earlier
  `migration-rehearsal.md` / `resume-schema.md`. Added
  `scripts/readiness-isolated-erasure.ts` to exercise the real repositories.
- Command: `env -i PATH="$PATH" HOME=/tmp node scripts/readiness-isolated-rehearsal.mjs`.
  **PASS, zero failures**, PostgreSQL **16.10**, private temporary Unix socket,
  no TCP listener; explicit synthetic role/password. Only temporary local
  databases were connected. Cluster stopped and temporary files removed.
- New snapshot:
  `migration-rehearsal-2026-09-22T01-50-40-656Z.md`. All **14** enumerated additive
  migrations applied locally; **304** total public tables. Structural parity for
  all **31** readiness tables matched **234 column**, **84 constraint**, and
  **57 index** records, including names/definitions/defaults/nullability.
- Seven new real-PostgreSQL checks passed: request/revocation atomic rollback;
  eight concurrent duplicate requests preserve cycle/date and all revocations;
  eight competing claims produce exactly one owner; retry and expired-lease
  reclaim reject stale receipts; exact inventory/approval/not-before fencing;
  deterministic lock-barrier tests for both claim-first and cancel-first races,
  with reopen isolating old inventory; invalid erasure receipt/status and digest
  frequency/state/FK rejection. Existing epoch/factor, commerce, backup fencing
  and reconnect/deduplication checks also passed.

This supersedes the earlier **SQL-mock-only** limitation for these exact tested
repository statements and fresh-schema parity. It does not prove live upgrade
compatibility, legacy backfill, process-restart/lost-provider-ACK behavior, full
HTTP authorization, write-fence coverage, backups/restore suppression, provider
delivery or complete erasure. Migration application to shared/live DB remains
blocked. Production authority/adapters/finalization remain intentionally absent.