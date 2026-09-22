# Independent readiness review — current source snapshot

Read-only review of implementation and real consumers, except this report. This is an interim review of a changing working tree, not release approval. No tests, compiler, installs, app startup, database, or provider calls were performed. Implementation reports were consulted for scope/claims, not accepted as validation.

## Actionable findings before existing features can run

### P1 — Browser payout consumer cannot submit the new durable payout contract

- `client/src/components/marketplace/PayoutDashboard.tsx:119–124` calls `/api/payouts/instant` with `{amount, currency}` and no idempotency key.
- `server/routes/payouts.ts:152–162` consumes `amountCents` from its schema and passes only `req.get("Idempotency-Key")` to the service.
- `server/services/commerce/payouts.ts:5–6` unconditionally rejects a missing key. `client/src/lib/queryClient.ts:384–407` does not generate or forward such a key.
- Consequently even correcting the amount field alone cannot restore this actual browser withdrawal path. Supply minor units and a stable per-intent key, retain it through retries, and deliberately start a new intent only after disposition. Validate the real browser-to-route contract, not only repository calls with injected keys.

### P1 — Signed SendGrid delivery never reaches the new governance exemption

- The actual mounted route is `/webhooks/sendgrid` (`server/routes.ts:7452–7454`); `server/middleware/governanceBoundary.ts` explicitly verifies/exempts that exact path.
- Global CSRF is mounted first (`server/index.ts:783`, before `registerRoutes` at 1100). `server/middleware/csrf.ts:134–183` exempts `/api/sendgrid/webhook` and `/api/webhooks/`, but not `/webhooks/sendgrid`.
- A normal signed provider request has neither a browser cookie nor matching CSRF token and is rejected at `csrf.ts:34–45`, before signature verification or event handling. This also blocks the fan-mail delivery tracking integration. Add an exact provider-route CSRF exemption while retaining mandatory signature validation; validate the mounted middleware chain.

### P1 — Ledger cutover silently presents old earned balances and payout history as absent

- `server/services/payoutService.ts:228–237` now reads only `commerceRepository.balance`; old calculation is stranded as `legacyCalculateAvailableBalance`.
- `server/services/instantPayoutService.ts:1152–1161` returns only new commerce operations; its previous `instant_payouts` reader is private/dead at 1164–1174. Likewise `payoutService.ts:440–446` reads only new operations.
- `migrations/0023_commerce_settlement.sql` explicitly provides no historical backfill or opening balances. A successful additive migration therefore does not preserve those existing customer-facing views.
- Not a request to infer cash or automatically import unverified balances: retain historical read-only history and expose an explicit legacy-reconciliation state for excluded earnings. Gate the cutover per account or supply an approved reconciliation/import path. Returning ordinary empty history/zero availability hides existing obligations and is not an adequate migration-pending indication.

### P1 — Existing payout report omits every new commerce payout

- The live report route calls `instantPayoutService.generatePayoutReport` (`server/routes/payouts.ts:659`).
- That method still selects exclusively from `instant_payouts` (`server/services/instantPayoutService.ts:1017–1044`), whereas the replacement `requestCommercePayout` reserves/executes `commerce_operations` and the replacement history reader returns those operations.
- New completed withdrawals therefore appear in history but not in report totals/export data. Move this consumer to the canonical ledger/operations with currency-aware amounts, and include explicitly separated legacy records without double counting. This is distinct from the missing historical cutover above: it affects newly created payouts too.

### P2 — “Instant / minutes / T+0” UI now initiates standard bank payouts

- `server/services/commerce/provider.ts:36–39` hard-codes `method:"standard"`.
- The actual UI still advertises instant/T+0 withdrawals and arrival in minutes (`client/src/components/marketplace/PayoutDashboard.tsx:226,239,379,444–445`).
- Either restore an explicitly capability-checked instant product, or relabel the route/UI and show truthful provider arrival/status information. Do not present standard queued bank settlement as instant fulfillment.

## Source checks and limits

- The previously reported ledger DELETE defect is **not reflagged**: current `0023_commerce_settlement.sql` adds BEFORE UPDATE/DELETE rejection triggers on entries and journals. This is source confirmation, not a rerun of the failed rehearsal.
- Inspected authoritative session middleware, assurance markers, governance composition, MFA challenge handler, social credential envelope/read adapter, commerce reservation/provider recovery, actual payout scheduler callsite, and catalog-worker claim/heartbeat lifecycle. Their existence is not evidence that all end-to-end auth, crash recovery, or multi-pod races pass.
- Social v1 credentials use AES-GCM with account/platform/purpose AAD and an external key; missing operator keys are not classified here as code defects. Legacy credential conversion, stale-cookie/JWT rollout, and old-data upgrades remain unvalidated.
- Catalog jobs use database claims/owner fencing and the readiness scheduler drains active work. No duplicate-provider-effect or lease-loss runtime proof was performed.
- Reports/rehearsal describe a fresh-schema rehearsal, not an upgrade of realistic legacy data. No claim here that unapplied migrations themselves are defects, nor that the migration set is deployment-approved.
- UI/offline, webhook and commerce files remain under active edits. Recheck the precise consumers above against the final working tree. This review does not certify the entire large diff or treat mocked isolated passes as application readiness.