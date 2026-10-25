# Commerce case index

These are the individual JUnit leaf cases from the latest complete local run.
Run each containing file using the instructions in [commerce.md](commerce.md).
The XML files retain exact case outcomes and timing. Do not sum the earlier diagnostic attempt into these totals.

## tests/payment-processing/beat-loop-lifecycle-postgres.test.mjs

`python3 scripts/testing/run-commerce.py --only beat-loop-lifecycle-postgres.test`

- PASSED: concurrent initialization creates exactly one paused state row
- PASSED: generates decoded audio, a shorter private preview, awareness artwork, atomic listing and royalty ownership
- PASSED: a second replica cannot run or orphan an active cycle while its database lock is held
- PASSED: only a completed marketplace settlement marks sold; replay does not duplicate seller earnings
- PASSED: zero published posts is reported honestly while retaining the payable listing
- PASSED: concurrent manual requests cannot overlap and pause clears queued cycles
- PASSED: listing failure rolls back beat and royalty rows and removes public/audio uploads
- PASSED: silent audio is rejected before listing even without renderer quality metadata
- PASSED: renderer failure lists nothing, releases the slot and records backoff

## tests/payment-processing/business-integrity-postgres.test.mjs

`python3 scripts/testing/run-commerce.py --only business-integrity-postgres.test`

- PASSED: real isolated PostgreSQL: ownership, concurrent caps, shipping rejection, reservation rollback and expiry

## tests/payment-processing/business-integrity.test.mjs

`python3 scripts/testing/run-commerce.py --only business-integrity.test`

- PASSED: settlement excludes pending attackers on listing and beat paths, preserves approved splits, fences legacy payouts
- PASSED: royalty mutations require resource ownership and serialize resource-wide caps
- PASSED: mounted royalty write routes use ownership service rather than direct writes

## tests/payment-processing/database-commerce.test.mjs

`python3 scripts/testing/run-commerce.py --only database-commerce.test`

- PASSED: durable checkout SQL serializes retries, rolls back order receipts, and fences expired unknown payments
- PASSED: applies additive 0022/0023 migrations and books one balanced, allocated order atomically
- PASSED: rolls back source, allocations, journal, revenue, and order status when fulfillment is not ready
- PASSED: concurrent duplicate settlements serialize on the production advisory lock
- PASSED: rejects a reused PaymentIntent attached to another order
- PASSED: database deferred constraint also rejects unbalanced journals at COMMIT
- PASSED: reserves against funded payable, idempotently, and rejects over-reservation
- PASSED: concurrent same-key requests for conflicting payout accounts have one immutable winner
- PASSED: pays a claimed reservation through the engine's real SQL state transitions
- PASSED: refund authorization, duplicate intent, partial reversal, and over-refund guardrails
- PASSED: full refund creates balanced reversal, exposes the debt, then recovers it exactly once
- PASSED: production commerce webhook inbox deduplicates concurrent duplicate events
- SKIPPED: real Stripe test-mode checkout and PaymentIntent settle through production code in disposable SQL

## tests/payment-processing/inbound-billing.test.mjs

`python3 scripts/testing/run-commerce.py --only inbound-billing.test`

- PASSED: billing transaction routes execute cancellation, payment setup, portal, invoice, retry, refund, 3DS, and dispute contracts

## tests/payment-processing/inbound-commerce.test.mjs

`python3 scripts/testing/run-commerce.py --only inbound-commerce.test`

- PASSED: marketplace checkout freezes database pricing, metadata identity, and provider idempotency
- PASSED: merchant checkout enforces buyer ownership, trusts reserved cents, and settles only paid matching sessions
- PASSED: growth merchandise checkout validates shipping and immutable subtotal before provider create
- PASSED: growth merchandise reservation prices from catalog, fences command replay, and applies verified payment events once
- PASSED: billing create-checkout route executes canonical price catalog and rejects caller-supplied prices

## tests/payment-processing/inbound-known-failures.mjs

`python3 scripts/testing/run-commerce.py --only inbound-known-failures`

- PASSED: billing checkout retries reuse the durable session for the same command
- PASSED: storefront cart retries reuse one session and one set of pending orders
- PASSED: beat purchase completion verifies the payment before recording a sale
- PASSED: beat purchase completion grants a sale only with the verified charge amount
- PASSED: Stripe beat-payment verification rejects unpaid, mispriced, and misattributed intents

## tests/payment-processing/inbound-legacy-services.test.mjs

`python3 scripts/testing/run-commerce.py --only inbound-legacy-services.test`

- PASSED: actual storefront membership service prices tiers, subscribes, and cancels with customer ownership
- PASSED: legacy marketplace service delegates frozen checkout and creates/reuses Connect onboarding accounts
- PASSED: legacy StripeService and BeatService execute subscription/payment-intent purchase functions

## tests/payment-processing/inbound-registration.test.mjs

`python3 scripts/testing/run-commerce.py --only inbound-registration.test`

- PASSED: registration checkout, verification, and account creation execute payment/plan gates before any account write

