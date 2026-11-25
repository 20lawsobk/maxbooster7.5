# Commerce production-readiness audit — 2026-09-19

## Blocker list

Read-only source audit of money movement, marketplace settlement, subscriptions, refunds and royalties. No application/configuration changes, provider calls, live database queries, installations or test execution. “Confirmed” means demonstrated by current source, not proof that a particular customer has suffered loss. P0 blocks exposed money movement; P1 blocks the named capability; P2 is a release-evidence gate. Prior task proposals are not evidence. These are domain findings, not certification of the entire platform.

| ID | Classification / priority | Blocker | Release scope | Confidence |
|---|---|---|---|---|
| C1 | CONFIRMED defect / P0 | Paid marketplace booking calls a nonexistent storage method; settlement also commits completion before its dependent work | All paid beat purchases | High |
| C2 | CONFIRMED defect / P0 | Authenticated refund route lacks order-owner or privileged-actor authorization | Customer refunds | High |
| C3 | CONFIRMED defect / P0 | Withdrawable balance mixes gross earnings, transfer debits and bank withdrawals; in-transit funds are not reserved | Connect seller/royalty withdrawals | High |
| C4 | CONFIRMED defect / P1 | Collaborator credits are not connected to an executable payable balance | Marketplace revenue splits | High |
| C5 | CONFIRMED defect + CAPABILITY GAP / P1 | Scheduled royalty drain reads nonexistent payable fields and “executes” payments without a provider | Automatic royalty payouts and statements | High |
| C6 | CONFIRMED defect / P0 | Refund/dispute ingestion does not reconcile the actual commerce ledger or recover seller funds | Refunds, chargebacks, external dashboard refunds | High |
| C7 | CONFIRMED defect / P1 | Plan metadata and payment-mode handling disagree across subscription producers/consumers | Existing-user upgrades, yearly/lifetime billing | High |
| C8 | CONFIRMED defect / P1 | Webhook deduplication is a non-atomic, expiring check; provider disbursement requests lack stable idempotency | Multi-worker/retry/restart payment processing | High |
| C9 | VERIFICATION GATE / P2 | No current end-to-end evidence establishes settlement and deployment invariants | Any production money release | High that evidence is insufficient; deployment state unknown |

### C1 — Buyer charged, booking cannot complete

**Entrypoint/consumer:** `POST /api/marketplace/checkout/initiate` and `/purchase` call `initiatePurchase` (`server/routes/marketplace.ts:1023-1055,1069-1099`); the signed checkout webhook inserts a pending order then calls `processPayment` (`server/routes/webhooks/stripe.ts:71-122`).

**Evidence:** `processPayment` retrieves the real order and then calls `(storage as any).updateOrder` (`server/services/marketplaceService.ts:539-540,568-593`). The actual `DatabaseStorage` exports an instance and supplies `getOrder` but no `updateOrder` implementation (`server/storage.ts:68,3658-3669`; repository symbol search finds only marketplace call sites). Thus successful payment reaches a method-not-found failure. The same missing method is used for failed-payment state and generated-license persistence (`server/services/marketplaceService.ts:573-581,995`). The service suppresses static checking (`server/services/marketplaceService.ts:1`).

**Additional settlement defects in the same boundary:** the real schema returns `amount`, not `amountCents` (`shared/schema.ts:3232-3242`), but seller transfer is gated on `dbOrder.amountCents` (`server/services/marketplaceService.ts:595-610`). Merely adding `updateOrder` would therefore still skip the automatic transfer. Completion is written before license, splits and revenue work; replay of a completed order only reconciles notifications (`server/services/marketplaceService.ts:554-559,589-665`). Split failure returns false without the caller checking it; revenue failure is swallowed. Impact: charged-but-unfulfilled sales, skipped payouts, and unrecoverable partial settlement on ordinary retries. The existing webhook correctly inserts **pending**; its historical completed-at-insert bug is not the finding.

### C2 — Cross-account refund initiation

**Entrypoint/consumer:** `POST /api/billing/refund`, authenticated but not ownership-scoped (`server/routes/billing.ts:1147-1184`). The route validates an amount and passes the caller ID plus arbitrary order ID. `stripeService.createRefund` fetches by order ID alone and checks only existence/payment linkage (`server/services/stripeService.ts:375-411`), then submits the Stripe refund (`server/services/stripeService.ts:425-438`).

**Impact:** an authenticated actor knowing another order ID can initiate a refund against it and attribute the local refund to themselves. Stripe returns money to the original payment method, not the attacker; this is unauthorized reversal/disruption, not direct refund-to-attacker theft. UUID unpredictability is not authorization. There is no owner comparison in this call chain.

