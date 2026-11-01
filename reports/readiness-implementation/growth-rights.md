# Growth and rights implementation

## Status and scope

Recommended A approaches only. Code implements local portions of GR-1–5; **this is not a production-ready certification**. Application remained stopped. No providers, live database, secret values, migrations, workflows or full compiler/test suite were accessed/run.

| Audit | Status | Wired implementation | Remaining release gates |
|---|---|---|---|
| GR-1 | Partial; external integration blocked | Both mounted campaign send and Fan Hub broadcast now enqueue immutable content and consented recipient snapshots, persist claims before sending, and record provider receipts. Stable command keys deduplicate repeated requests. Real Resend no-retry adapter requires an acceptance ID; missing/ambiguous outcomes are quarantined, never reported delivered or blindly resent. Fan Hub history reads ledger outcomes and resumes pending batches; campaign send resumes its existing command. | Apply migration 0092. Main/notification owner must wire authenticated provider callbacks and scheduled drain/reconciliation described below. Provider-accepted/process-crash ambiguity still requires provider reconciliation; no exactly-once claim. Authorized restart, DB-failure, callback replay and provider tests remain. |
| GR-2 | Partial | Persistent artist/email permission registry; manual/imported contacts do not gain permission. Fan Hub “Request email consent” sends a real invitation with expiring single-use confirmation token; GET renders a CSRF-protected confirmation form and POST confirms. Per-recipient unsubscribe links persist suppression independently of contact deletion. Send claims recheck consent. Verified bounce/complaint handler suppresses matching existing addresses. | Apply 0092; confirm global CSRF middleware supplies token and URL-encoded form parsing on mounted public capability routes. Configure HTTPS APP_URL/PUBLIC_APP_URL and verified sender. Provider callbacks remain external integration gate. Consent policy/version/IP evidence and a fan-initiated re-consent flow after suppression remain incomplete; verify regulatory copy, artist identity disclosure and invitation abuse controls. No assertion of legal compliance. |
| GR-3 | Partial; commerce integration blocked | Mounted POST /api/merch/checkout is a real order producer: server-owned catalog prices, immutable order lines, integer-cent calculation, serialized idempotency keys, deterministic inventory locks and reservations, existing merch_orders records. Mounted buyer UI /merch?artist=ARTIST_ID calls it. Verified payment ingestion atomically marks paid orders, records unique events, updates sold quantities, releases stock only on provider-confirmed expiry, and accounts cumulative partial/full refunds. Fulfillment cannot manually promote unpaid native checkout orders. Stats use collected less refunded money, not pending order totals. | Apply 0093. Commerce must install payment adapter and verified event dispatcher below. Native variants, partial shipments/returns, merchant tax/shipping policy, provider-abandoned-session reconciliation and seller payout linkage remain incomplete. Variant products explicitly do not enter checkout; this limitation is NOT claimed as implementing variant checkout. No payment was attempted. |
| GR-4 | Addressed in local mutation paths; release validation pending | Shared validator on create, amendment and validation endpoints enforces finite numeric ranges, unique IDs/emails and 100% total (absolute tolerance 0.000001 percentage points). Dedicated repository serializes sign/amend with parent-row lock; immutable normalized revisions and per-revision assent rows preserve signers. Amendment resets current assent; signature hashes include content hash, revision and actor. Read returns revision/hash and checks ownership/participation. Explicit signature and reviewed revision required. First revision archives old signature JSON as historical-unverified evidence, not valid assent. | Apply 0091. Run isolated Postgres simultaneous-sign/amend/rollback tests before release (mock transaction tests are not real DB evidence). Existing API clients must send reviewed revision; ordinary Contracts page uses separate contract flow and was not changed. Historical sheets are lazily normalized at first mutation, not silently backfilled active. Existing invalid allocations require explicit complete amendment. |
| GR-5 | Addressed misleading claims locally; evidence pipeline remains partial | Mounted forecast service preserves observed zero and outlier rates, returns null accuracy/MAPE when insufficient, reports sample/excluded-zero counts, and scores zero actuals with MAE. Nullish prediction selection preserves measured zero. v2 provenance discloses heuristic assumptions, sample window/count, unverified currency and assumed rates/baseline; UI displays these. Fixed 70% royalties removed: entitlement is null without authoritative rights attribution. Historical stored forecasts marked unverified; accuracy comparisons only use v2. Forecast horizon requires integer months; zero-baseline growth no longer becomes one; baseline streams aggregate calendar-month span rather than row-count-as-days. | Authoritative closed-period actual comparisons, multi-currency ingestion and rights attribution remain external financial-data gates. No invented replacement entitlement. Scenario confidence remains explicitly uncalibrated, not measured coverage. No calibrated financial prediction claim. |

## Migrations (authored, **NOT APPLIED**)

- `0091_growth_split_revisions.sql`: immutable split revision and assent records.
- `0092_growth_fan_delivery.sql`: consent, command, recipient and provider event records/indexes.
- `0093_growth_merch_checkout.sql`: payment/reservation evidence and provider event dedup attached to existing order/catalog models.

