# Current launch blockers and implemented corrections

## Acceptance boundary — owner clarification

Pre-deployment acceptance uses isolated production-process simulations. The owner
cannot publish until this work is accepted; publishing, real charges or deliveries,
and restoring actual published user content are therefore not prerequisites for
closing the implementation work. Published-artifact observation is a later
operational check, not a circular launch blocker.

Too Lost configuration is environment-based and the owner supplies the same
configuration in development and production. Do not presume a separate production
OAuth setup or request a reconnect solely because an acceptance probe returned 403.
Verify the probe against the actual configured authentication and provider contract.
Keep any genuine authorization failure explicit rather than treating configuration
parity as proof that every endpoint is authorized.

Simulation results must identify simulated external boundaries and exercise the real
application consumers. They do not claim real provider settlement, delivery, or
credential revocation. Actual implementation failures and unexecuted required
simulation checks remain open; post-publication checks are separate.

## Current authoritative pre-deployment decision

### Build-entrypoint reconciliation after the packed run

Review identified that the legacy `build.sh` separately installed incomplete
Python dependencies and emitted serial xz/gzip capsules incompatible with the
current restore contract. It now changes to the project root and executes
`DEPLOY_PACK=1 npm run build`, using the same canonical builder already tested
below. Its obsolete fast path, independent installer, and legacy packer were
removed. Three process-boundary tests verify working directory, environment,
arguments, and failure-exit propagation; shell syntax also passed.

This wrapper-only correction happened after the retained packed run. That run
proves the canonical builder and runtime; it is not a claim that the changed
wrapper was separately rebuilt end to end. The configured Replit Reserved VM
already uses the canonical command. The unrelated legacy `Dockerfile.prod` is
not covered by this Replit deployment acceptance.

Preview restoration was separately verified after the scaled simulation: the
landing page rendered and all six `/api/ready` subsystems reported `ok`, including
the supervised loaded model. Private sidecar entries explicitly disable
`exposeLocalhost`; zero public sidecar mappings remained after startup.

**PASS — SCALED TWO-WORKER PRE-DEPLOYMENT SIMULATION; NOT PRODUCTION
THROUGHPUT OR PUBLICATION ACCEPTANCE.** The latest preserved report for
`2026-09-23T18-57-24-314Z` has result `PASS`, with `copy`, `build`, `size`,
`restore`, and `startup` complete and no recorded failures. The current-source
canonical build exited **0**; all five freshly packed capsule hashes match
their manifests; cold critical/background restores exited **0**, and warm
restore idempotence passed. The **4-effective-CPU / 8-GiB-cgroup** development
VM used `CLUSTER_WORKERS=2` with `APP_WORKER_CPU_SHARE=0.5`: two logical app
workers time-shared the existing **one-CPU total app role budget**, not two
dedicated CPUs. MaxCore retained its one-CPU role budget and default worker
share; Python, sidecar, per-worker memory minima and headroom stayed reserved.
The sizing preflight admitted two app workers with **1,219 MiB** each (731 MiB
V8 heap), one MaxCore worker, and the unchanged role memory reservations.
The owner's **production Reserved VM is 16 vCPUs / 64 GiB**; its default
app-worker CPU share remains **1**. This scaled run does not measure production
VM throughput or fabricate host capacity.

Historical evidence is retained separately: the prior `DISABLE_CLUSTER=true`
single-process attempt passed only its own model/readiness/150-request scope.
The subsequent cluster attempt in `-attempt-3.json` failed at packed
`dist/compute-sizing.mjs` admission with the former default one-CPU-per-worker
rule: `floor(4 × 0.25) = 1`, so two workers then required at least 8 effective
CPUs. Its post-launcher Redis-no-PONG/generic dependency classification was
not causal; owned Redis had answered PONG and the disposable schema push
succeeded. The old failed report is preserved, not rewritten. The newly
packaged **opt-in** 0.5-share policy enables the present scaled simulation
without weakening the production default or claiming an app/DB/Redis defect.

Publication is owner-controlled and is not a pre-deployment gate. No publication,
real charge, provider mutation, settlement, message delivery, or write to an
actual provider was performed or is claimed.

### Current six-gate status