### C3 — No conserved seller payable balance

**Entrypoint/consumer:** `/api/payouts/instant` calls `requestInstantPayout` (`server/routes/payouts.ts:126-143`); the royalties withdrawal path also calls it (`server/routes.ts:6498`). Calculation adds gross completed order amounts and pending/confirmed royalty amounts, subtracts only completed and pending `instant_payouts`, and labels the result USD without currency grouping (`server/services/instantPayoutService.ts:241-295`).

**Evidence/impact:** automatic transfer computes a fee-net amount and stores it in the same payout table, then sets `in_transit` (`server/services/instantPayoutService.ts:508-554`), a state excluded from reservations. For a $100 gross sale/$90 seller transfer, the formula can expose $100 while in transit and $10 after completion, although that $10 is the platform fee. Manual withdrawal again subtracts a payout while invoking `stripe.payouts.create` **on the connected account**, not funding it from the platform (`server/services/instantPayoutService.ts:698-705,735-787`). Transfer-to-connected-account and connected-account-to-bank are different legs, not two independent deductions from earnings. Unfunded royalty balances cannot be paid merely by creating a bank payout. The accounting seam imports genuine royalty earnings as pending without transferring money (`server/services/labelGridRoyaltySync.ts:139-154`); transport is outside this audit. Potential impacts include overstated availability, underpayment/double debit, payout failures, and cross-currency aggregation.

### C4 — Royalty split accrual does not become collaborator cash

**Entrypoint/consumer:** settlement invokes `distributeSplits` (`server/services/marketplaceService.ts:629`). It calculates shares from gross order amount, marks transaction rows `completed`, and increments split `pendingPayout` (`server/services/marketplaceService.ts:807-809,884-914`). The withdrawal calculator includes only pending/confirmed royalty transactions, not these completed credits or split pending balances (`server/services/instantPayoutService.ts:253-257`). Meanwhile its order component belongs wholly to the seller.

**Impact:** collaborators can see credited earnings yet have no withdrawable balance, while the seller retains gross-order availability. Split resolution reads up to twenty rows without an active/accepted filter and accepts any positive total percentage rather than enforcing a contract total (`server/services/marketplaceService.ts:832-836,848-852,864-887`). Missing recipient IDs fall back to the seller (`:888`). The standalone `royaltySplitsDispatcher` is not a production consumer of this path: repository references show only its definition/example, not a runtime dispatch caller (`server/services/royaltySplitsDispatcher.ts:15-16,372`). Do not treat that implementation as existing settlement coverage.

### C5 — Automatic payout capability is not implemented end to end

**Entrypoint/consumer:** the six-hour `payout-drain` job invokes `payoutService.processScheduledPayouts` (`server/services/autonomousJobScheduler.ts:207-212,369`). Scheduling exists; “add a cron” is not a remedy.

**Evidence:** the service sums finalized statements' `payableAmount` (`server/services/payoutService.ts:225-258`), but the actual statement schema exposes `totalEarnings`, not `payableAmount`, currency or detailed revenue fields (`shared/schema.ts:2583-2601`). `royaltyEngine.saveStatement` supplies those absent fields without mapping to `totalEarnings` (`server/services/royaltyEngine.ts:767-792`). Finalized nonempty results therefore cannot provide the intended numeric payable through this consumer. Requests are stored in a process-local map (`server/services/payoutService.ts:320-339`). `executePayment` only logs method names and waits; `processPayout` marks completion and generates a local transaction string (`server/services/payoutService.ts:358-398`). Eligibility compares balance to threshold but not the calculated due date (`:438-487`).

**Impact:** normal statements fail eligibility through invalid amounts; if that is repaired alone, scheduled jobs can issue fictional completion/receipts without moving money. There is no durable paid-statement allocation in this flow. This is both a confirmed implementation defect and a missing real payment capability, not evidence of actual bank payouts.

### C6 — Refunds and disputes are detached from settlement

**Entrypoint/consumer:** startup registers refund handlers (`server/index.ts:798`; `server/safety/index.ts:151-155`), and `/api/webhooks/stripe` dispatches verified events (`server/routes/webhooks/stripe.ts:766-783`).

