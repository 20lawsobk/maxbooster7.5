# Production-parameter commerce/provider process simulation

**SIMULATION — deterministic local Stripe and TooLost contract transports; no real API acceptance is claimed.**
Run: 2026-09-23T13:38:53.787Z
Revision: fbe555cf1a910ffdc9ab7d7d6fd696b3b2e3f2dd
Isolation: parent and workers use allowlisted env-i-derived environments. Workers preload the socket egress guard, which rejects every non-loopback TCP/TLS destination and all UDP. PostgreSQL listened only on a private temporary Unix socket (`listen_addresses=''`). No external credentials, Neon/shared database, TCP provider endpoint, or financial API write was used.

## Thresholds defined before execution
- Accepted-effect rows per immutable source/provider command: exactly 1.
- Unbalanced committed journals: 0.
- Cross-currency arithmetic: 0; every query and journal remains currency-partitioned (USD exercised; other currencies not combined).
- Mismatched callback settlement effects: 0; callback must match frozen payment, amount, and currency.
- Lost-response retries: unresolved state must remain durable; provider create count must stay 1 after list/reconcile.
- Durable successful webhook receipts: exactly 1 per event; failed callbacks receive no receipt.

## Effective parameters
- Sale: USD 10,000 cents gross; 1,000 platform fee; 320 processor fee; 500 tax; 8,500 seller allocation.
- Withdrawal: USD 5,000 cents; standard simulated payout; repository risk and allocation checks enabled.
- Retry/restart: transfer response loss, process restart, payout response loss, reconciliation retry; webhook duplicate delayed until restart.
- TooLost: one Spotify release; accepted checkpoint followed by response loss; restart retry must be blocked pending reconciliation.
- Worker timeout: 120 seconds each; operation leases deterministically expired only to model elapsed retry delay.

## Critical source hashes
- server/services/commerce/repository.ts: SHA256 5380a9aafb6f4e598ceff597c9549f7ad6e3f5111ae8779998f6a431ede9bfc9
- server/services/commerce/engine.ts: SHA256 94aa248f4ded66e695125dc429145641871e2dcfa545f1b40876d7f95c7e6c05
- server/services/commerce/provider.ts: SHA256 9041a95dd944dd63a8bcc3e366754e9bb1aa4e27d0350bb21580ea870a0de0e2
- server/services/commerceWebhookRepository.ts: SHA256 888e5c8ce04c1b090c8ca902594d5ba1e018795c351959d3f15e75ebf4f3bb30
- server/services/distributionSubmissionRepository.ts: SHA256 54035fd6f7ceb12d5a145355b8addc7193f5cd727f58a6f24f94670cb02bff24
- server/routes/distribution-toolost-submission.ts: SHA256 e95a62632efc5898c3025e76bd09df5baabb035cb42ddc4a108a0ab0acb03c9d
- migrations/0023_commerce_settlement.sql: SHA256 3f1ca96deba38c5f1584cd4eaef72727005d50ddf5ce48879c5002f26d52f58c

## Results
### first
- PASS: mismatched callback rejected without settlement
- PASS: actual durable webhook repository settled one frozen sale
- PASS: accepted-before-response-loss created one simulated transfer
- PASS: lost response remains unresolved and reserved, not acknowledged
- PASS: TooLost accepted checkpoint is durable and ambiguous result is unknown
- Trace: processCommerceEvent -> CommerceRepository.book -> marketplace order/license entitlement
- Trace: CommerceRepository.reserve -> CommerceEngine -> StripeCommerceProvider.transfer(simulated)
- Trace: submitToolostRelease -> submitDistributionOnce -> simulated TooLost transport
### restart
- PASS: delayed duplicate callback skipped after process restart
- PASS: ambiguous TooLost acceptance is not blindly repeated after restart
- PASS: retry discovered prior transfer and created one simulated payout
- PASS: second retry discovered accepted payout and completed durable operation
- PASS: provider recovery produced no duplicate accepted effects
- Trace: restart -> Stripe provider list/reconcile -> CommerceRepository.paid
- PASS: provider accepted create counts {"transfer":1,"payout":1,"toolost":1}.
- PASS: actual SQL effect counts {"sources":1,"revenue_events":1,"withdrawals":1,"order_status":"completed","license_url":"/api/marketplace/orders/sim-order/license"}.
- PASS: committed journal balance query returned 0 failures. Actual journals: [{"id":"paid:wd_0c3a8aa3e08aac4faf0d0e669cdba69333fc48d179342459c858927badd2456a","currency":"usd","total":"0","lines":2},{"id":"reserve:wd_0c3a8aa3e08aac4faf0d0e669cdba69333fc48d179342459c858927badd2456a","currency":"usd","total":"0","lines":2},{"id":"sale:sim-order","currency":"usd","total":"0","lines":5}].
- PASS: durable receipts: [{"event_id":"evt_sale","event_type":"checkout.session.completed"}].
- Currency-partitioned account totals (actual SQL, not expected constants): [{"currency":"usd","account":"disbursed","cents":"5000"},{"currency":"usd","account":"payable","cents":"3500"},{"currency":"usd","account":"platform_clearing","cents":"-9680"},{"currency":"usd","account":"platform_fee","cents":"1000"},{"currency":"usd","account":"processor_expense","cents":"-320"},{"currency":"usd","account":"reserved","cents":"0"},{"currency":"usd","account":"tax_liability","cents":"500"}].

## Coverage and honest limits
Exercised: actual CommerceRepository booking/reserve/paid SQL; actual CommerceEngine; actual StripeCommerceProvider lookup-before-create contract against a local simulator; actual durable webhook inbox/receipt handler; actual TooLost route payload/platform resolution and distribution submission repository; marketplace completion/license readiness path.
Unexercised/unsupported here: real Stripe signatures/HTTP SDK transport, real TooLost HTTP/account catalog, refunds/disputes/reversals/bank-return, tax remittance, multi-currency FX/conversion, Connect account authorization, notification delivery, storefront/merch/subscription handlers, network partitions longer than lease, concurrency/load, and any live/shared migration. USD currency isolation was exercised; no claim is made that an FX path exists.
Outcome: PASS for this credential-free disposable synthetic-database simulation only. Production provider acceptance remains NOT TESTED.