1. **Model serving — PASS in the scaled cluster simulation.** The owned packaged
   Python service returned HTTP 200 from `/api/health` with `status=healthy` and
   `model_loaded=true`; `/health` matched. The direct `/api/warm/status` diagnostic
   returned 401 and was nonmandatory, not used to waive a gate.
2. **Runtime acceptance — PASS in the scaled cluster simulation.** One live
   cluster primary (PID 4109) and two live app HTTP workers (PIDs 4126 and
   4138) passed topology; MaxCore's root PID 4133 belonged only to the primary,
   with no worker-owned root, and the local PDIM listener ran in primary PID
   4109. Three public `/api/ready` HTTP 200 `ok` probes were spaced **6,031 ms**
   and **6,039 ms** apart; database, Redis, routes, audit, automation and
   MaxCore all reported `ok`. Authenticated warmup passed **20/20**. Packed
   measured load passed **150/150**, 100% success, **P95 150.836 ms /
   P99 179.888 ms**, against the unchanged **99% / 500 ms / 1,000 ms** gates.
   This is scaled development-VM throughput, not a production-VM measurement.
3. **PDIM recovery — PASS for the authorized pre-deployment simulation
   boundary.** The separately retained-PDIM recovery simulation passed with
   real HybridStorage, PocketDimension, local PDIM, generation-bound readback,
   independent bundled restore workers, two owners, cross-owner deduplication,
   and corrupt-byte rejection; its external object-store boundary was simulated.
   In the latest real packed app, normal protected admin session/MFA/CSRF
   created a recovery job with HTTP **202** on worker **4126**; the other
   worker **4138** returned HTTP **200** for its lookup (job state `running`).
   The job was present in the private durable store. Primary-owned PDIM was
   verified. This proves durable cross-worker lookup, **not** successful
   external backup or recovery of live production-user content.
4. **Credential handling — PASS for the pre-deployment boundary.** The canonical
   run used an environment allowlist, generated simulation-only secrets,
   namespace-local dependencies, and no source credentials. It did not print,
   replace, revoke, or infer real credentials. Provider-side credential rotation
   remains an operational/provider fact, not a simulated claim.
5. **Provider/finance acceptance — PASS for the authorized simulation boundary.**
   Real application consumers and disposable PostgreSQL exercised the retained
   provider-process scenarios. External acceptance was simulated; shared/live
   databases and actual-provider writes, charges, payouts, settlement, delivery,
   and financial reconciliation were not performed or claimed.
6. **Release artifact — PASS for the scoped simulation.** The current-source
   canonical build exited **0**, all five capsule manifests and hashes matched,
   and cold critical/background plus warm idempotent restores passed. The build
   retains parallel packing of four independent capsules. Sanitized build
   preflight was **1.48 GiB** = **1.17 GiB** payload + **0.31 GiB**
   deduplicated Nix closure (**10/10** roots); the measured disposable footprint
   was **4.729 GiB**, under 8 GiB. Preflight is not a measured target-image
   closure. The build ran in a distinct unprivileged user/network namespace,
   never in the source checkout. Controlled teardown recorded startup exit
   **143** after acceptance; the disposable copy remains retained for audit.

The latest five actual capsule SHA-256 values were independently rehashed
against their manifests: node modules
`488b3024f671e9cd9de91366ebab9b565d2ceb173386092c5ebf3fb520364f80`,
app remainder
`b7987e72a000064ed57908a315c24433290e657c873c3cc54d0bfe5d873433d0`,
Python runtime
`30faf249073ff785f24b470f39995753ff1237b95dd4d1dbd184874a351bf49f`,
MaxCore
`e28be8e367323d38e45245abf801072d999a2fd1c56d68646d44f55926498ff5`,
and PDIM
`3a23d7e017ed2afc1434e10a5cc62f5bee0d40e1241c0be27f0e823d3e18111b`.
All 17 approved refreshed source paths also match their current checkout hashes
and the preserved disposable copy (including `server/computeSizing.ts` and its
focused test); external harness execution hash matches the refreshed snapshot.