**Evidence:** `charge.refunded` and `refund.created` handlers only log and return success. `refund.updated` and dispute updated/closed depend on process-local maps (`server/safety/refundHandler.ts:300-360`). Persistence writes `refund_records`/`chargeback_records`, swallowing database failures (`:247-292`), whereas the active billing service writes `refunds` (`server/services/stripeService.ts:397-411`; `shared/schema.ts:2472-2497`). Its separate `handleRefundWebhook` is not registered/called anywhere in the searched TypeScript (`server/services/stripeService.ts:554-580`). The API refund transaction writes a buyer ledger entry and notification, but no order adjustment, seller liability debit, collaborator reversal or Connect transfer reversal (`server/services/stripeService.ts:452-484`). The seller availability formula ignores refund records/ledger entries (C3). Dispute-created handling submits generic affirmative evidence derived from metadata and catches failures (`server/safety/refundHandler.ts:185-207`).

**Impact:** provider-side refunds may be acknowledged without durable settlement changes; restart loses subsequent-event correlation; seller balances remain withdrawable after reversal; dispute evidence is not established from actual service records. C2 addresses who may request a refund; this finding addresses the independent financial lifecycle after a valid refund/dispute.

### C7 — Purchased entitlements can be missing or overwritten

**Entrypoint/consumer:** `/api/billing/create-checkout-session` supports yearly/monthly subscription and lifetime payment, but writes only **session** `metadata.planId` (`server/routes/billing.ts:378-412`). The live checkout handler applies entitlement only when `mode === "subscription"` (`server/routes/webhooks/stripe.ts:236-259`): lifetime payment-mode checkout has no corresponding activation branch.

The direct subscription producer writes `metadata.planName` and lifetime PaymentIntent `planName` (`server/routes.ts:6740-6760`), while subscription created/updated handlers read `metadata.planId || "monthly"` (`server/routes/webhooks/stripe.ts:302,359`). Checkout metadata is not automatically subscription metadata; the yearly checkout can initially become yearly, then be overwritten as monthly. The live PaymentIntent success handler only checks/audits an order, not lifetime activation (`server/routes/webhooks/stripe.ts:593-641`). An alternate lifetime handler in `stripeService` does not establish coverage: no runtime caller of `stripeService.handleWebhook` was found. Subscription updates/deletes match customer only (`server/routes/webhooks/stripe.ts:364-373,427-437`), so an older subscription event can also overwrite a newer or lifetime entitlement.

**Impact:** paid lifetime upgrades lack activation in these paths; annual billing can receive monthly tier state; out-of-order/old-subscription events can revoke current access. Registration-after-payment is a separate path and is not asserted broken.

### C8 — Replay and ambiguous provider outcome are not safe

**Entrypoint/consumer:** all events through `handleWebhookEvent`; automatic transfers and manual payouts through `instantPayoutService`.

**Evidence:** processed-event lookup and marking surround, but do not atomically claim, handler execution (`server/safety/stripeWebhookSecurity.ts:171-223,253-279`). Markers expire after 24 hours and fall back to process-local memory (`:156-160,183-191`), so concurrent deliveries and later replay can execute again. A concrete non-idempotent effect is BOGO redemption increment before the entire checkout handler succeeds (`server/routes/webhooks/stripe.ts:159-175,280-284`). Transfer create has no provider idempotency key (`server/services/instantPayoutService.ts:534-545`); manual payout's options only identify the connected account (`:761-774`). Both catch blocks include local post-provider persistence/notification failures and mark the payout failed (`:547-614,776-821`), even if money was already sent. The per-user 30-second lock (`:653-659`) is not an immutable financial operation identity.

**Refund retry instance:** each HTTP attempt inserts a new refund row (`server/services/stripeService.ts:397-411`) and derives the Stripe idempotency key from that newly generated row (`:435-438`). Thus the key protects retries of one provider call, not retries of the user's refund operation. Repeating a partial-refund request can create another refund while refundable charge balance remains. A provider success followed by the local transaction failure (`:452-487`) further encourages a retry with a new row/key; the existing `reconcile_required` response does not itself enforce reuse of the original operation.

**Impact:** duplicated side effects on concurrent/replayed events, duplicate partial refunds, and additional disbursement after ambiguous outcomes. Refund remediation must durably bind authenticated actor, order and refund-operation identity before provider execution, reject changed payloads under the same identity, and reconcile ambiguous provider outcomes before authorizing another execution (also required for C6). A migration **does** add uniqueness to order payment-intent IDs (`migrations/0013_payment_intent_unique_constraint.sql:1-16`); this report does not claim that protection is absent. It does not make every downstream operation unique.

### C9 — Production settlement evidence remains a gate

Historical reports are not a substitute for tracing the current code. `reports/platform-regression-current.md:3-16` describes an isolated green unit suite, explicitly not live-provider verification. The current webhook unit test mocks `marketplaceService.processPayment` (`tests/unit/stripe-webhook-honesty.test.ts:69-72`), so it cannot expose C1. A billing lifecycle test returns early if account setup is unavailable (`tests/billing-lifecycle.test.ts:276-285`). `reports/authenticated-flow-verification.md:23` explicitly excludes checkout/purchase. Current migrations include order payment-intent uniqueness, but live application and deployment conformance were not queried.

