# Current launch blockers and implemented corrections

## Verified production observations

- Published `/api/health` responded 200; `/api/ready` responded 200 with
  MaxCore degraded/half-open. Other reported subsystems were healthy.
  This is evidence about the existing published revision, not the unshipped fixes.
- Read-only inspection of the real external `NEON_DATABASE_URL` database found
  `api_keys` but no `commerce_operations`, `commerce_webhook_inbox`, or
  `commerce_webhook_receipts`. Checkout and webhook durability cannot be certified
  until the existing commerce migrations are safely applied.
- Secret-existence metadata did not confirm Stripe keys or NEON_DATABASE_URL as
  Secrets in this workspace. Runtime configuration can still supply them; this
  is not proof that the Stripe account is unconfigured. The separate credential
  migration work must preserve working configuration and use secure provisioning.

## Implemented corrections

- Checkout validates canonical Stripe Price amount, currency, type and cadence;
  lifetime no longer constructs its amount independently of the verified Price.
- Durable per-user checkout operation, payload-conflict rejection, stable Stripe
  creation keys, provider-ID retention, completed-receipt replay, and bounded
  ambiguous retries prevent blind recreation after provider idempotency expiry.
- Recurring checkout uses the installed Stripe confirmation-secret contract.
- Missing checkout persistence fails explicitly before provider calls.
- Admin-issued API keys now use the canonical admin scope; the existing real
  hashed issuance/revocation flow was retained rather than replaced.
- Local PDIM recovery probes work without obsolete remote credentials and require
  PONG. Unsupported commands fail explicitly; real HMGET/ZPOPMIN paths passed.
- MaxCore supervisor readiness requires its owned child. Generation fast-failure
  releases half-open probe reservations, and meaningful model-ready health
  responses recover the circuit; arbitrary 200/boot responses cannot.
- Workflow command corrected to `npm run dev`; no unsafe shared-data app boot
  was used to manufacture acceptance.
- Repaired database adapter type inference and narrowed libpq environment typing.
- Browser harness handles bounded document-context transitions correctly.

## Verification

- Stripe fake-provider tests: 12 passed; no live charges/provider mutations.
- Local PDIM/client/supervisor tests: 25 passed.
- MaxCore circuit recovery tests: 7 passed.
- Admin lifecycle/verifier tests: 2 passed.
- Final server and client typechecks passed.
- Frontend-only Vite build passed.
- Real isolated assembled HTTP authentication and Chromium login/session/logout
  passed after a tooling navigation race was corrected. Disposable cleanup passed.
- See `assembled-acceptance-drill.json` for evidence and explicitly untested scope.

## Not yet cleared

1. Retained recovery backup and documented live-migration gate, followed by the
   exact additive commerce migrations 0022/0023 with collision preflight and
   post-apply verification. The earlier restore drill removed its private scratch
   and is not a retained backup. No live DDL was performed in this pass.
2. Credential migration/rotation where tracked configuration holds credentials;
   no values were disclosed or silently removed here.
3. Publication and verification of the corrected local MaxCore runtime. Existing
   live half-open status cannot be claimed repaired before deploying these changes
   and checking actual local service/model health.
4. Full provider delivery, financial reconciliation, retained disaster recovery,
   and representative cold-image/load acceptance remain unproven. Historical
   optional feature gaps are not automatically treated as launch blockers.

Release decision: **NOT READY**. The code defects above were repaired; absent
production schema, retained recovery, and deployment evidence are not waived.