Historical **single-process** capsule hashes, not the latest build: node modules
`54cdaadd1887499b28abb5e2bb2c6e4e4edc0db9387ee1de21952327aa0cff1e`,
app remainder
`660f7aeebe29d341cf70fc6e954b6d97b9a24824aaf4ec790239008ec34cee92`,
Python runtime
`b8f58a15ffbb97d9c22fc3b0f4379ddc72f128e8f7f5122a4ed5c83e5716a515`,
MaxCore
`916541e34baffdd3fd9241394c83e4793e45446dc2bda0ab42d9471a192f52d4`,
and PDIM
`5021a6d8bcbc982ecfd536d505c4890bf1e4a4702547dabe5f776fee17e00687`.

After the earlier single-process run, the main preview restart also succeeded
after externally added private-port mappings for 8090, 9878, and 9879 were
corrected. That historical preview observation is not the scaled cluster
acceptance evidence above.

## Historical continuation: running application and verified model

**Historical prior evidence; superseded by the current authoritative
pre-deployment decision above.** This section formerly superseded still earlier
point-in-time observations.

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
  OAuth scopes and complete release pagination are corrected in source. Callback
  selection now follows `TOOLOST_ENVIRONMENT`, not application deployment mode;
  the shared sandbox configuration therefore selects the same callback in both.
  The changed Too Lost checks passed 26/26. The isolated sales 403 is not a
  presumed missing production connection. See `../provider-acceptance-current.md`.
- Protected admin/verified-2FA/CSRF PDIM recovery jobs now retain private backups,
  read exact generations back and verify through an independent restored worker.
  Production packaging includes that worker. A new retained-recovery simulation
  passed through real storage consumers, two independent verifier processes, two
  owners, deduplicated content, generation-bound retention/readback, and rejection
  of corrupted retained bytes. Only the external storage SDK was simulated.
  This closes pre-deployment recovery acceptance, not a claim about live data.

### Historical six-gate status — superseded

The open items in this subsection are prior **NOT READY** observations and are
not the current decision.

1. **Model serving:** verified locally; validate incorporation through packed-runtime
   simulation, not prior publication. Held-out quality is not claimed.
2. **Runtime acceptance:** startup and isolated auth/load pass. Full packed
   cold-image/load/soak and controlled sidecar restart acceptance remain open.
3. **PDIM recovery:** pre-deployment acceptance passed using representative isolated
   data and the real restore worker. Actual published-user-content recovery is not
   a prerequisite. See `retained-pdim-recovery-drill.json`.
4. **Credential handling:** verify environment-driven configuration and fail-closed
   handling without printing or replacing working credentials. Simulation cannot
   prove real provider-side revocation; lack of Secret metadata alone does not prove
   a configured integration is unusable or that source/browser artifacts expose
   secrets. This provider review demonstrated no such exposure. Separately tracked
   credential-custody work is not silently declared complete.
5. **Provider/finance acceptance:** real-consumer lifecycle simulations and shared-env
   read-only checks are the pre-deployment evidence. Investigate the Too Lost earnings
   403 was isolated to the unused royalty-summary method; existing account/catalog/
   release/analytics reads passed. Do not use the unverified sales parser for money
   backfill. No separate production reconnect is prescribed.
6. **Release artifact:** packed-build and cold-start simulation are pre-deployment
   requirements. Publication remains owner-controlled, with observation afterward.
   No publish was performed and no blanket launch-ready claim is made.

## Historical retained-recovery and commerce rollout result — superseded

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

## Historical production observations — superseded

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

## Historical implemented corrections

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

## Historical verification

- Stripe fake-provider tests: 12 passed; no live charges/provider mutations.
- Local PDIM/client/supervisor tests: 25 passed.
- MaxCore circuit recovery tests: 7 passed.
- Admin lifecycle/verifier tests: 2 passed.
- Final server and client typechecks passed.
- Frontend-only Vite build passed.
- Real isolated assembled HTTP authentication and Chromium login/session/logout
  passed after a tooling navigation race was corrected. Disposable cleanup passed.
- See `assembled-acceptance-drill.json` for evidence and explicitly untested scope.

## Historical items formerly not cleared — superseded

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

## Historical credential-free continuation — superseded

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

Historical decision at that point: **NOT READY**. It is retained only as
point-in-time provenance. The current decision is the scoped scaled-cluster
**PASS** at the top of this document, not a production throughput or
publication claim. Publication remains an owner-controlled later operation.