**Required evidence:** migrations applied with schema parity; raw-body signature verification under deployed routing; real test-mode checkout through fulfillment and books; Connect account/available-balance and transfer/bank-payout distinctions; refund/dispute compensation; duplicate, restart and crash recovery; currency/rounding and reconciled statement totals. This is an unknown deployment state, not a claim of misconfigured keys, absent migrations, or failed tests.

## Repair playbooks

Each A–D is a separate complete implementation strategy, not a step of another option. Numbered steps are preparation, implementation/migration, verification and acceptance. Alternatives still must satisfy all other applicable findings. No option promises a guaranteed first attempt.

### C1 alternatives — marketplace booking

**A. Typed transactional booking plus outbox — recommended.** Best incremental fit; introduces a worker/outbox.
1. Define typed order fields and fulfillment obligations; inventory paid pending/partial orders using an approved reconciliation process.
2. Implement typed storage mutations and use canonical minor-unit conversion from `amount`; migrate settlement-state/outbox tables.
3. Commit order booking and durable license/split/transfer/revenue jobs together; mark fulfilled only after required obligations complete.
4. Test the actual storage/service chain with successful Stripe test payments and crashes at every boundary.
5. Reconcile historical obligations, verify one complete booking per payment, and release after outstanding jobs converge.

**B. Database settlement procedure.** Strong centralized invariants; more SQL ownership.
1. Specify payment verification inputs and sale/fee/split conservation invariants.
2. Migrate a typed settlement procedure that locks the order and writes ledger/revenue/job rows atomically.
3. Replace dynamic storage calls with the procedure and durable external-effect consumers.
4. Exercise concurrent settlement, invalid intent, rollback and job replay against a disposable database.
5. Backfill incomplete orders through the same procedure and accept only balanced, fulfilled results.

**C. Dedicated payment-settlement service.** Clear ownership; operationally heavier.
1. Document the checkout-to-settlement contract and identify all current callers.
2. Create a durable service with typed order repository, payment validation and settlement state machine.
3. Migrate existing pending orders and route signed payment events to its durable intake; expose fulfillment status back to marketplace.
4. Run contract and test-mode purchase/crash recovery tests across both services.
5. Compare legacy and new settlement totals, clear unmatched payments, then cut over ownership.

**D. Event-sourced sale aggregate.** Best traceability; largest data-model change.
1. Define PaymentVerified, SaleBooked, LiabilityAllocated and FulfillmentCompleted events.
2. Migrate append-only per-order streams and unique payment identities; replace unsupported repository methods.
3. Build resumable projections and idempotent license/transfer consumers; import historical sale state with provenance.
4. Rebuild projections and replay duplicate/out-of-order events under fault injection.
5. Accept when rebuilt balances and fulfillment match verified payments and a recovery rehearsal succeeds.

### C2 alternatives — refund authorization

**A. Ownership-scoped service authorization — recommended.** Smallest comprehensive fix; requires explicit refund policy.
1. Define buyer, seller-support and administrator refund permissions and eligibility windows.
2. Scope lookup by authenticated buyer ID in the service; add separately authorized privileged paths and policy checks.
3. Migrate refund actor/reason audit fields and review existing requests with mismatched buyer identity.
4. Test owner, nonowner, expired-policy and privileged requests through HTTP and direct service callers.
5. Accept only when unauthorized requests cause no provider invocation and valid requests preserve actor provenance.

**B. Approval-case workflow.** Strong review controls; slower customer refunds.
1. Define case ownership, approval roles and evidence requirements.
2. Replace direct initiation with owner-bound refund cases; require authorized approval before execution.
3. Migrate existing pending refunds into cases and bind approved cases to unique execution IDs.
4. Test cross-account case access, approval separation and replayed approvals.
5. Accept after authorized cases refund correctly and unapproved cases cannot move money.

**C. Row-level authorization boundary.** Defense in depth; database/session-context complexity.
1. Map authenticated identities and privileged roles to order/refund database policies.
2. Implement transaction-local identity context and RLS-scoped order/refund access plus service eligibility validation.
3. Migrate policies with privileged reconciliation tooling and remove unscoped application access.
4. Test HTTP and direct database/service attempts across tenants, including pooled connections.
5. Accept after no identity leaks across requests and only authorized order rows can trigger refunds.