Earlier working filenames 0019/0020/0021 were removed to avoid concurrent domain numbering collisions. No shared/schema.ts changes required: focused repositories use parameterized SQL. Main must register these migrations with the deployment's actual migration runner/manifest if it does not discover SQL files. Do not enable dependent routes on a database without these migrations. Migration application is an explicit operator release gate, not performed here.

## Required integration patches / interfaces

### Fan mail transport and callbacks (notification/main owner)

Implemented `server/services/fanMailAdapter.ts`:

- `sendTransactionalNoRetry({ commandKey, to, subject, html })`
- Receipt union: `{ status: "accepted", provider: "resend", providerMessageId }` or `{ status: "unknown", reason }`.
- Uses existing installed Resend SDK directly; forwards stable provider idempotency key; **does not invoke the shared incomplete retry queue**. Requires RESEND_API_KEY and RESEND_FROM_EMAIL (or existing SENDGRID_FROM_EMAIL). No secrets read during implementation.
- Local uniqueness `(artist_id, command_key)` and `(command_id,email)` governs dedup. Provider idempotency retention does not justify retries of unknown outcomes.

In the notification-owned authenticated Resend webhook dispatcher, after signature/account verification, call:

`applyVerifiedFanMailEvent({ eventId, providerMessageId, type: "delivered" | "bounced" | "complained", occurredAt: Date })` from `fanDeliveryService.ts`.

It retains unmatched events (callbacks can precede receipt persistence); receipt writes and callbacks serialize on provider ID and reconcile in either order. Complaint/bounce precedence prevents a late delivery event re-enabling a suppressed contact. Do not expose this function as an unauthenticated body-trusting route.

Main worker integration: schedule the exported `drainPendingFanDeliveries(commandLimit = 10)` through the existing owner-managed scheduler. It selects persisted commands with pending recipients and invokes `processFanDelivery(commandId, artistId, 50)`. Authenticated UI resume already invokes the same real consumer, so pending messages are not dead configuration. Do not reset `sending` or `unknown` to `pending` on timeout. Operator/provider reconciliation must identify the stable command's receipt before accepting/retrying uncertain effects. Outstanding unknown claims are intentionally not represented as deliveries.

### Native merch commerce interface (commerce/main owner)

`server/services/merchCheckoutService.ts` exports `installMerchPaymentAdapter(adapter)`.

Adapter `createCheckout` receives:

- orderId and stable `merch:ORDER_ID` idempotencyKey;
- buyerEmail, currency `"usd"`, integer subtotalCents;
- immutable lines `{name, quantity, unitAmountCents}` and shippingAddress;
- returns `{ checkoutId, checkoutUrl }` (HTTPS, real provider checkout).

In the existing commerce initialization module (not edited here), import and call `installMerchPaymentAdapter({ createCheckout })` with its actual processor implementation. Provider checkout must retain order ID metadata, use server lines, persist/idempotently recover sessions, collect/quote shipping and tax according to the seller's real policy, and prohibit client price overrides. Do not mark orders paid on the browser redirect. If the processor cannot meet these obligations, native merch remains blocked, not falsely complete.

In commerce's verified webhook dispatcher call:

`applyVerifiedMerchPayment({ eventId, orderId, checkoutId, currency, type: "paid" | "expired" | "refunded", amountCents })`.

For `paid`, amount is actual collected total including verified provider shipping/tax; it must cover immutable subtotal. For `refunded`, amount is cumulative actual refunded cents. `expired` must mean provider-confirmed unpayable, not elapsed local time. Dispatcher must verify account, merchant/order metadata and payment status before calling; retry out-of-order refund-before-payment events rather than dropping them. These local functions do not create seller ledger credits: commerce must couple its ledger entries/payout eligibility to the same verified event idempotency contract.

No shared routes.ts/index.ts edits are necessary for existing fan/merch/contracts/forecast mounts. Scheduling and commerce adapter initialization belong in owner-managed startup modules; no workflow changes were made. New buyer component is reachable through existing MerchStore page's artist query mode; no App.tsx edit.

## Executed evidence

- `env -i PATH="$PATH" NODE_ENV=test ./node_modules/.bin/vitest run --config tests/growth-rights.vitest.config.ts`: **32 tests passed** (three focused files; no setup loading application/credentials).
- Pure allocation cases: valid/empty/duplicate/under/over/nonfinite/string/negative percentages and identity validation.
- Mocked serialized repository: concurrent signers retained, legacy assent archived not reused, amendment invalidation, stale revision conflict, invalid amendment, actor/signature requirements.
- Mocked provider: stable idempotency forwarded, real receipt required, explicit missing configuration, timeout/error/missing receipt never auto-retried.
- Mocked fan ledger: claim precedes external effect; pending-only resume, withdrawn consent, accepted-but-unrecorded DB failure, ambiguous failure quarantine and HTML escaping/unsubscribe rendering.
- Mocked forecast DB: no-data accuracy, zero-actual MAE, zero/outlier rates, zero prediction preservation, disclosed no-data scenario/null rights.
- Merch integer-cent validation.
- Isolated esbuild parse of all changed domain TS/TSX passed. No full tsc, application start, live provider or database test performed; no screenshots because app is stopped.

Tests do not establish SQL migration compatibility, real transactional behavior, end-to-end mail receipt, live checkout, taxes, payouts or predictive calibration. Those remain the release gates above rather than success claims.