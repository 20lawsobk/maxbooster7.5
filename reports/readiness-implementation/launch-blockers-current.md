# Current launch blockers and implemented corrections

## Latest continuation: running application, verified model, remaining external gates

This section supersedes conflicting earlier point-in-time observations below.

- The screenshot's startup failure is fixed: app local port 5000 maps to public
  80; Redis is explicitly private, with no external port. The checker accepts
  legitimate private entries and rejects internal services on any public port.
- Redis now has an owned loopback lifecycle in development and production,
  requires PONG before consumers start, persists its queue data, and shuts down
  only its owned child. Runtime shell helpers survive deployment packaging.
- After a fresh retained backup and restored-copy rehearsal, the exact three
  worker migrations and nine additional readiness migrations were applied
  atomically in their respective approved batches. All 31 readiness tables and
  234 columns exist. Existing commerce and session schemas were preserved.
  See `worker-schema-migration-live-receipt.json` and
  `readiness-nine-migration-live-receipt.json` for pinned hashes and external
  immutable-generation receipts.
- Application startup succeeded, the landing page rendered, health returned
  200, and readiness reported database/Redis/routes/MaxCore `ok` (audit was
  still `unknown: initializing` at capture). The owned Python model health
  returned `model_loaded: true`. This is development, not published evidence.
- The original checkpoint passed safe strict loading and two actual serving
  forwards with finite identical logits. Its active copy is restored and the
  original preserved. A release manifest and required capsule member bind
  checkpoint bytes to the production build. Held-out quality is not claimed.
- The real CSRF cache collision is fixed in production middleware; no test
  cache-buster remains. Isolated authenticated load passed 150/150 requests:
  steady P95/P99 273.86/329.54ms, spike 396.74/492.55ms. MaxCore and real
  providers were excluded from this load harness.
- Stripe account and catalog read-only acceptance passed. Too Lost account,
  catalog, releases and analytics reads passed; earnings returned a scope 403.
  OAuth scopes and complete release pagination are corrected in source.
- Protected admin/verified-2FA/CSRF PDIM recovery jobs now retain private backups,
  read exact generations back and verify through an independent restored worker.
  Production packaging includes that worker. Actual production-data execution
  remains pending; the empty development store does not establish production
  content status.

### Six-gate status

1. **Model serving:** verified locally; production incorporation still needs
   publication. Full media acceptance and held-out quality are not claimed.
2. **Runtime acceptance:** startup and isolated auth/load pass. Full packed
   cold-image/load/soak and controlled sidecar restart acceptance remain open.
3. **PDIM recovery:** implementation and isolated proof pass; execute the protected
   retained recovery job against the published authoritative store.
4. **Credential custody/rotation:** owner action remains; live Stripe and Neon
   runtime configuration is not confirmed as Replit Secrets. Working credentials
   were not deleted, exposed or silently replaced.
5. **Provider/finance acceptance:** reconnect Too Lost with `read:earnings`;
   real delivery/payment lifecycle and historical financial reconciliation remain
   separate from the passing simulations/read-only checks.
6. **Publication:** owner must publish, followed by artifact-bound verification.
   No publish was performed and no blanket launch-ready claim is made.

## Superseding retained-recovery and commerce rollout result

The owner's explicit Replit App Storage bucket is accessible. Managed App
Storage does not require access to GCS administrative IAM/PAP APIs: the earlier
403-based gate was incorrect. Authenticated object access and anonymous denial
were verified with a non-sensitive canary. Retention is until explicit deletion,
not WORM or a locked period.

The actual source database was backed up to that independent bucket. Downloading
the exact retained generation and restoring it into isolated PostgreSQL passed:
311 table counts/content hashes and 6,702 schema records matched. Backup and
manifest remain retained. See `database-recovery-drill.json`.

After seven real restored-database rehearsal checks passed, exactly
`0022_commerce_webhook_receipts.sql` and `0023_commerce_settlement.sql` were
committed to the actual application database in one transaction. Both live
catalog postconditions matched the exact expected schemas. The application did
not start, no provider operation ran, no existing balances were inferred or
backfilled, and no other migration was applied. A generation-pinned migration
receipt is retained separately. See `commerce-migration-live-receipt.json`.

This closes the retained **database** backup and exact commerce-schema portion
of gate 1 below. It does not certify independent PDIM disaster recovery,
credential rotation, provider acceptance, packed-runtime acceptance or publication.
The following earlier observations remain historical evidence, not current
claims that commerce tables are absent.

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

1. **Database recovery and commerce schema cleared:** retained App Storage backup,
   exact restore verification, and authorized atomic commerce migrations 0022/0023
   passed. See the generation-bound recovery and live migration receipts above.
   This does not cover independently retained actual PDIM user content.
2. Credential migration/rotation where tracked configuration holds credentials;
   no values were disclosed or silently removed here.
3. Publication and verification of the corrected local MaxCore runtime. Existing
   live half-open status cannot be claimed repaired before deploying these changes
   and checking actual local service/model health.
4. Full provider delivery, financial reconciliation, retained disaster recovery,
   and representative cold-image/load acceptance remain unproven. Historical
   optional feature gaps are not automatically treated as launch blockers.

## Credential-free simulation and local subsystem continuation

- Provider-process simulation passed against disposable real PostgreSQL, including
  accepted-before-response-loss, duplicate callbacks, mismatch rejection and a
  worker restart. All three committed journals balanced; external acceptance
  remains simulated, not certified.
- MaxCore's existing offline suites passed 494 tests with eight dependency skips.
  This is kernel/contract evidence, not full loaded-model or live HTTP acceptance.
- The active MaxCore checkpoint is absent. Safe tensor-only loading of the
  quarantined candidate passed, and all 71 tensor keys/shapes match both training
  and serving models after repairing the serving model's tied output-head
  declaration. Actual forward inference and trained-quality provenance remain
  unverified. Loader, watchdog and terminal readiness fixes have focused
  regression evidence in `model-readiness-current.md`; no candidate was promoted.
- Synthetic PDIM content restoration passed through the real hybrid storage and
  PocketDimension paths, including ownership checks and corrupt-transport
  rejection. This is not retained recovery of actual user content. See
  `pdim-content-recovery-drill.json`.
- Corrupt PocketDimension metadata and hybrid ownership indexes now fail closed
  rather than initialize empty stores. Eighteen focused tests and the real
  synthetic content restore drill passed, including corrupt-but-checksummed
  snapshot rejection without overwriting source records.
- Packed cold-boot and authenticated-load checks remain unexecuted: host memory
  admission failed, and native-descendant network namespace isolation is denied
  in this runner. These are test-environment limits, not reproduced app failures.
  See `credential-free-simulation-handoff.md` and the latest load report.

Release decision: **NOT READY**. Database schema and retained database recovery
are no longer blockers. Model serving, independently retained PDIM recovery,
credential/provider acceptance, runtime/load acceptance and publication evidence
remain unresolved.