**D. Short-lived signed refund capability.** Useful for support-assisted flows; token lifecycle overhead.
1. Define owner/policy checks for issuing single-purpose refund authorizations.
2. Issue signed, expiring capabilities binding actor, order, maximum amount and nonce.
3. Make execution verify authorization and atomically consume the nonce before a durable provider command.
4. Test forged, stolen-to-other-actor, expired, replayed and amount-modified capabilities.
5. Accept after legitimate refunds complete and every rejected capability has zero financial effect.

### C3 alternatives — conserved balances

**A. Double-entry, currency-partitioned ledger — recommended.** Broadest correctness; requires audited migration.
1. Specify gross receipts, fee revenue, collaborator/seller liabilities, connected cash and bank cash accounts.
2. Migrate integer-minor-unit journals and allocations; reconcile existing orders, transfers and payouts into opening balances.
3. Reserve liabilities atomically and book transfers/bank payouts as distinct legs, including all pending/in-transit states.
4. Test $100/$10 fee cases, royalties without funding, refunds, multi-currency and concurrent withdrawals.
5. Accept when each currency balances and withdrawable liability cannot exceed funded, unreserved entitlement.

**B. Immutable payable-allocation records.** Less machinery than a full general ledger; external GL still needed.
1. Define one net payable allocation per beneficiary and source earning.
2. Migrate allocations, reservations and funding/disbursement-leg tables; derive them from verified historical transactions.
3. Replace aggregate order sums with allocation availability and fund connected accounts before bank payout.
4. Test partial reservation, fee retention, failed transfer release and multi-currency grouping.
5. Accept once allocation totals reconcile to receipts and no allocation can be disbursed twice.

**C. Destination-charge funding model.** Provider handles the primary marketplace funding split; royalties still need explicit funding.
1. Assess Connect merchant liability, refund and platform-fee requirements with finance.
2. Implement destination charges/application fees and map provider balance transactions to net seller entitlements.
3. Migrate legacy separate transfers; implement royalty funding transfers and distinct bank-payout records.
4. Test charge/refund/payout cycles, delayed availability and mixed old/new orders in Stripe test mode.
5. Accept after local per-currency entitlement equals reconciled provider funding less true disbursements.

**D. External accounting subledger as authority.** Mature reconciliation tooling; integration cost/vendor dependency.
1. Select a ledger supporting immutable minor-unit postings, reservations and Connect cash accounts.
2. Map commerce events and migrate balanced opening liabilities with finance signoff.
3. Authorize payouts against ledger reservations, orchestrating transfer and bank legs separately.
4. Test provider timeouts, duplicate postings, currency separation and reversal handling.
5. Accept only after independently reconciled balances and recovery/export procedures pass.

### C4 alternatives — executable collaborator royalties

**A. Unified beneficiary allocations — recommended.** Reuses C3; requires split-contract migration.
1. Define eligible accepted split versions, net-of-fee basis, rounding and total-percentage rules.
2. Migrate immutable order-level beneficiary allocations with unique order/recipient/version keys.
3. Route all seller and collaborator shares to the same payable engine; retain unresolved recipients in escrow liabilities rather than seller fallback.
4. Test inactive splits, over/under totals, more than twenty recipients and concurrent replay.
5. Reconcile historic split pending totals and accept when every recipient can receive exactly their funded allocation.

**B. Direct multi-beneficiary transfers.** Fast collaborator settlement; more provider operations and reversals.
1. Require verified Connect recipients and an approved split snapshot before sale.
2. Implement one idempotent net-share transfer command per beneficiary, with held obligations for incomplete onboarding.
3. Migrate old split credits to unsettled transfer obligations and remove competing seller-only availability.
4. Test rounding, partial provider failure, refund reversals and onboarding completion.
5. Accept after transferred plus held plus fee amounts exactly equal collected receipts.

**C. Periodic royalty clearing.** Lower transaction volume; delayed collaborator cash.
1. Define settlement periods, contract acceptance and payable thresholds.
2. Accrue validated net shares into a durable clearing ledger instead of completed transactions.
3. Migrate pending split totals and create finalized beneficiary statements linked to payout allocations.
4. Test close/reopen, late sales, refunds and period reruns without duplicate accrual.
5. Accept when each statement reconciles to sales and its paid amount matches actual provider settlement.

**D. Contract escrow and release service.** Handles disputed/unresolved rights; adds operations.
1. Define contract approval and beneficiary-verification prerequisites for release.
2. Implement order-funded escrow liabilities and versioned split release instructions.
3. Migrate unresolved/miscredited historical shares into auditable escrow cases.
4. Test missing recipients, disputed percentages, multi-party approvals and partial release recovery.
5. Accept after all releases conserve funds and beneficiaries receive provider-confirmed payments.