## tests/payment-processing/inbound-storefront.test.mjs

`python3 scripts/testing/run-commerce.py --only inbound-storefront.test`

- PASSED: storefront cart executes auth, ownership, catalog pricing, amount, metadata, and order creation contracts

## tests/payment-processing/outbound-commerce.mjs

`python3 scripts/testing/run-commerce.py --only outbound-commerce`

- PASSED: Stripe commerce provider uses immutable transfer/refund/reversal keys and Connect-scoped payout calls
- PASSED: CommerceEngine retains reservations on provider ambiguity and reverses before releasing failed bank payouts
- PASSED: CommerceEngine blocks unpaid sources and applies successful refund compensation only after provider confirmation
- PASSED: requestCommercePayout requires verified Connect capability and binds the durable request to the account
- PASSED: verifiedPayment requires succeeded exact-currency provider settlement and separates pending from completed refunds
- PASSED: royalty funding accepts only finalized statements with exact settled top-up net and excludes marketplace cash
- PASSED: payout webhook verifies Connect account ownership before resuming the operation

## tests/payment-processing/outbound-membership-auth.mjs

`python3 scripts/testing/run-commerce.py --only outbound-membership-auth`

- PASSED: storefront membership tier mutations require ownership of the tier's parent storefront

## tests/payment-processing/outbound-services-webhooks.mjs

`python3 scripts/testing/run-commerce.py --only outbound-services-webhooks`

- PASSED: StripeService refunds enforce buyer scope and pass validated exact cents and stable key to commerce
- PASSED: refund request orchestration persists one idempotent operation and leaves failed execution retryable
- PASSED: Connect onboarding creates an Express account with requested capabilities and exact return URLs
- PASSED: charge refund/dispute reconciliation sums provider states, releases won holds, and writes operation identities
- PASSED: actual webhook signature middleware preserves raw-byte signature boundary and rejects invalid, missing, or unconfigured signatures
- PASSED: webhook receipt transaction retries failed settlement and ignores a successfully replayed duplicate
- PASSED: repository payout idempotency cannot silently move a reserved withdrawal to a different Connect account
- PASSED: refund provider failure preserves the same operation key for retry

## tests/payment-processing/outbound-stripe-resource-ownership.test.mjs

`python3 scripts/testing/run-commerce.py --only outbound-stripe-resource-ownership.test`

- PASSED: referenced shared or another run's products are never cleanup-owned

## tests/payment-processing/outbound-stripe-test-transport.test.mjs

`python3 scripts/testing/run-commerce.py --only outbound-stripe-test-transport.test`

- PASSED: dedicated test transport rejects live and unsupported opaque bindings
- PASSED: a test-looking key cannot mutate before actual test-mode balance verification
- PASSED: test transport rejects foreign destinations and non-dedicated credentials

## tests/payment-processing/outbound-topup-journal.mjs

`python3 scripts/testing/run-commerce.py --only outbound-topup-journal`

- PASSED: lost top-up create response remains unresolved through a later successful run
- PASSED: legacy creation-in-flight journal cannot masquerade as no cleanup needed
- PASSED: preflight-only blocker and verified owned cleanup retain distinct verdicts

## tests/unit/beat-sale-money-loop.test.ts

`python3 scripts/testing/run-commerce.py --only legacy-beat`

- PASSED: A. Royalty split ledger > writes a royalty_transactions row with the correct amount
- PASSED: A. Royalty split ledger > increments royalty_splits.total_earned and pending_payout
- PASSED: A. Royalty split ledger > does NOT double-credit on a second call (idempotency)
- PASSED: B. Revenue events > records a revenue_events row with source='marketplace'
- PASSED: B. Revenue events > ON CONFLICT: a second revenue_events insert is a no-op
- PASSED: C. Sale notifications — confirmed payment idempotency > processPayment on completed order delivers beat_sold + beat_purchased notifications
- PASSED: C. Sale notifications — confirmed payment idempotency > replay — second processPayment call produces no additional notifications
- PASSED: C. Sale notifications — confirmed payment idempotency > concurrent calls — only one delivery wins; exactly one notification per recipient
- PASSED: C. Sale notifications — confirmed payment idempotency > failure resets notifStatus so the next retry can re-attempt delivery
- PASSED: C. Sale notifications — confirmed payment idempotency > no beat_sold notification from initiation-time route send
- PASSED: D. Content-dispatch — beat-loop posts > beat-loop post was inserted with _beatMoneyLoop marker and overdue scheduledAt
- PASSED: D. Content-dispatch — beat-loop posts > runContentDispatch query selects the overdue beat-loop post
- PASSED: D. Content-dispatch — beat-loop posts > publishToPlatform enqueues a job without throwing
- PASSED: D. Content-dispatch — beat-loop posts > post transitions to published after successful dispatch

## tests/payment-processing/real-stripe-api.mjs

`python3 scripts/testing/run-commerce.py --only provider-report-summary`

Bundled CLI assertions verify result/cleanup aggregation and diagnostic redaction. No individual JUnit case count is fabricated.

