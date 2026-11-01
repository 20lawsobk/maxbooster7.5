# Payment processing verification

These tests exercise existing payment code without starting the application,
its schedulers, or its shared database.

## Commands

```sh
# No credentials, network payment calls, or shared database:
node tests/payment-processing/run.mjs

# Focused deterministic refund/dispute overlap against a private PostgreSQL cluster:
node --test tests/payment-processing/compensation-races-postgres.test.mjs

# Explicit real Stripe TEST-mode objects and disposable local SQL:
node tests/payment-processing/run.mjs --stripe

# Exhaustive local payment files plus the isolated legacy beat-sale suite:
python3 scripts/testing/run-commerce.py
```

The remote command requires **only** `STRIPE_TEST_SECRET` (`sk_test_…`) and
`STRIPE_TEST_CLIENT` (`pk_test_…`). It does not fall back to production keys or
the Replit Stripe connection. Each remote suite verifies Stripe's `livemode`
and checks for enabled webhook endpoints before writes. An account with
enabled endpoints is not isolated: test events might reach shared application
data, so the suites block rather than disable those endpoints.

Remote tests create synthetic Stripe test resources, perform test payments and
refunds, and clean up their own resources. Provider/account restrictions are
reported separately from successful tests. Cleanup cannot remove Stripe's
historical test payment/refund records.

## Evidence boundaries

- **Production contracts:** execute actual service functions and route handlers,
  with application repositories and provider transport injected at boundaries.
  These establish payload, authorization, idempotency, and local behavior;
  they do not establish real Stripe acceptance.
- **Real Stripe API:** uses the two named credentials and documented test
  payment fixtures. Production commerce provider/verification code is used
  where supported; generic SDK probes are identified separately.
- **Real checkout handlers:** executes production payload builders against
  Stripe test mode, with isolated application state.
- **Disposable SQL:** uses a temporary PostgreSQL server with only a local
  Unix socket. Exercises production migrations/repository/settlement and can
  settle a real Stripe test payment when the remote command is selected.
- **Browser fixture:** renders the actual production subscription payment form
  with Stripe.js and Elements. Only surrounding authentication, notification
  and navigation dependencies are isolated. This checks the confirmation call,
  not the deployed application's login, subscription routing or live webhook.

Reports are written under `.local/payment-processing/`. Never interpret a
test Checkout Session, a mocked transport result, or a local SQL transaction
as proof that production onboarding, bank eligibility or deployed webhook
configuration works. Known failures remain failing assertions; unsupported
provider flows must remain blocked, not be marked as passed.

## Current findings

The October 25, 2026 credential-free rerun covers the payment Node entry files,
the legacy beat-sale suite and the provider report's offline self-check.
The integrated rerun also includes the newer refund/dispute and settlement
regressions. The legacy fixture supplies its own PostgreSQL and Redis services;
its first attempt without a queue backend is retained as diagnostic evidence.

See `docs/testing/commerce.md` for every file's purpose and exact invocation,
and `reports/test-verification/commerce/results.json` for the current machine
results. These local passes do not establish deployed provider delivery or
full production readiness. The explicit remote Stripe and browser entry points
were not rerun as part of this credential-free verification.

Real Stripe top-up creation/retrieval/cancellation is covered separately.
Automatic tax, Express dashboard links, transfers and bank payouts remain
limited by test-account setup. Retained immutable provider history and prior
unjournaled cleanup evidence remain explicitly unresolved.

Ownership manifests survive failed preflight. A lost creation response is
never treated as proof that no object exists; offline journal regressions
cover that case without making provider requests.

The human-readable evidence summary is
`reports/payment-processing-verification.html`. It separates production
contracts, real provider acceptance, disposable SQL, browser confirmation,
account blockers, and cleanup uncertainty.
## Refund/dispute overlap regression (2026-10-24)

The default offline runner also executes `compensation-races-postgres.test.mjs`
as a separate credential-free PostgreSQL group. PostgreSQL tools (`initdb`,
`pg_ctl`) must be on PATH. The test pauses an actual refund reconciler after its
source read, commits an explicit newer dispute transition, and resumes the older
refund event. It checks both newly created and won holds, spendable balances and
balanced SQL journals. Both scenarios failed before the fix and pass afterward.
Refund-only calls now preserve dispute state under the source transaction lock;
actual dispute handlers still explicitly apply provider-confirmed transitions.
This does not establish ordering of every possible concurrent dispute event,
live Stripe delivery, bank settlement or provider acceptance.