### C5 alternatives — genuine scheduled payouts

**A. Consolidate onto a corrected payable engine — recommended.** Avoids parallel financial systems; depends on C3/C4.
1. Specify statement payable fields, due-date rules and supported real payment methods.
2. Migrate statement schema and integer payable allocations, reconciling `totalEarnings` against source transactions.
3. Replace process-local scheduler requests/log-only execution with durable commands to the corrected payout engine.
4. Test schedule due dates, thresholds, worker restart, provider failure and receipt provenance.
5. Accept when scheduled statements become paid only through confirmed provider transactions and no payable remains NaN.

**B. Complete a dedicated royalty payout service.** Preserves separation; duplicates operational responsibilities.
1. Define supported banking/Stripe/PayPal contracts and durable request states.
2. Migrate payout requests, receipts, statement allocations and complete statement amounts/currencies.
3. Implement real provider adapters, idempotent execution and reconciliation workers instead of the logging switch.
4. Test each advertised method end to end, including due dates and restart recovery.
5. Accept per method only after provider-confirmed payouts and paid-statement totals reconcile.

**C. Controlled bank batch settlement.** Practical for periodic royalties; bank approval latency.
1. Agree a bank-supported payment-file/API format, authorized approvers and settlement timetable.
2. Migrate payable statements and durable batch/member identities.
3. Generate authorized payment instructions, ingest bank acknowledgments/returns, and allocate actual settlement to statements.
4. Test rejected files, duplicate submissions, partial returns and period reruns in the bank's certification environment.
5. Accept after a reconciled settlement rehearsal; receipts reference bank confirmations, never local random IDs.

**D. Managed payables provider.** Broad methods/compliance support; commercial and integration overhead.
1. Select a regulated payout provider and validate supported countries, currencies and beneficiary onboarding.
2. Migrate statements and beneficiaries with independently reconciled payable opening amounts.
3. Integrate scheduled payable submission, durable callbacks and statement-linked settlement records.
4. Test provider sandbox payouts, withholding inputs, failures, deadlines and duplicate callbacks.
5. Accept after reconciliation and operational escalation drills demonstrate real delivery for each enabled method.

### C6 alternatives — refund/dispute financial lifecycle

**A. Unified compensation state machine — recommended.** Most direct fit; requires careful historical reconciliation.
1. Define refund/dispute states, seller/collaborator clawback rules and evidence requirements.
2. Migrate provider-unique records plus durable actor/order/refund-operation identities into the commerce schema, including external dashboard refunds.
3. Reuse each operation on HTTP retry, reject payload changes and reconcile ambiguous outcomes before execution; register durable upserts, compensate liabilities/transfers, and create evidence from actual order/license/delivery records with accountable approval.
4. Test duplicate partial-refund requests, provider success followed by DB failure, pending-to-failed transitions, restart, disputes and already-paid sellers.
5. Accept when provider net receipts equal local net liabilities and every unresolved recovery has an owned case.

**B. Provider balance-transaction reconciliation authority.** Catches missing webhooks; settlement latency.
1. Define mappings from Stripe refund/dispute/balance transactions to original orders and transfers.
2. Migrate unique provider transaction identities, a reconciliation cursor and durable actor/order/refund-operation identities reused across HTTP retries with immutable request payloads.
3. Poll/import authoritative financial changes, reconcile ambiguous refund outcomes before another execution, and compensate liabilities/transfers; replace generic affirmative dispute evidence with actual order/license/delivery records requiring accountable approval.
4. Test missed events, duplicate partial-refund requests, post-provider DB failures, fee adjustments, replayed imports and evidence approval.
5. Accept after reconciliation detects and repairs all seeded gaps without fabricated dispute evidence.

**C. Event-sourced reversal aggregate.** Strong auditability; greater redesign.
1. Define refund requested/accepted/settled and dispute opened/won/lost events linked to sale allocations.
2. Migrate durable streams and deduplicated intake; bind each refund aggregate to actor/order/refund-operation identity, reusing it on HTTP retry and rejecting changed payloads.
3. Build compensation projections and reversal commands with ambiguous-outcome reconciliation before reexecution; replace generic affirmative dispute evidence with actual order/license/delivery records requiring accountable approval.
4. Replay lifecycle permutations, duplicate partial-refund HTTP requests, provider-success/DB-failure boundaries, restarts and already-disbursed collaborator cases.
5. Accept when rebuilt balances match provider state and all reversal commands terminate or enter accountable exception queues.

**D. Operational case management with durable financial execution.** Human judgment for disputes; staffing requirement.
1. Define service-level deadlines, authorized case ownership and evidence review rules.
2. Persist every provider refund/dispute into an order-linked case; bind durable actor/order/refund-operation identities to execution requests rather than HTTP attempts.
3. Reuse immutable operation requests on retry, reject payload changes and reconcile ambiguous outcomes before approved ledger/provider reversals; require accountable approval of actual order/license/delivery evidence.
4. Test restart, duplicate partial-refund requests, provider-success/DB-failure outcomes, outside-dashboard refunds, deadlines and concurrent case actions.
5. Accept after a complete refund/dispute drill reconciles money and produces reviewed, factual evidence.

### C7 alternatives — subscription entitlement integrity

**A. Canonical billing contract and entitlement resolver — recommended.** Least migration risk; must normalize old subscriptions.
1. Specify canonical plan identifiers, price mappings and lifetime precedence.
2. Persist purchase/subscription identities and migrate existing `planName`/`planId` associations.
3. Write consistent subscription metadata, handle paid lifetime events, and scope updates/deletes to the active subscription.
4. Test all checkout producers, yearly/lifetime upgrades and reordered old-subscription events.
5. Reconcile purchased products to entitlements and accept only when every paid path grants the intended access.

**B. Price-ID-driven entitlements.** Avoids metadata dependence; catalogue versioning required.
1. Inventory approved Stripe prices and define explicit entitlement mappings.
2. Migrate a versioned price catalogue and link existing purchases/subscriptions.
3. Resolve verified session line items/subscription prices for activation, with lifetime purchase receipts and active-subscription guards.
4. Test metadata absence, retired prices, annual plans and stale deletion events.
5. Accept after catalogue reconciliation proves every supported product maps to one correct entitlement.

**C. Durable billing purchase aggregate.** Clean lifecycle ownership; more application state.
1. Define intended plan, purchase owner and completion/cancellation transitions.
2. Create purchase records before all Stripe checkout/PaymentIntent operations and migrate legacy identities.
3. Link provider events to the aggregate and derive entitlement from settled purchase/subscription state.
4. Test missing metadata, interrupted redirects, duplicate payments and subscription replacement.
5. Accept after replay reconstructs correct access without relying on the browser success page.

**D. Provider-backed entitlement synchronizer.** Robust against missed events; provider dependency and latency.
1. Define authoritative product/price resolution and lifetime purchase evidence.
2. Migrate local entitlement snapshots with source subscription/purchase identity and version.
3. Make events enqueue a refresh of current provider state; reconcile periodically rather than applying stale event payloads directly.
4. Test delayed/deleted/reordered events and provider outages with retained last-verified state.
5. Accept after periodic and event-driven refresh agree for monthly, yearly, lifetime and replacement subscriptions.

### C8 alternatives — idempotent execution

**A. PostgreSQL inbox/outbox with stable operation IDs — recommended.** Fits existing database; worker lifecycle needed.
1. Define durable event, sale, promotion-redemption and disbursement identities, including actor/order/refund-operation identity reused across HTTP attempts and immutable payload validation.
2. Migrate unique inbox/effect/command rows and classify ambiguous historical provider outcomes.
3. Atomically claim local effects; use command IDs as Stripe idempotency keys and reconcile before retrying unknown outcomes.
4. Test simultaneous deliveries, events beyond 24 hours, duplicate partial-refund requests, changed payload rejection, lost responses and DB failure after provider success.
5. Accept when each business effect occurs once and ambiguous operations resolve without duplicate refunds or transfers.

**B. Durable workflow engine.** Built-in recovery; extra infrastructure.
1. Model checkout, payout and refund workflows with business-unique IDs; persist actor/order/refund-operation identity and immutable payloads so HTTP retries resume the original workflow.
2. Migrate pending events/commands and durable workflow histories.
3. Implement idempotent activities with provider keys, persistent effect dedupe and explicit unknown-result reconciliation.
4. Kill workers around every external activity; replay concurrent events, promotion updates and partial-refund requests, including changed payloads and DB failure after provider success.
5. Accept after recovered workflows preserve one effect per business identity and complete all obligations.

**C. Database-native financial command executor.** Minimal queue infrastructure; SQL locking complexity.
1. Define command states, payload hashes and reconciliation timeouts; bind durable actor/order/refund-operation identity before execution and reuse it across HTTP retries.
2. Migrate unique command/effect tables and per-entity locking procedures.
3. Execute claimable commands with provider idempotency keys; persist outcomes separately from notifications and reconcile ambiguous provider outcomes before reexecution.
4. Test lock expiry, process death, payload mismatch, duplicate webhooks/partial-refund requests and provider-success/DB-failure boundaries across workers.
5. Accept after no failed notification changes a successful disbursement into retryable money movement.

**D. Dedicated payment gateway service.** Centralizes policy for all callers; service migration overhead.
1. Inventory every refund/transfer/payout producer; require durable actor/order/refund-operation identity and immutable payload validation in the gateway protocol, reused across HTTP retries.
2. Migrate provider-operation identities and durable event/effect intake to the gateway.
3. Route all producers through idempotent commands and return pending/unknown states until reconciliation confirms outcome.
4. Test cross-caller duplicate commands, repeated partial-refund HTTP requests, changed payloads, provider timeouts, post-provider DB failure and gateway restart with independent effect replay.
5. Accept after no application path can bypass operation identity or duplicate promotion/ledger/provider effects.

### C9 alternatives — release verification

**A. Disposable integration environment and Stripe test mode — recommended.** Reproducible; cannot certify live banking availability.
1. Define release assertions and isolate non-production identities, database and provider accounts.
2. Apply the real migration chain and deploy the same routing/worker configuration without copying secret values into reports.
3. Run actual checkout, split, transfer, payout, refund and entitlement flows through production code paths.
4. Inject concurrency, restart and provider-response loss; reconcile resulting rows and provider test transactions.
5. Accept with signed evidence of balances, schema parity and recovery; retain separate live-account onboarding approval.

**B. Dedicated staging payment certification environment.** Close deployment fidelity; ongoing cost.
1. Establish staging ownership, isolated provider accounts and evidence-retention policy.
2. Deploy candidate artifacts and production-equivalent routing, storage, queue and migration procedures.
3. Execute scenario-driven test-mode financial journeys with real database writes and provider objects.
4. Exercise deployment rollback and webhook replay, checking every financial invariant independently.
5. Accept only an artifact/configuration pair with reviewed evidence and a production readiness checklist.

**C. Finance-led release reconciliation drill.** Strong accounting scrutiny; more manual effort.
1. Agree a finite matrix of purchases, fees, splits, currencies, reversals and failure points.
2. Prepare a fresh isolated deployment and preapproved expected journal/entitlement outcomes.
3. Have operators execute real test-mode transactions while finance independently calculates expected settlement.
4. Compare provider exports, application rows and statement/receipt outputs; replay exceptions to completion.
5. Accept when discrepancies are closed and operators demonstrate recovery without database guesswork.

**D. Independent payment certification engagement.** External challenge; cost and lead time.
1. Define scope, access boundaries, privacy rules and required evidence with a payment specialist.
2. Supply a representative isolated deployment, migration history and provider test access through secure channels.
3. Require actual application-to-provider lifecycle exercises, not mocked service-only tests.
4. Have the reviewer challenge authorization, failure recovery, idempotency, conservation and deployment assumptions.
5. Accept after findings are remediated and rechecked, with production account/network prerequisites separately approved.

## Examined-surface inventory and unexamined boundaries

**Examined in depth:** marketplace checkout routes and settlement chain; exported storage implementation; order/royalty/refund/statement schema excerpts; signed Stripe webhook registration, handler behavior and dedupe; seller balance calculation, automatic transfers and manual payouts; royalty split accrual and dispatcher reachability; refund API authorization, local/provider lifecycle and dispute handlers; scheduler-to-payout-service call chain; subscription checkout metadata and entitlement consumers. Searched current migrations for order-intent uniqueness and refund-table references. Examined royalty statement serialization and the LabelGrid accounting write seam only, not provider transport.

**Historical evidence checked:** current production-readiness/regression reports and authenticated-flow exclusions were compared with the current implementation rather than accepted as proofs. Proposed beat-booking, auto-drain and rate-seeding tasks were not treated as defects: pending insertion and the drain schedule are already present. The platform-rate seed exists (`server/seed/platformRoyaltyRates.ts` and initialization references); no “rates absent” finding is made without database evidence.

**Targeted/search-only, not exhaustive certification:** royalty calculation/FX/recoupment logic, enhanced split transfers, payout risk/tax logic, membership/storefront checkout branches, payment bypass, all marketplace licensing combinations, downstream downloads and full migration history. Existing tests were read selectively, not executed. No claim is made that unused alternative services cover active production paths.

**Unexamined:** live data/schema/migration application, balances or actual losses; Stripe keys/account settings/event subscriptions/API availability; regulatory/tax/legal sufficiency; real banking delivery, chargeback outcomes and provider reserves; LabelGrid/TooLost transport; infrastructure logs and running UI. No secrets or customer data were read. A UI screenshot would not verify these accounting invariants and was not taken; this audit produced only this report. Parent platform audit must cover domains outside money and decide the final release boundary.